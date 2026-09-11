/**
 * Dying slowly (GURPS Basic Set: Campaigns pp. 422-423).
 *
 * The damage pipeline has been saying "death check" and stopping. This is what
 * the roll decides -- and the thing the book puts between surviving it and
 * dying of it, which is the narrow band where you neither walk away nor drop.
 *
 * Also here: how long a crippled limb stays crippled, which the critical
 * tables, the falling rules and the crippling cap have all been pointing at.
 */

/** What a HT roll against death came to. */
export type DeathCheck = "survived" | "mortallyWounded" | "dead";

/**
 * Reads a death check (p. 423).
 *
 * "If you fail a HT roll to avoid death by 1 or 2, you don't drop dead, but
 * suffer a 'mortal wound'." Anything worse is what it looks like.
 */
export function deathCheck(roll: { success: boolean; margin: number }): DeathCheck {
  if (roll.success) return "survived";
  return roll.margin <= 2 ? "mortallyWounded" : "dead";
}

/** Minutes between the HT rolls a mortally wounded character makes (p. 423). */
export const MORTAL_WOUND_MINUTES = 30;

/** Minutes between rolls under trauma maintenance at TL6+ (p. 423). */
export const TRAUMA_MAINTENANCE_MINUTES = 60;

/** What one of those rolls came to. */
export type MortalWoundCheck = "lingers" | "recovered" | "dead";

/**
 * Reads the roll a mortally wounded character makes (p. 423).
 *
 * "On any failure, you die. On a success, you linger for another half-hour --
 * then roll again. On a critical success, you pull through miraculously: you
 * are no longer mortally wounded (but you are still incapacitated)."
 */
export function mortalWoundCheck(roll: {
  success: boolean;
  criticalSuccess?: boolean;
}): MortalWoundCheck {
  if (roll.criticalSuccess) return "recovered";
  return roll.success ? "lingers" : "dead";
}

/**
 * How often a mortally wounded character must roll (p. 423).
 *
 * "At TL6+, 'trauma maintenance' can keep you alive while waiting for
 * surgery... Instead of rolling vs. HT every half-hour, roll against the higher
 * of your HT or your caregiver's Physician skill every hour."
 */
export function mortalWoundInterval(traumaMaintenance: boolean): number {
  return traumaMaintenance ? TRAUMA_MAINTENANCE_MINUTES : MORTAL_WOUND_MINUTES;
}

/** The score the roll is made against, which a caregiver may improve. */
export function mortalWoundTarget(options: {
  health: number;
  /** A caregiver's Physician skill, at TL6+ with the equipment for it. */
  physician?: number | null;
}): number {
  return Math.max(options.health, options.physician ?? Number.NEGATIVE_INFINITY);
}

// ── how long a crippling lasts (p. 422) ─────────────────────────────────────

/** How bad a crippling injury turned out to be. */
export type CripplingDuration = "temporary" | "lasting" | "permanent";

/**
 * Reads the HT roll made to see how serious a crippling is (p. 422).
 *
 * "Success means the crippling is temporary, failure means it's lasting, and
 * critical failure means it's permanent. Dismemberment is automatically
 * permanent -- don't bother rolling!"
 *
 * "For battlefield injuries, roll at the end of combat", which is the caller's
 * business rather than this function's.
 */
export function cripplingDuration(roll: {
  success: boolean;
  criticalFailure?: boolean;
}): CripplingDuration {
  if (roll.criticalFailure) return "permanent";
  return roll.success ? "temporary" : "lasting";
}

/**
 * The months a lasting crippling takes to heal (p. 422).
 *
 * "Roll 1d. This is the number of months it will take for the injury to heal
 * fully. (If the injury is treated by a physician, subtract 3 from the roll at
 * medical TL7+, 2 at TL6, or 1 at TL5 -- but the period of healing is never
 * less than one month.)"
 */
export function cripplingMonths(options: {
  roll: number;
  /** The tech level of the medicine treating it, or null for none at all. */
  treatedAtTl?: number | null;
}): number {
  const tl = options.treatedAtTl;
  const relief = tl === null || tl === undefined ? 0 : tl >= 7 ? 3 : tl === 6 ? 2 : tl === 5 ? 1 : 0;
  return Math.max(1, Math.round(options.roll) - relief);
}
