/**
 * Blowing things up on purpose (GURPS Basic Set: Campaigns pp. 415, 484, 558).
 *
 * A charge is so many pounds of an explosive; its weight and relative
 * explosive force give its damage, and it goes off either packed against
 * something (a contact explosion: the most its dice could do to that thing)
 * or merely near it. The GM's Demolition tool asks for the charge and, where
 * it is blowing a door or a wall, the structure; it posts the blast as an
 * ordinary explosive damage card, which applies to tokens like any other, and
 * what it did to the structure on a card of its own.
 */

import { SYSTEM_ID } from "./constants.js";
import { isRuleOn } from "./optional-rules.js";
import { rollDamage } from "./roll.js";
import { explosiveById, offeredExplosives } from "./explosive-registry.js";
import { blastAgainstStructure, chargeDamage, type ChargeDamage, type StructureBlast } from "../rules/demolition.js";
import { blastAt } from "../rules/explosions.js";
import { formatDiceAdds, maxRoll } from "../rules/dice.js";
import { resolveSuccess } from "../rules/success.js";
import { SOUND_BUILDING_HT, WALLS } from "../rules/structures.js";

/** Where a charge goes off: packed against the thing, or merely near it. */
export type ChargePlacement = "contact" | "nearby";

/** A structure a charge is set against (p. 558 gives DR and HP per hex of wall). */
export interface DemolitionTarget {
  /** What it is, for the card. */
  label?: string;
  dr: number;
  hp: number;
  /** Damage it had already taken. */
  damageTaken?: number;
  /** True once it has failed the roll zero hit points called for. */
  failedDisabling?: boolean;
  /** Its HT; 12 for a structure in good repair (p. 558). */
  ht?: number;
}

export interface DetonateOptions {
  /** An explosive by id: a Basic Set row's (`tnt`) or a registered `<module>.<key>`. */
  explosive?: string;
  /** Its REF, for an explosive that is on no list; ignored when `explosive` is known. */
  ref?: number;
  /** The charge's weight in pounds. */
  weightLbs: number;
  /** `contact` (the default) or `nearby`. */
  placement?: ChargePlacement;
  /** How far a `nearby` charge is from the structure, in yards (1). */
  distanceYards?: number;
  /** The door, wall or other structure it is set against, or none. */
  structure?: DemolitionTarget | null;
  /** Who the cards speak for; the user where none. */
  actor?: any;
  /** A name for the charge in place of "1 lb of TNT". */
  label?: string;
}

export interface Detonation {
  charge: ChargeDamage;
  ref: number;
  /** The damage the card rolled. */
  basicDamage: number;
  /** What it did to the structure, or null where there was none. */
  structure: (StructureBlast & { damage: number; dr: number; maxHp: number; held: boolean | null; stands: boolean | null }) | null;
}

const D = (key: string) => game.i18n.localize(`GWORLD.Demolition.${key}`);
const DF = (key: string, data: Record<string, unknown>) => game.i18n.format(`GWORLD.Demolition.${key}`, data);

async function rollHt(ht: number): Promise<{ roll: any; success: boolean }> {
  const roll = new Roll("3d6");
  await roll.evaluate();
  const faces = (roll.dice?.[0]?.results ?? []).map((r: { result: number }) => r.result);
  return { roll, success: resolveSuccess(Number(roll.total), ht, faces).success };
}

/**
 * Sets off a charge (since API 1.74.0): posts its damage card, and a card for
 * the structure it was set against. Null where the charge is no charge -- no
 * weight, or no explosive and no REF.
 */
