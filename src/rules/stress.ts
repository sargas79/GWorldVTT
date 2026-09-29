/**
 * Stress and Derangement (Basic Set Revised pp. 572-573): an optional way of
 * tracking mental hardship as "mental FP" (Stress, temporary) and "mental HP"
 * (Derangement, lasting). Both are kept here as non-negative counts, so the
 * book's "-3 Stress" is a Stress of 3.
 */

export type FrightKind = "ordinary" | "sanity";

/** What a Fright Check that failed costs (p. 572): 1, or 3 on a critical failure. */
export function frightHardship(options: { criticalFailure: boolean }): number {
  return options.criticalFailure ? 3 : 1;
}

/**
 * The cumulative penalty to Fright Checks, (Stress + Derangement)/2 rounded
 * against the character; returned as a negative number or 0.
 */
export function stressFrightPenalty(stress: number, derangement: number): number {
  return 0 - Math.ceil((Math.max(0, stress) + Math.max(0, derangement)) / 2);
}

/** The Fright Check bonus of Unfazeable against a sanity-blasting one; ordinary ones it does not allow at all. */
export const UNFAZEABLE_SANITY_BONUS = 8;

/** The result of adding hardship to a character. */
export interface HardshipResult {
  stress: number;
  derangement: number;
  /** Derangement that overflowed the limit and becomes points of permanent disadvantages. */
  permanentPoints: number;
}

/**
 * Adds Stress or Derangement. The limit for each is Will; Stress beyond it
 * becomes Derangement, and Derangement beyond it becomes points in permanent
 * mental disadvantages.
 */
export function addHardship(options: {
  stress: number;
  derangement: number;
  will: number;
  kind: FrightKind;
  amount: number;
}): HardshipResult {
  const limit = Math.max(0, options.will);
  let stress = Math.max(0, options.stress);
  let derangement = Math.max(0, options.derangement);
  let amount = Math.max(0, options.amount);
  if (options.kind === "ordinary") {
    const room = Math.max(0, limit - stress);
    const taken = Math.min(room, amount);
    stress += taken;
    amount -= taken;
  }
  derangement += amount;
  const permanentPoints = Math.max(0, derangement - limit);
  derangement -= permanentPoints;
  return { stress, derangement, permanentPoints };
}

/** Stress lost to rest: 1 per 10 minutes, and 1 more for an indulgence. */
export function stressRecovered(options: { minutes: number; indulgence?: boolean }): number {
  return Math.floor(Math.max(0, options.minutes) / 10) + (options.indulgence ? 1 : 0);
}

/**
 * Stress/2 rounded for the worst, as the optional penalty to self-control,
 * steady-hand skills and HT rolls against disease, reduced by Fearlessness
 * levels and never a bonus. Negative or 0.
 */
export function stressRollPenalty(stress: number, fearlessness = 0): number {
  return 0 - Math.max(0, Math.ceil(Math.max(0, stress) / 2) - Math.max(0, fearlessness));
}

/** Derangement/2 rounded for the worst, for Influence and sanity rolls; Fearlessness never offsets it. */
export function derangementRollPenalty(derangement: number): number {
  return 0 - Math.ceil(Math.max(0, derangement) / 2);
}

/** The Will roll that sheds 1 Derangement at a day's end: +1 for a clinician of skill 12 or better. */
export function derangementRecoveryTarget(options: { will: number; clinician?: boolean }): number {
  return options.will + (options.clinician ? 1 : 0);
}

/** The clinician's skill needed for the +1 and the daily second roll. */
export const CLINICIAN_SKILL = 12;

/** What a cure takes off: a point of a new mental disadvantage removes 2 Derangement, or all Stress. */
export function cureByPoints(options: { stress: number; derangement: number; points: number; target: "stress" | "derangement" }): {
  stress: number;
  derangement: number;
} {
  const points = Math.max(0, Math.floor(options.points));
  if (points === 0) return { stress: options.stress, derangement: options.derangement };
  if (options.target === "stress") return { stress: 0, derangement: options.derangement };
  return { stress: options.stress, derangement: Math.max(0, options.derangement - 2 * points) };
}

/** Seconds of rest that shed 1 Stress (p. 573): 10 minutes. */
export const STRESS_SECONDS = 600;

/** Seconds in a day, for the Derangement roll at a day's end (p. 573). */
export const DAY_SECONDS = 86400;

/**
 * Stress shed as the world clock moves: 1 per 10 minutes, with the seconds
 * that did not make a whole 10 minutes carried to the next advance.
 */
export function stressShedByClock(carrySeconds: number, elapsedSeconds: number): { shed: number; carry: number } {
  const total = Math.max(0, carrySeconds) + Math.max(0, elapsedSeconds);
  const shed = Math.floor(total / STRESS_SECONDS);
  return { shed, carry: total - shed * STRESS_SECONDS };
}

/**
 * The days that ended as the clock went from `from` to `to`, each as the time
 * it began, oldest first, at most `limit` of the latest: a day's end is a
 * midnight of world time.
 */
export function daysEnded(from: number, to: number, limit = 30): number[] {
  if (!(to > from)) return [];
  const first = Math.floor(from / DAY_SECONDS) + 1;
  const last = Math.floor(to / DAY_SECONDS);
  const days: number[] = [];
  for (let boundary = Math.max(first, last - limit + 1); boundary <= last; boundary++) days.push((boundary - 1) * DAY_SECONDS);
  return days;
}

/**
 * Whether a day that began at `dayStart` inflicted no new Stress or
 * Derangement, given when the last hardship was inflicted (p. 573).
 */
export function dayWasQuiet(dayStart: number, lastHardship: number | null): boolean {
  return lastHardship === null || lastHardship < dayStart || lastHardship >= dayStart + DAY_SECONDS;
}

/** The Derangement roll for supernatural powers: Derangement/2, worse; a bonus to use an evil power, a penalty to resist it (p. 573). */
export function derangementPowerModifier(derangement: number, options: { evil: boolean; resisting: boolean }): number {
  const size = Math.ceil(Math.max(0, derangement) / 2);
  if (size === 0) return 0;
  if (options.evil) return options.resisting ? -size : size;
  return options.resisting ? 0 : -size;
}
