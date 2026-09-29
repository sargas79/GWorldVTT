/**
 * The Revised edition's optional ranged rules in play (Basic Set Revised
 * pp. 576-577): the attack dialog's extra fields and the lines they add,
 * Simplified Range, the armour coverage roll and the large-target wounding
 * table. The sums are in `rules/revised-ranged.ts`.
 */

import { isRuleOn } from "./optional-rules.js";
import {
  RANGED_RAPID_STRIKE_PENALTY,
  bandForYards,
  bandPenalty,
  closeContactShot,
  combinedCoverage,
  coverageProtects,
  nonCombatBonus,
  strikeAroundPenalty,
  type ContactKind,
  type RangeBand,
} from "../rules/revised-ranged.js";
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
export function simplifiedRange(yards: number): { band: RangeBand; penalty: number } {
  const band = bandForYards(yards);
  return { band, penalty: bandPenalty(band) };
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
  if (!["rrContact", "rrNoRiskSelf", "rrStrikeAround", "rrPrediction"].some(has)) return null;
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

/** The tolerance with the target's SM added while large-target wounding is on. */
export function withLargeTarget(tolerance: InjuryTolerance, actor: any): InjuryTolerance {
  if (!isRuleOn("largeTargetDamage")) return tolerance;
  if (!tolerance.unliving && !tolerance.homogenous) return tolerance;
  return { ...tolerance, largeTargetSm: Number(actor?.system?.sm) || 0 };
}