export async function detonateCharge(options: DetonateOptions): Promise<Detonation | null> {
  const known = options.explosive ? explosiveById(String(options.explosive)) : null;
  const ref = known?.ref ?? Number(options.ref);
  const weight = Number(options.weightLbs);
  const charge = chargeDamage(weight, ref);
  if (!charge) {
    ui.notifications?.warn(D("NoCharge"));
    return null;
  }
  const placement: ChargePlacement = options.placement === "nearby" ? "nearby" : "contact";
  const what = known?.label ?? DF("OfRef", { ref });
  const label = options.label?.trim() || DF("ChargeLabel", { weight, explosive: what, notation: charge.notation });

  // The blast itself: an ordinary crushing explosion, which the card applies
  // to whoever the GM picks -- the one it was packed against as a contact
  // blast, everyone else by their distance.
  const basicDamage = await rollDamage({
    actor: options.actor ?? null,
    label,
    formula: formatDiceAdds(charge.dice),
    damageType: "cr",
    explosive: true,
    blastPlacement: placement === "contact" ? "contact" : "",
    source: "demolition",
    distanceYards: null,
  });
  // A listener refused the blast's roll (since API 1.154.0): nothing went off.
  if (basicDamage === null) return null;

  const target = options.structure;
  if (!target || !(Number(target.hp) > 0)) return { charge, ref, basicDamage, structure: null };

  // Packed against it, the structure takes the most the dice could do (p. 415);
  // set down nearby, it takes the collateral share of what was rolled.
  const distance = Math.max(0, Number(options.distanceYards ?? 1) || 0);
  const damage = placement === "contact"
    ? maxRoll(charge.dice)
    : blastAt({ rolledDamage: basicDamage, distanceYards: distance, diceOfDamage: charge.diceOfDamage }).damage;
  const dr = Math.max(0, Math.floor(Number(target.dr) || 0));
  const maxHp = Math.max(1, Math.floor(Number(target.hp) || 0));
  const hit = blastAgainstStructure({ damage, dr, hp: maxHp, damageTaken: target.damageTaken, failedDisabling: target.failedDisabling });
  const ht = Number.isFinite(Number(target.ht)) && Number(target.ht) > 0 ? Math.floor(Number(target.ht)) : SOUND_BUILDING_HT;

  const lines = [
    placement === "contact"
      ? DF("AgainstContact", { damage, dr })
      : DF("AgainstNearby", { damage, dr, distance }),
    DF("Injury", { injury: hit.injury, hp: maxHp, now: hit.hp }),
  ];
  const rolls: any[] = [];
  let held: boolean | null = null;
  let stands: boolean | null = null;
  let state: string = hit.state;
  if (hit.rollsToStand) {
    const { roll, success } = await rollHt(ht);
    rolls.push(roll);
    stands = success;
    state = success ? "failing" : "collapsed";
    lines.push(DF("Roll", { roll: roll.total, ht }));
  } else if (hit.rollsToHold) {
    const { roll, success } = await rollHt(ht);
    rolls.push(roll);
    held = success;
    state = success ? "standing" : "breached";
    lines.push(DF("Roll", { roll: roll.total, ht }));
  }
  lines.push(D(`State.${state}`));

  const content = await foundry.applications.handlebars.renderTemplate(`systems/${SYSTEM_ID}/templates/chat/life.hbs`, {
    name: target.label?.trim() || D("Structure"),
    kind: D("Title"),
    detail: label,
    lines,
    bad: state === "breached" || state === "collapsed",
    good: state === "standing" && hit.injury === 0,
  });
  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor: options.actor ?? null }),
    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    content,
    rolls,
  });

  return { charge, ref, basicDamage, structure: { ...hit, damage, dr, maxHp, held, stands } };
}

// ── the GM's tool ───────────────────────────────────────────────────────────

const esc = (text: unknown) => foundry.utils.escapeHTML(String(text ?? ""));

function row(label: string, control: string): string {
  return `<label style="display:flex;align-items:center;justify-content:space-between;gap:8px"><span>${label}</span>${control}</label>`;
}

