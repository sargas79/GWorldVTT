/**
 * Spending points on outcomes at the table (Influencing Success Rolls,
 * Campaigns p. 347).
 *
 * Unspent character points and the point pools add-on modules register pay
 * for the same things. A success roll's card offers to buy the roll up, a
 * damage card's flesh-wound offer draws on the pools, and a player can ask the
 * GM for a piece of guidance, which the GM prices and approves. It is in play
 * while a module's pool is.
 */

import { SYSTEM_ID } from "./constants.js";
import { anyPointPools, payFromPointPool, registeredPointPools } from "./roll-extensions.js";
import {
  guidanceCost,
  purchasableSteps,
  type GuidanceLevel,
  type OutcomeStep,
  type PointSource,
  type PointUse,
} from "../rules/bonus-points.js";

const L = (key: string) => game.i18n.localize(`GWORLD.BonusPoints.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`GWORLD.BonusPoints.${key}`, data);

/** A pool a character can spend from, as a dialog lists it. */
interface SourceOption {
  key: string;
  /** The pool by name, for the card to say where the points came from. */
  name: string;
  source: PointSource;
  label: string;
  available: number;
  gmCheck: boolean;
}

/** The pools a character has for a use, with what each holds and whether the GM must agree. */
export function sourcesFor(actor: any, use: PointUse, roll: { skill?: string } = {}): SourceOption[] {
  // Pools add-on modules registered join unspent points.
  const pools = registeredPointPools(actor, use, roll);
  if (pools.length === 0) return [];
  const out: SourceOption[] = [];
  const unspent = Number(actor.system?.derived?.points?.unspent ?? 0) || 0;
  out.push({ key: "unspent", name: L("UnspentName"), source: { kind: "unspent" }, label: F("Unspent", { value: unspent }), available: Math.max(0, unspent), gmCheck: false });
  for (const pool of pools) {
    out.push({
      key: `pool:${pool.registration}:${pool.id}`,
      name: pool.label,
      source: { kind: "pool", pool: pool.registration, id: pool.id },
      label: F("Pool", { label: pool.label, value: pool.available }),
      available: pool.available,
      gmCheck: pool.gmCheck,
    });
  }
  return out;
}

/**
 * Takes points from a pool. Unspent points go as a negative award on the
 * ledger, so a character in debt pays it back from the next award; a
 * module's pool pays however the module says.
 */
export async function spendPoints(
  actor: any,
  source: PointSource,
  amount: number,
  note: string,
  use: PointUse = "buySuccess",
  roll: { skill?: string } = {},
): Promise<boolean> {
  if (!actor?.isOwner && !game.user?.isGM) return false;
  if (source.kind === "pool") return payFromPointPool(actor, source, amount, note, use, roll);
  const awards = [...(actor.system?.points?.awards ?? []), { points: -amount, note, at: Date.now() }];
  await actor.update({ "system.points.awards": awards });
  return true;
}

/**
 * Charges a character's unspent points for a module's effect (since 1.39.0),
 * for its owner or the GM. Nothing is spent where the character hasn't
 * `amount` to spend.
 */
export async function spendUnspentPoints(actor: any, amount: number, note: string): Promise<boolean> {
  const points = Math.floor(Number(amount));
  if (!actor || !Number.isFinite(points) || points <= 0) return false;
  if (!actor.isOwner && !game.user?.isGM) return false;
  const unspent = Number(actor.system?.derived?.points?.unspent ?? 0) || 0;
  if (unspent < points) return false;
  return spendPoints(actor, { kind: "unspent" }, points, String(note ?? ""));
}

/** A dialog choosing a pool and, where there is a choice, what to buy. */
async function choose(title: string, sources: SourceOption[], options: Array<{ value: string; label: string }> | null, hint: string): Promise<{ source: SourceOption; option: string } | null> {
  if (!sources.length) {
    ui.notifications?.warn(L("NoSources"));
    return null;
  }
  const esc = foundry.utils.escapeHTML;
  const content = `<div class="gworld" style="display:flex;flex-direction:column;gap:6px">
    ${hint ? `<p class="ihint" style="margin:0">${esc(hint)}</p>` : ""}
    ${options ? `<label style="display:flex;gap:8px;justify-content:space-between;align-items:center"><span>${esc(L("BuyTo"))}</span><select name="option">${options.map((o) => `<option value="${esc(o.value)}">${esc(o.label)}</option>`).join("")}</select></label>` : ""}
    <label style="display:flex;gap:8px;justify-content:space-between;align-items:center"><span>${esc(L("PayFrom"))}</span><select name="source">${sources.map((s) => `<option value="${esc(s.key)}">${esc(s.label)}${s.gmCheck ? " *" : ""}</option>`).join("")}</select></label>
    ${sources.some((s) => s.gmCheck) ? `<p class="ihint" style="margin:0">${esc(L("GmCheckHint"))}</p>` : ""}
  </div>`;
  const answer = await foundry.applications.api.DialogV2.prompt({
    window: { title },
    content,
    ok: {
      label: L("Spend"),
      callback: (_event: Event, button: HTMLElement) => {
        const form = button.closest<HTMLElement>(".application");
        return {
          source: form?.querySelector<HTMLSelectElement>('select[name="source"]')?.value ?? "",
          option: form?.querySelector<HTMLSelectElement>('select[name="option"]')?.value ?? "",
        };
      },
    },
    rejectClose: false,
  });
  if (!answer || typeof answer !== "object") return null;
  const picked = sources.find((s) => s.key === (answer as any).source);
  return picked ? { source: picked, option: String((answer as any).option ?? "") } : null;
}

// ── buying successes ─────────────────────────────────────────────────────────

/** What a success roll's card remembers for buying it up. */
export interface SuccessRollFlag {
  actorUuid: string;
  skill: string;
  step: OutcomeStep;
  combat: boolean;
  /** An attack that missed: the defense card it would have posted, had it hit. */
  onSuccess?: object;
  bought?: string;
}

/** Whether points can be spent on outcomes at all: while a module's pool is in play. */
export function spendingInPlay(): boolean {
  return anyPointPools();
}

/** Whether a roll of this kind is a roll in combat, where a critical cannot be bought. */
export function isCombatRoll(actor: any, kind: string): boolean {
  if (kind === "attack" || kind === "defense") return true;
  const combat = (game as any).combat;
  return Boolean(combat?.started && combat.combatants?.some?.((c: any) => c.actor?.uuid === actor?.uuid));
}

/** Offers to buy a success roll up, to whoever owns the character who rolled it. */
export async function addBuySuccessControls(message: any, html: HTMLElement): Promise<void> {
  const flag = message?.getFlag?.(SYSTEM_ID, "successRoll") as SuccessRollFlag | undefined;
  if (!flag || flag.bought || !spendingInPlay()) return;
  const root = html.querySelector<HTMLElement>(".gworld-chat");
  if (!root || root.querySelector("[data-gworld-buy]")) return;
  const actor: any = await fromUuid(flag.actorUuid).catch(() => null);
  if (!actor?.isOwner) return;
  const steps = purchasableSteps(flag.step, { combat: flag.combat });
  if (!steps.length) return;
  const row = document.createElement("div");
  row.className = "gc-apply";
  row.dataset.gworldBuy = "1";
  const button = document.createElement("button");
  button.type = "button";
  button.className = "gc-apply-button";
  button.textContent = L("BuySuccess");
  button.title = L("BuySuccessHint");
  button.addEventListener("click", () => void buySuccess(message, actor, flag));
  row.append(button);
  root.append(row);
}

async function buySuccess(message: any, actor: any, flag: SuccessRollFlag): Promise<void> {
  const steps = purchasableSteps(flag.step, { combat: flag.combat });
  const sources = sourcesFor(actor, "buySuccess", { skill: flag.skill });
  const picked = await choose(
    L("BuySuccess"),
    sources,
    steps.map((s) => ({ value: s.step, label: F("StepCost", { step: L(`Step.${s.step}`), cost: s.cost }) })),
    flag.combat ? L("CombatHint") : "",
  );
  if (!picked) return;
  const step = steps.find((s) => s.step === picked.option);
  if (!step) return;
  if (picked.source.source.kind !== "unspent" && picked.source.available < step.cost) {
    ui.notifications?.warn(L("NotEnough"));
    return;
  }
  if (!(await spendPoints(actor, picked.source.source, step.cost, F("BoughtNote", { step: L(`Step.${step.step}`) }), "buySuccess", { skill: flag.skill }))) return;
  const text = F("Bought", { step: L(`Step.${step.step}`), cost: step.cost, source: picked.source.name });
  const content = String(message.content ?? "").replace(/<\/div>\s*$/, `<div class="gc-result success">${foundry.utils.escapeHTML(text)}</div></div>`);
  const hit = flag.onSuccess && (step.step === "success" || step.step === "criticalSuccess") && (flag.step === "failure" || flag.step === "criticalFailure");
  // A whole flags object and a dotted flags key in one update do not mix: the
  // object is expanded after the key and replaces it. So where a miss becomes
  // a hit, what was bought goes inside the flags that carry the defense.
  if (hit) {
    const flags = foundry.utils.mergeObject(foundry.utils.deepClone(message.flags ?? {}), flag.onSuccess as object);
    foundry.utils.setProperty(flags, `${SYSTEM_ID}.successRoll.bought`, step.step);
    await message.update({ content, flags });
  } else {
    await message.update({ content, [`flags.${SYSTEM_ID}.successRoll.bought`]: step.step });
  }
}

// ── flesh wounds ─────────────────────────────────────────────────────────────

/** Pays for a flesh wound from a pool the player picks. False where nothing was paid. */
export async function payForFleshWound(actor: any, cost: number): Promise<boolean> {
  const picked = await choose(L("FleshWound"), sourcesFor(actor, "fleshWound"), null, L("FleshWoundHint"));
  if (!picked) return false;
  if (picked.source.source.kind !== "unspent" && picked.source.available < cost) {
    ui.notifications?.warn(L("NotEnough"));
    return false;
  }
  return spendPoints(actor, picked.source.source, cost, L("FleshWound"), "fleshWound");
}

// ── player guidance ──────────────────────────────────────────────────────────

/** Asks the GM for a plausible addition to the scene, paid from a pool the player names. */
export async function requestGuidance(actor: any): Promise<void> {
  if (!spendingInPlay() || !actor?.isOwner) return;
  const sources = sourcesFor(actor, "guidance");
  if (!sources.length) {
    ui.notifications?.warn(L("NoSources"));
    return;
  }
  const esc = foundry.utils.escapeHTML;
  const answer = await foundry.applications.api.DialogV2.prompt({
    window: { title: L("Guidance") },
    content: `<div class="gworld" style="display:flex;flex-direction:column;gap:6px">
      <p class="ihint" style="margin:0">${esc(L("GuidanceHint"))}</p>
      <textarea name="text" rows="3" placeholder="${esc(L("GuidancePlaceholder"))}"></textarea>
      <label style="display:flex;gap:8px;justify-content:space-between;align-items:center"><span>${esc(L("PayFrom"))}</span><select name="source">${sources.map((s) => `<option value="${esc(s.key)}">${esc(s.label)}${s.gmCheck ? " *" : ""}</option>`).join("")}</select></label>
      <label style="display:flex;gap:6px;align-items:center"><input type="checkbox" name="critical"> ${esc(L("AfterCritical"))}</label>
    </div>`,
    ok: {
      label: L("Ask"),
      callback: (_event: Event, button: HTMLElement) => {
        const form = button.closest<HTMLElement>(".application");
        return {
          text: form?.querySelector<HTMLTextAreaElement>('textarea[name="text"]')?.value ?? "",
          source: form?.querySelector<HTMLSelectElement>('select[name="source"]')?.value ?? "",
          critical: form?.querySelector<HTMLInputElement>('input[name="critical"]')?.checked ?? false,
        };
      },
    },
    rejectClose: false,
  });
  if (!answer || typeof answer !== "object" || !String((answer as any).text).trim()) return;
  const source = sources.find((s) => s.key === (answer as any).source);
  if (!source) return;
  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    content: `<div class="gworld gworld-chat"><div class="gc-head"><span class="gc-label">${esc(L("Guidance"))}</span>`
      + `<span class="gc-target">${esc(source.label)}</span></div><div class="gc-note">${esc(String((answer as any).text))}</div></div>`,
    flags: { [SYSTEM_ID]: { guidance: { actorUuid: String(actor.uuid), source: source.source, critical: Boolean((answer as any).critical), gmCheck: source.gmCheck } } },
  });
}

/** The GM's prices for a guidance request: minor, moderate or major, or refused. */
export async function addGuidanceControls(message: any, html: HTMLElement): Promise<void> {
  const flag = message?.getFlag?.(SYSTEM_ID, "guidance");
  if (!flag || flag.settled || !game.user?.isGM) return;
  const root = html.querySelector<HTMLElement>(".gworld-chat");
  if (!root || root.querySelector("[data-gworld-guidance]")) return;
  const row = document.createElement("div");
  row.className = "gc-apply";
  row.dataset.gworldGuidance = "1";
  for (const level of ["minor", "moderate", "major"] as GuidanceLevel[]) {
    const cost = guidanceCost(level, Boolean(flag.critical));
    const button = document.createElement("button");
    button.type = "button";
    button.className = "gc-apply-button";
    button.textContent = F("Price", { level: L(`Level.${level}`), cost });
    button.addEventListener("click", () => void settleGuidance(message, flag, level, cost));
    row.append(button);
  }
  const refuse = document.createElement("button");
  refuse.type = "button";
  refuse.className = "gc-apply-button";
  refuse.textContent = L("Refuse");
  refuse.addEventListener("click", () => void settleGuidance(message, flag, null, 0));
  row.append(refuse);
  root.append(row);
}

async function settleGuidance(message: any, flag: any, level: GuidanceLevel | null, cost: number): Promise<void> {
  const actor: any = await fromUuid(flag.actorUuid).catch(() => null);
  if (!actor) return;
  let text = L("Refused");
  if (level) {
    const available = sourcesFor(actor, "guidance").find((s) => JSON.stringify(s.source) === JSON.stringify(flag.source));
    if (!available || (available.source.kind !== "unspent" && available.available < cost)) {
      ui.notifications?.warn(L("NotEnough"));
      return;
    }
    if (!(await spendPoints(actor, flag.source, cost, L("Guidance"), "guidance"))) return;
    text = F("Approved", { level: L(`Level.${level}`), cost });
  }
  const content = String(message.content ?? "").replace(/<\/div>\s*$/, `<div class="gc-result ${level ? "success" : "failure"}">${foundry.utils.escapeHTML(text)}</div></div>`);
  await message.update({ content, [`flags.${SYSTEM_ID}.guidance.settled`]: true });
}
