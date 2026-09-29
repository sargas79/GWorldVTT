/**
 * The Revised edition's optional ranged rules in play (Basic Set Revised
 * pp. 576-577): the attack dialog's extra fields and the lines they add,
 * Simplified Range, the armour coverage roll and the large-target wounding
 * table. The sums are in `rules/revised-ranged.ts`.
 */

import { isRuleOn } from "./optional-rules.js";
import { chosenManeuverOptions, registerManeuverOption } from "./procedure-extensions.js";
import {
  EVASIVE_MANEUVERS,
  RANGED_RAPID_STRIKE_PENALTY,
  bandForYards,
  bandPenalty,
  closeContactShot,
  combinedCoverage,
  coverageProtects,
  evasiveBonuses,
  firearmAttack,
  mayDodgeFirearm,
  nonCombatBonus,
  rangedRapidStrikeAllowed,
  rapidStrikeShare,
  shiftBand,
  strikeAroundPenalty,
  type ContactKind,
  type EvasiveDeclaration,
  type RangeBand,
} from "../rules/revised-ranged.js";
import { rangedToHitModifier } from "../rules/ranged.js";
import type { InjuryTolerance } from "../rules/injury-tolerance.js";

const L = (key: string, data?: Record<string, unknown>) =>
  data ? game.i18n.format(`GWORLD.RevisedRanged.${key}`, data) : game.i18n.localize(`GWORLD.RevisedRanged.${key}`);

/** What the extra fields of the ranged attack dialog collected. */
export interface RevisedRangedInput {
  contact: ContactKind;
  allOutDetermined: boolean;
  braced: boolean;
  unresisting: boolean;
  /** Armour coverage n of 6 the shooter is striking around, 0 for none. */
  strikeAround: number;
  nonCombat: { noRiskSelf: boolean; noRiskOthers: boolean; noStake: boolean; environment: number; known: boolean; person: boolean } | null;
  /** Levels of Deceptive Attack on a ranged attack (Prediction Shot). */
  prediction: number;
  rapidStrike: boolean;
  /** Simplified Range: a band the shooter moved to since the range was measured, or none. */
  bandShift: "none" | "closer" | "farther";
}

/** One line the dialog adds, before it is labelled. */
export interface RevisedLine {
  label: string;
  value: number;
  key: string;
}

export function simplifiedRangeOn(): boolean {
  return isRuleOn("simplifiedRange");
}

/** The band a range falls in, and its penalty, while Simplified Range is on. */
export function simplifiedRange(yards: number, shift: "none" | "closer" | "farther" = "none"): { band: RangeBand; penalty: number; shifted: boolean } {
  const measured = bandForYards(yards);
  // A Move or Move and Attack at Close or Short crosses into the next band (p. 577).
  const band = shift === "none" ? measured : shiftBand(measured, shift);
  return { band, penalty: bandPenalty(band), shifted: band !== measured };
}

const checkbox = (name: string, label: string) =>
  `<label style="display:flex;align-items:center;gap:8px"><input type="checkbox" name="${name}"><span>${label}</span></label>`;