/** Asks for a charge and what it is set against. */
export async function promptForCharge(): Promise<DetonateOptions | null> {
  const explosives = offeredExplosives()
    .map((e) => `<option value="${esc(e.id)}"${e.id === "tnt" ? " selected" : ""}>${esc(DF("ExplosiveOption", { label: e.label, ref: e.ref }))}</option>`)
    .join("");
  const walls = WALLS.map((w, i) => `<option value="${i}">${esc(DF("StructureOption", { name: w.name, dr: w.dr, hp: w.hp }))}</option>`).join("");
  const content = `<div class="gworld" style="display:flex;flex-direction:column;gap:6px">
    ${row(D("ExplosiveLabel"), `<select name="explosive" style="width:240px">${explosives}</select>`)}
    ${row(D("Weight"), `<input type="number" name="weight" value="1" min="0" step="any" style="width:90px">`)}
    ${row(D("Placement"), `<select name="placement" style="width:240px"><option value="contact">${esc(D("Placements.contact"))}</option><option value="nearby">${esc(D("Placements.nearby"))}</option></select>`)}
    ${row(D("Distance"), `<input type="number" name="distance" value="1" min="0" step="any" style="width:90px">`)}
    ${row(D("Target"), `<select name="structure" style="width:240px"><option value="">${esc(D("NoStructure"))}</option><option value="custom">${esc(D("CustomStructure"))}</option>${walls}</select>`)}
    ${row(D("CustomDr"), `<input type="number" name="dr" value="0" min="0" step="1" style="width:90px">`)}
    ${row(D("CustomHp"), `<input type="number" name="hp" value="0" min="0" step="1" style="width:90px">`)}
    ${row(D("DamageTaken"), `<input type="number" name="taken" value="0" min="0" step="1" style="width:90px">`)}
    <p class="ihint" style="margin:0">${esc(D("Hint"))}</p>
  </div>`;
  const result = await foundry.applications.api.DialogV2.prompt({
    window: { title: D("Title") },
    content,
    ok: {
      label: D("Detonate"),
      callback: (_event: Event, button: HTMLElement) => {
        const form = button.closest<HTMLElement>(".application");
        const value = (name: string) => form?.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`)?.value ?? "";
        const picked = value("structure");
        const wall = picked && picked !== "custom" ? WALLS[Number(picked)] : null;
        const structure: DemolitionTarget | null = wall
          ? { label: wall.name, dr: wall.dr, hp: wall.hp, damageTaken: Number(value("taken")) || 0 }
          : picked === "custom"
            ? { label: D("CustomStructure"), dr: Number(value("dr")) || 0, hp: Number(value("hp")) || 0, damageTaken: Number(value("taken")) || 0 }
            : null;
        return {
          explosive: value("explosive"),
          weightLbs: Number(value("weight")) || 0,
          placement: value("placement") === "nearby" ? "nearby" : "contact",
          distanceYards: Number(value("distance")) || 0,
          structure,
        } satisfies DetonateOptions;
      },
    },
    rejectClose: false,
  });
  return result && typeof result === "object" ? (result as DetonateOptions) : null;
}

/** Opens the Demolition tool: asks, then detonates, speaking for the one controlled token if any. */
export async function openDemolitionTool(): Promise<Detonation | null> {
  if (!game.user?.isGM || !isRuleOn("explosions")) return null;
  const asked = await promptForCharge();
  if (!asked) return null;
  const controlled = canvas?.tokens?.controlled ?? [];
  return detonateCharge({ ...asked, actor: controlled.length === 1 ? controlled[0]?.actor ?? null : null });
}

/** Adds the Demolition tool to the token controls, for the GM, while explosions are in play. */
export function registerDemolitionTool(): void {
  Hooks.on("getSceneControlButtons", (controls: Record<string, any>) => {
    const tokens = controls?.tokens;
    if (!tokens) return;
    tokens.tools ??= {};
    tokens.tools["gworld-demolition"] = {
      name: "gworld-demolition",
      title: "GWORLD.Demolition.Title",
      icon: "fa-solid fa-bomb",
      order: Object.keys(tokens.tools).length + 1,
      button: true,
      visible: Boolean(game.user?.isGM) && isRuleOn("explosions"),
      onChange: () => {
        void openDemolitionTool().catch((error) => console.warn("gworld | the Demolition tool failed", error));
      },
    };
  });
}
