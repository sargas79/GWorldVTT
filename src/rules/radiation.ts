/**
 * Radiation (GURPS Basic Set: Campaigns pp. 435-436; Characters p. 79).
 *
 * "Exposure is measured in rads. The more rads received, the greater the
 * chance of ill effects." Each dose accumulates and "starts to heal after 30
 * days, at the rate of 10 rads per day. However, 10% of the original dose
 * never heals." When a living being takes a dose, "he must make a HT roll";
 * the accumulated dose gives the modifier and the row of effects, and the
 * roll picks the column: "the first result ... on a critical success, the
 * second on a success, the third on a failure, and the last on a critical
 * failure."
 */

/** The letters of the Radiation Effects Table, from nothing to rapid death. */
export type RadiationEffect = "-" | "A" | "B" | "C" | "D" | "E";

export interface RadiationRow {
  /** The highest accumulated dose this row covers. */
  upTo: number;
  htModifier: number;
  /** Critical success, success, failure, critical failure. */
  effects: readonly [RadiationEffect, RadiationEffect, RadiationEffect, RadiationEffect];
}

/** The Radiation Effects Table (p. 436). */
export const RADIATION_TABLE: readonly RadiationRow[] = [
  { upTo: 10, htModifier: 0, effects: ["-", "-", "A", "B"] },
  { upTo: 20, htModifier: 0, effects: ["-", "A", "B", "C"] },
  { upTo: 40, htModifier: 0, effects: ["A", "B", "C", "D"] },
  { upTo: 80, htModifier: -1, effects: ["A", "B", "C", "D"] },
  { upTo: 160, htModifier: -3, effects: ["A", "B", "C", "D"] },
  { upTo: 800, htModifier: -4, effects: ["A", "B", "C", "D"] },
  { upTo: 4000, htModifier: -5, effects: ["C", "D", "E", "E"] },
  { upTo: Infinity, htModifier: -5, effects: ["D", "E", "E", "E"] },
];

/** The row for an accumulated dose, or null below the first rad. */
export function radiationRow(accumulatedRads: number): RadiationRow | null {
  const dose = Math.floor(accumulatedRads);
  if (dose < 1) return null;
  return RADIATION_TABLE.find((row) => dose <= row.upTo) ?? null;
}

/** Which column the HT roll read (p. 436). */
export function radiationEffect(
  row: RadiationRow,
  outcome: { success: boolean; criticalSuccess?: boolean; criticalFailure?: boolean },
): RadiationEffect {
  if (outcome.criticalSuccess) return row.effects[0];
  if (outcome.success) return row.effects[1];
  if (outcome.criticalFailure) return row.effects[3];
  return row.effects[2];
}

/** Days before a dose begins to heal. */
export const HEALING_STARTS_AFTER_DAYS = 30;
/** Rads a day it heals at, once it does. */
export const HEALING_RADS_PER_DAY = 10;
/** The fraction of a dose that "never heals". */
export const PERMANENT_FRACTION = 0.1;

/**
 * What is left of a dose after a span of days (p. 435): all of it for thirty
 * days, then ten rads a day off, down to a tenth that stays.
 */
export function remainingDose(originalRads: number, daysSince: number): number {
  const original = Math.max(0, originalRads);
  const floor = original * PERMANENT_FRACTION;
  const healingDays = Math.max(0, Math.floor(daysSince) - HEALING_STARTS_AFTER_DAYS);
  return Math.max(floor, original - healingDays * HEALING_RADS_PER_DAY);
}

/**
 * The dose after shielding (p. 436) or Radiation Tolerance (Characters
 * p. 79): "Divide your dose by PF".
 */
export function protectedDose(rads: number, protectionFactor: number): number {
  const pf = Math.max(1, protectionFactor);
  return Math.max(0, rads) / pf;
}

/** Radiation Tolerance's levels as the compendium names them: PF 2, 5, 10, 20, 50, 100 ... */
export const RADIATION_TOLERANCE_PF: readonly number[] = [2, 5, 10, 20, 50, 100, 200, 500, 1000];

/** A trait as the sheet holds it, for reading Radiation Tolerance off. */
export interface ToleranceTrait {
  name: string;
  levels?: number;
}

/** The Protection Factor from the trait, 1 for anybody without it. */
export function radiationToleranceFrom(traits: readonly ToleranceTrait[]): number {
  for (const trait of traits) {
    if (trait.name.trim().toLowerCase() !== "radiation tolerance") continue;
    const levels = Math.max(1, Math.floor(trait.levels ?? 0) || 1);
    return RADIATION_TOLERANCE_PF[Math.min(levels, RADIATION_TOLERANCE_PF.length) - 1]!;
  }
  return 1;
}