/** The extra fields for the ranged dialog, empty where no switch is on. */
export function revisedRangedFields(rateOfFire: number): string {
  const parts: string[] = [];
  if (isRuleOn("closeContactShots")) {
    parts.push(`<fieldset style="border:1px solid var(--color-border-light-2,#999);padding:4px 8px">
      <legend>${L("CloseContact")}</legend>
      <label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <span>${L("Contact")}</span>
        <select name="rrContact" style="width:150px">
          <option value="none">${L("ContactNone")}</option>
          <option value="touching">${L("ContactTouching")}</option>
          <option value="pressed">${L("ContactPressed")}</option>
        </select>
      </label>
      ${checkbox("rrAllOut", L("AllOutDetermined"))}
      ${checkbox("rrBraced", L("ContactBraced"))}
      ${checkbox("rrUnresisting", L("Unresisting"))}
    </fieldset>`);
  }
  if (isRuleOn("nonCombatBonuses")) {
    parts.push(`<fieldset style="border:1px solid var(--color-border-light-2,#999);padding:4px 8px">
      <legend>${L("NonCombat")}</legend>
      ${checkbox("rrNoRiskSelf", L("NoRiskSelf"))}
      ${checkbox("rrNoRiskOthers", L("NoRiskOthers"))}
      ${checkbox("rrNoStake", L("NoStake"))}
      ${checkbox("rrKnown", L("RangeSpeedKnown"))}
      ${checkbox("rrPerson", L("TargetIsPerson"))}
      <label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <span>${L("Environment")}</span>
        <input type="number" name="rrEnvironment" value="0" min="0" max="4" step="1" style="width:60px">
      </label>
    </fieldset>`);
  }
  if (isRuleOn("partialCoverage")) {
    parts.push(`<label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
      <span>${L("StrikeAround")}</span>
      <select name="rrStrikeAround" style="width:150px">
        <option value="0">${L("StrikeNone")}</option>
        ${[1, 2, 3, 4, 5].map((n) => `<option value="${n}">${n}/6</option>`).join("")}
      </select>
    </label>`);
  }
  if (isRuleOn("simplifiedRange")) {
    parts.push(`<label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
      <span>${L("BandShift")}</span>
      <select name="rrBandShift" style="width:150px">
        <option value="none">${L("BandStay")}</option>
        <option value="closer">${L("BandCloser")}</option>
        <option value="farther">${L("BandFarther")}</option>
      </select>
    </label>`);
  }
  if (isRuleOn("trickyShooting")) {
    parts.push(`<label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
      <span>${L("Prediction")}</span>
      <input type="number" name="rrPrediction" value="0" min="0" max="10" step="1" style="width:60px">
    </label>`);
    if (rateOfFire >= 2) parts.push(checkbox("rrRapid", L("RangedRapidStrike")));
  }
  return parts.join("\n");
}

/** Reads {@link revisedRangedFields} back; null where nothing is on. */
export function readRevisedRanged(form: HTMLElement | null): RevisedRangedInput | null {
  if (!form) return null;
  const has = (name: string) => form.querySelector(`[name="${name}"]`) !== null;
  if (!["rrContact", "rrNoRiskSelf", "rrStrikeAround", "rrPrediction", "rrBandShift"].some(has)) return null;
  const checked = (name: string) => form.querySelector<HTMLInputElement>(`input[name="${name}"]`)?.checked ?? false;
  const num = (name: string) => Number(form.querySelector<HTMLInputElement>(`input[name="${name}"]`)?.value ?? 0) || 0;
  const contact = (form.querySelector<HTMLSelectElement>('select[name="rrContact"]')?.value ?? "none") as ContactKind;
  return {
    contact,
    allOutDetermined: checked("rrAllOut"),
    braced: checked("rrBraced"),
    unresisting: checked("rrUnresisting"),
    strikeAround: Number(form.querySelector<HTMLSelectElement>('select[name="rrStrikeAround"]')?.value ?? 0) || 0,
    nonCombat: has("rrNoRiskSelf")
      ? {
          noRiskSelf: checked("rrNoRiskSelf"),
          noRiskOthers: checked("rrNoRiskOthers"),
          noStake: checked("rrNoStake"),
          environment: num("rrEnvironment"),
          known: checked("rrKnown"),
          person: checked("rrPerson"),
        }
      : null,
    prediction: Math.max(0, Math.trunc(num("rrPrediction"))),
    rapidStrike: checked("rrRapid"),
    bandShift: ((v) => (v === "closer" || v === "farther" ? v : "none"))(form.querySelector<HTMLSelectElement>('select[name="rrBandShift"]')?.value),
  };
}

/** Whether a close-contact shot is being taken, which drops Acc, sights and aim. */
export function contactShot(input: RevisedRangedInput | null | undefined): boolean {
  return !!input && input.contact !== "none";
}

