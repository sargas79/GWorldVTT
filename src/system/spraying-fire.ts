/**
 * Spraying Fire (GURPS Basic Set: Campaigns p. 409): one burst from a weapon
 * of RoF 5+ split among several targeted tokens, each its own rapid-fire
 * attack roll at the shots aimed at it.
 *
 * The dialog puts the targets in the order the burst sweeps across them,
 * measures the yards between each and the one before, and says what the
 * sweep wastes; the attacks themselves are the ordinary ranged attack, rolled
 * once per target with that target alone targeted.
 */

import { SPREAD_FIRE_MIN_RATE_OF_FIRE, sprayingFire } from "../rules/ranged.js";
import { isRuleOn } from "./optional-rules.js";
import { targetedTokens } from "./targets.js";

/** One target's share of the burst, as the attack roll is told it. */
export interface SprayShot {
  /** Which target this is, from 0, and how many there are. */
  index: number;
  count: number;
  /** Shots aimed at this target. */
  shots: number;
  /** Recoil for this target's hits: the weapon's, +1 for each target before it. */
  recoil: number;
  /** Shots wasted swinging to this target from the one before. */
  wasted: number;
}

/** A burst planned over several tokens, in the order it sweeps them. */
export interface SprayPlan {
  tokens: any[];
  shots: SprayShot[];
}

/** The widest angle, in degrees, the targets of one burst may spread over (Campaigns p. 409). */
const SPRAY_ARC_DEGREES = 30;

/** Whether a ranged attack from this row may spray its fire now. */
export function maySpray(dataset: DOMStringMap, targetCount: number): boolean {
  return (
    dataset.rollType === "attack" &&
    dataset.ranged === "1" &&
    targetCount >= 2 &&
    isRuleOn("rapidFire") &&
    dataset.noSprayingFire !== "1" &&
    Number(dataset.rateOfFire) >= SPREAD_FIRE_MIN_RATE_OF_FIRE &&
    // What is left in the weapon must still make a spray.
    (dataset.loaded === undefined || dataset.loaded === "" || Number(dataset.loaded) >= SPREAD_FIRE_MIN_RATE_OF_FIRE)
  );
}

function centreOf(token: any): { x: number; y: number } | null {
  const c = token?.center;
  return c && Number.isFinite(c.x) && Number.isFinite(c.y) ? { x: c.x, y: c.y } : null;
}

/**
 * The targets in the order a burst sweeps them from one side to the other,
 * seen from the shooter, and how wide an angle they spread over. Where the
 * shooter or a target has no place on the map, the order is the targeting
 * order and the spread unknown.
 */
export function sweepOrder(shooter: { x: number; y: number } | null, targets: Array<{ x: number; y: number } | null>): { order: number[]; spreadDegrees: number | null } {
  const indices = targets.map((_, i) => i);
  if (!shooter || targets.some((t) => !t)) return { order: indices, spreadDegrees: null };
  const bearings = targets.map((t) => Math.atan2(t!.y - shooter.y, t!.x - shooter.x));
  // Measured around the mean direction, so a spread across the -180/180 seam still reads small.
  const mean = Math.atan2(
    bearings.reduce((s, b) => s + Math.sin(b), 0),
    bearings.reduce((s, b) => s + Math.cos(b), 0),
  );
  const relative = bearings.map((b) => Math.atan2(Math.sin(b - mean), Math.cos(b - mean)));
  const order = [...indices].sort((a, b) => relative[a]! - relative[b]!);
  const spread = (Math.max(...relative) - Math.min(...relative)) * (180 / Math.PI);
  return { order, spreadDegrees: spread };
}

/**
 * Asks how a burst is spread over the targeted tokens. Resolves to the plan,
 * to "single" where the shooter would rather fire at one target as usual, or
 * to null where the attack is called off.
 */