/** The lines the extra fields add to the shot. */
export function revisedRangedLines(input: RevisedRangedInput | null | undefined): RevisedLine[] {
  if (!input) return [];
  const lines: RevisedLine[] = [];
  if (input.contact !== "none") {
    const contact = closeContactShot({
      contact: input.contact,
      allOutDetermined: input.allOutDetermined,
      braced: input.braced,
      unresisting: input.unresisting,
    });
    if (contact.allOutExtra) lines.push({ label: L("LineAllOut"), value: contact.allOutExtra, key: "closeContact" });
    if (contact.pressed) lines.push({ label: L("LinePressed"), value: contact.pressed, key: "closeContact" });
    if (contact.braced) lines.push({ label: L("LineBraced"), value: contact.braced, key: "closeContact" });
    if (contact.targetDefenseBonus) lines.push({ label: L("LineTargetDefends", { bonus: contact.targetDefenseBonus }), value: 0, key: "closeContact" });
    if (lines.length === 0) lines.push({ label: L("LineContact"), value: 0, key: "closeContact" });
  }
  if (input.nonCombat) {
    const bonus = nonCombatBonus({
      noRiskToSelf: input.nonCombat.noRiskSelf,
      noRiskToOthers: input.nonCombat.noRiskOthers,
      noStake: input.nonCombat.noStake,
      environment: input.nonCombat.environment,
      rangeAndSpeedKnown: input.nonCombat.known,
      targetIsPerson: input.nonCombat.person,
    });
    if (bonus) lines.push({ label: L("LineNonCombat"), value: bonus, key: "nonCombat" });
  }
  if (input.strikeAround > 0) {
    const penalty = strikeAroundPenalty(input.strikeAround);
    if (penalty) lines.push({ label: L("LineStrikeAround", { n: input.strikeAround }), value: penalty, key: "strikeAround" });
  }
  if (input.prediction > 0) {
    // -2 to hit for each -1 to the target's Dodge; the 10-skill floor is the shooter's to watch.
    lines.push({ label: L("LinePrediction", { levels: input.prediction }), value: -2 * input.prediction, key: "prediction" });
  }
  if (input.rapidStrike) lines.push({ label: L("LineRapid"), value: RANGED_RAPID_STRIKE_PENALTY, key: "rapidStrike" });
  return lines;
}

/**
 * What a Prediction Shot does to the target: the defense penalty of its
 * Deceptive Attack "reduces Dodge only" (p. 577), so it is a line for the
 * defender's dodge and for no other defense.
 */
export function revisedRangedDefenseModifiers(input: RevisedRangedInput | null | undefined): Array<{ label: string; value: number; defenses: Array<"dodge"> }> {
  if (!input || input.prediction <= 0) return [];
  return [{ label: L("LinePredictionDodge", { levels: input.prediction }), value: -input.prediction, defenses: ["dodge"] }];
}

/**
 * Whether a Ranged Rapid Strike may be made as the dialog was filled in
 * (p. 577): a weapon of RoF 2 or more, no Dual-Weapon Attack, and a share of
 * the shots for this target that leaves at least one for the other. Returns
 * the refusal to show, or the shots the other target is left with; null where
 * no Rapid Strike was asked for.
 */
export function rapidStrikeCheck(
  input: RevisedRangedInput | null | undefined,
  options: { rateOfFire: number; shots: number; dual: boolean },
): { refusal: string } | { other: number } | null {
  if (!input?.rapidStrike) return null;
  if (!rangedRapidStrikeAllowed(options.rateOfFire, options.dual)) return { refusal: L(options.dual ? "RapidNoDual" : "RapidNeedsRof") };
  const share = rapidStrikeShare(options.rateOfFire, options.shots);
  if (!share) return { refusal: L("RapidShare", { rof: options.rateOfFire }) };
  return { other: share.other };
}

/**
 * The lines a ranged Feint takes: "All modifiers that apply to ranged attacks
 * also apply to ranged feints" (p. 577), here the range and the target's size,
 * from the measured shot to the one target.
 */
export function rangedFeintLines(shot: { rangeYards: number; targetSizeModifier: number } | null): Array<{ label: string; value: number }> {
  if (!shot) return [];
  const { speedRange, size } = rangedToHitModifier({ rangeYards: shot.rangeYards, targetSpeedYardsPerSecond: 0, targetSizeModifier: shot.targetSizeModifier });
  const lines: Array<{ label: string; value: number }> = [];
  const banded = simplifiedRangeOn() ? simplifiedRange(shot.rangeYards) : null;
  const range = banded ? banded.penalty : speedRange;
  if (range !== 0) {
    lines.push({ label: banded ? L("Band", { band: game.i18n.localize(`GWORLD.RevisedRanged.Bands.${banded.band}`) }) : L("FeintRange"), value: range });
  }
  if (size !== 0) lines.push({ label: L("FeintSize"), value: size });
  return lines;
}

// ---------------------------------------------------------------- Restricted Dodge Against Firearms

const MODULE = "gworld";
const cap = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
/** The maneuver-option keys of a maneuver's evasive declaration. */
const evasiveKeys = (maneuver: string) => ({
  shooter: `evasive${cap(maneuver)}`,
  acrobatic: `evasiveAcrobatic${cap(maneuver)}`,
  drop: `evasiveDrop${cap(maneuver)}`,
});

/** The other fighters a declaration may name: the combatants, or else the tokens on the scene. */
function potentialShooters(actor: any): Array<{ value: string; label: string }> {
  const seen = new Map<string, string>();
  const add = (other: any) => {
    const uuid = String(other?.uuid ?? "");
    if (uuid && other !== actor && uuid !== String(actor?.uuid ?? "")) seen.set(uuid, String(other?.name ?? uuid));
  };
  const combatants: any[] = [...((globalThis as any).game?.combat?.combatants ?? [])];
  for (const combatant of combatants) add(combatant?.actor);
  if (seen.size === 0) {
    for (const token of (globalThis as any).canvas?.tokens?.placeables ?? []) add(token?.actor);
  }
  return [...seen].map(([value, label]) => ({ value, label }));
}

/** Registers the evasive-movement declaration on each maneuver that allows it (Revised p. 577). */
export function registerRestrictedDodge(): void {
  for (const maneuver of EVASIVE_MANEUVERS) {
    const keys = evasiveKeys(maneuver);
    registerManeuverOption({
      module: MODULE, key: keys.shooter, maneuver, label: L("EvasiveShooter"),
      input: (actor) => ({ type: "select", choices: potentialShooters(actor) }),
      available: () => isRuleOn("restrictedDodge"),
    });
    registerManeuverOption({
      module: MODULE, key: keys.acrobatic, maneuver, label: L("EvasiveAcrobatic"),
      available: () => isRuleOn("restrictedDodge"),
    });
    registerManeuverOption({
      module: MODULE, key: keys.drop, maneuver, label: L("EvasiveDrop"),
      available: () => isRuleOn("restrictedDodge"),
    });
  }
}

const isTicked = (value: unknown) => value === true || value === "true" || value === 1 || value === "1";

/** What the defender declared on the maneuver they hold: the one shooter, and the two turn-bound extras. */
export function evasiveDeclaration(actor: any): EvasiveDeclaration | null {
  const maneuver = String(actor?.system?.maneuver ?? "");
  if (!EVASIVE_MANEUVERS.includes(maneuver)) return null;
  const chosen = chosenManeuverOptions(actor);
  const keys = evasiveKeys(maneuver);
  const shooter = String(chosen[`${MODULE}.${keys.shooter}`] ?? "");
  return {
    shooter: shooter || null,
    maneuver,
    acrobaticRolledOnTurn: isTicked(chosen[`${MODULE}.${keys.acrobatic}`]),
    droppedProneAtEnd: isTicked(chosen[`${MODULE}.${keys.drop}`]),
  };
}