export async function promptForSpray(options: {
  actor: any;
  rateOfFire: number;
  recoil: number;
  loaded: number | null;
  yardsBetween: (from: any, to: any) => number | null;
}): Promise<SprayPlan | "single" | null> {
  const L = (key: string) => game.i18n.localize(`GWORLD.Spraying.${key}`);
  const esc = foundry.utils.escapeHTML;
  const targets = targetedTokens().filter((t: any) => t?.actor);
  const shooter = options.actor?.getActiveTokens?.()?.[0] ?? null;
  const { order, spreadDegrees } = sweepOrder(centreOf(shooter), targets.map(centreOf));
  const rateOfFire = Math.max(1, Math.min(Math.floor(options.rateOfFire), options.loaded ?? Infinity));
  const recoil = Math.max(1, Math.floor(options.recoil) || 1);

  const ordered = (reverse: boolean) => (reverse ? [...order].reverse() : order).map((i) => targets[i]);
  const gaps = (tokens: any[]) => tokens.map((t, i) => (i === 0 ? 0 : options.yardsBetween(tokens[i - 1], t) ?? 0));

  // Shots start shared evenly over what the sweep leaves.
  const first = ordered(false);
  const firstGaps = gaps(first);
  const wastedAtFirst = sprayingFire({ rateOfFire, recoil, targets: first.map((_, i) => ({ shots: 1, yardsFromPrevious: firstGaps[i] })) })
    .attacks.reduce((s, a) => s + a.wasted, 0);
  const each = Math.max(1, Math.floor((rateOfFire - wastedAtFirst) / Math.max(1, first.length)));

  const rows = first
    .map((token, i) => `<div class="gw-spray-row" data-spray-row="${i}" style="display:grid;grid-template-columns:1fr 70px 70px;gap:6px;align-items:center">
        <span data-spray-name>${esc(String(token.name ?? token.actor?.name ?? ""))}</span>
        <input type="number" name="gap${i}" value="${firstGaps[i]}" min="0" step="1" ${i === 0 ? "disabled" : ""} title="${esc(L("Yards"))}">
        <input type="number" name="shots${i}" value="${each}" min="1" step="1" title="${esc(L("Shots"))}">
      </div>`)
    .join("");
  const wide = spreadDegrees !== null && spreadDegrees > SPRAY_ARC_DEGREES;
  const content = `<div class="gworld" style="display:flex;flex-direction:column;gap:6px">
      <p style="margin:0">${game.i18n.format("GWORLD.Spraying.Intro", { rof: rateOfFire, recoil })}</p>
      <label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <span>${L("Sweep")}</span>
        <select name="sweep" style="width:180px">
          <option value="forward">${esc(game.i18n.format("GWORLD.Spraying.From", { name: String(first[0]?.name ?? "") }))}</option>
          <option value="reverse">${esc(game.i18n.format("GWORLD.Spraying.From", { name: String(first[first.length - 1]?.name ?? "") }))}</option>
        </select>
      </label>
      <div style="display:grid;grid-template-columns:1fr 70px 70px;gap:6px;font-weight:bold">
        <span>${L("Target")}</span><span>${L("Yards")}</span><span>${L("Shots")}</span>
      </div>
      ${rows}
      ${wide ? `<p class="ihint warn" style="margin:0">${game.i18n.format("GWORLD.Spraying.TooWide", { degrees: Math.round(spreadDegrees!) })}</p>` : ""}
      <p class="ihint" style="margin:0" data-spray-summary></p>
    </div>`;

  // The rows keep their places; a reversed sweep reads them the other way.
  const read = (root: ParentNode | null) => {
    const reverse = root?.querySelector<HTMLSelectElement>('select[name="sweep"]')?.value === "reverse";
    const n = (name: string) => Number(root?.querySelector<HTMLInputElement>(`input[name="${name}"]`)?.value) || 0;
    const tokens = ordered(reverse);
    const rowOf = (token: any) => first.indexOf(token);
    const shots = tokens.map((t) => n(`shots${rowOf(t)}`));
    // A gap is between a target and the one before it in the sweep.
    const yards = tokens.map((t, i) => (i === 0 ? 0 : reverse ? n(`gap${rowOf(tokens[i - 1])}`) : n(`gap${rowOf(t)}`)));
    return { tokens, reverse, plan: sprayingFire({ rateOfFire, recoil, targets: tokens.map((_, i) => ({ shots: shots[i]!, yardsFromPrevious: yards[i] })) }) };
  };

  const answer = await foundry.applications.api.DialogV2.wait({
    window: { title: L("Title") },
    position: { width: 460 },
    content,
    render: (_event: Event, dialog: any) => {
      const root: HTMLElement = dialog.element ?? dialog;
      const update = () => {
        const { plan } = read(root);
        const slot = root.querySelector<HTMLElement>("[data-spray-summary]");
        if (!slot) return;
        const wasted = plan.attacks.reduce((s, a) => s + a.wasted, 0);
        slot.textContent = game.i18n.format("GWORLD.Spraying.Summary", { used: plan.shotsUsed, rof: rateOfFire, wasted });
        slot.classList.toggle("warn", plan.problem !== null);
      };
      root.addEventListener("input", update);
      root.addEventListener("change", update);
      update();
    },
    buttons: [
      {
        action: "spray",
        label: L("Fire"),
        default: true,
        callback: (_event: Event, button: HTMLElement) => {
          const { tokens, plan } = read(button.closest(".application"));
          return { tokens, plan };
        },
      },
      { action: "single", label: L("Single") },
      { action: "cancel", label: game.i18n.localize("GWORLD.Chat.Cancel") },
    ],
    rejectClose: false,
  });

  if (answer === "single") return "single";
  if (!answer || typeof answer !== "object") return null;
  const { tokens, plan } = answer as { tokens: any[]; plan: ReturnType<typeof sprayingFire> };
  if (wide) {
    ui.notifications?.warn(game.i18n.format("GWORLD.Spraying.TooWide", { degrees: Math.round(spreadDegrees!) }));
    return null;
  }
  if (plan.problem) {
    ui.notifications?.warn(game.i18n.format(`GWORLD.Spraying.Problem.${plan.problem}`, { rof: rateOfFire, used: plan.shotsUsed }));
    return null;
  }
  return {
    tokens,
    shots: plan.attacks.map((a, index) => ({ index, count: plan.attacks.length, shots: a.shots, recoil: a.recoil, wasted: a.wasted })),
  };
}