/**
 * What the restricted-dodge rule refuses a defender against a firearm attack
 * (p. 577): the dodge itself unless this shooter was declared on the defender's
 * maneuver, and the Acrobatic Dodge unless it was rolled on their turn. Null
 * where the rule is off, or the attack is not a firearm's.
 */
export function restrictedDodgeRefusals(
  defender: any,
  attacker: any,
  attack: { skill?: string | undefined; delivery?: string | undefined },
): { dodge: string | null; acrobatic: string | null } | null {
  if (!isRuleOn("restrictedDodge") || attack.delivery === "melee" || !firearmAttack(attack.skill)) return null;
  const declared = evasiveDeclaration(defender);
  const shooter = String(attacker?.uuid ?? "");
  if (!shooter || !mayDodgeFirearm(declared, shooter)) return { dodge: L("RestrictedNoDodge"), acrobatic: L("RestrictedNoDodge") };
  return { dodge: null, acrobatic: evasiveBonuses(declared).acrobatic ? null : L("RestrictedNoAcrobatic") };
}

/**
 * Hitting 'Em Where It Hurts: one 1d roll per hit for the partly armoured
 * location, its pieces' coverage added. Pieces that fail to protect are
 * dropped; the rest keep their DR. Returns the pieces that count.
 */
export function rollPartialCoverage<T extends { coverage?: number | null; locations: readonly string[] }>(
  worn: readonly T[],
  location: string,
  roll?: number,
): { worn: T[]; protectedByRoll: boolean | null; coverage: number; roll: number | null } {
  if (!isRuleOn("partialCoverage")) return { worn: [...worn], protectedByRoll: null, coverage: 6, roll: null };
  const covers = (piece: T) => piece.locations.length === 0 || piece.locations.includes(location);
  const partial = worn.filter((piece) => covers(piece) && typeof piece.coverage === "number" && piece.coverage > 0 && piece.coverage < 6);
  if (partial.length === 0) return { worn: [...worn], protectedByRoll: null, coverage: 6, roll: null };
  const coverage = combinedCoverage(partial.map((piece) => piece.coverage as number));
  const uniform = (globalThis as { CONFIG?: { Dice?: { randomUniform?: () => number } } }).CONFIG?.Dice?.randomUniform ?? Math.random;
  const rolled = roll ?? Math.min(6, Math.floor(uniform() * 6) + 1);
  const protectedHere = coverageProtects(coverage, rolled);
  return {
    worn: protectedHere ? [...worn] : worn.filter((piece) => !partial.includes(piece)),
    protectedByRoll: protectedHere,
    coverage,
    roll: rolled,
  };
}

/** Says in chat what the coverage roll of a hit came to. */
export async function announceCoverage(actor: any, coverage: { coverage: number; roll: number; protected: boolean }): Promise<void> {
  const chat = (globalThis as { ChatMessage?: any }).ChatMessage;
  if (!chat?.implementation?.create) return;
  const result = L(coverage.protected ? "CoverageProtected" : "CoverageMissed");
  await chat.implementation.create({
    speaker: chat.implementation.getSpeaker({ actor }),
    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    content: `<div class="gworld gworld-chat"><p>${L("CoverageRolled", { roll: coverage.roll, coverage: coverage.coverage, result })}</p></div>`,
  });
}

/** The tolerance with a target's size modifier added while large-target wounding is on, for a thing that has no actor (a vehicle item, a large object). */
export function withLargeObject(tolerance: InjuryTolerance, sm: number): InjuryTolerance {
  if (!isRuleOn("largeTargetDamage")) return tolerance;
  if (!tolerance.unliving && !tolerance.homogenous) return tolerance;
  return { ...tolerance, largeTargetSm: Number(sm) || 0 };
}

/** The tolerance with the target's SM added while large-target wounding is on. */
export function withLargeTarget(tolerance: InjuryTolerance, actor: any): InjuryTolerance {
  if (!isRuleOn("largeTargetDamage")) return tolerance;
  if (!tolerance.unliving && !tolerance.homogenous) return tolerance;
  return { ...tolerance, largeTargetSm: Number(actor?.system?.sm) || 0 };
}
