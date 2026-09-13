/**
 * A body against movement (GURPS Basic Set: Campaigns pp. 434, 436).
 *
 * Three rules that have nothing in common except their cause: gravity going
 * away, gravity arriving all at once, and the deck under your feet refusing to
 * stay where you left it. All three end in the same place -- somebody
 * nauseated, or worse -- which is why they sit together.
 */

// ── space adaptation syndrome (p. 434) ──────────────────────────────────────

/**
 * "Roll against the higher of HT or Free Fall when you first enter free fall.
 * The Space Sickness disadvantage gives -4."
 */
export const SPACE_SICKNESS_PENALTY = -4;

/** "Roll against the better of HT or Free Fall every 8 hours to recover." */
export const SPACE_SICKNESS_RECOVERY_HOURS = 8;

/** The target for the first moment of free fall (p. 434). */
export function spaceSicknessTarget(options: {
  health: number;
  freeFall?: number | null;
  /** True for somebody with the Space Sickness disadvantage. */
  prone?: boolean;
}): number {
  const best = Math.max(options.health, options.freeFall ?? 0);
  return best + (options.prone ? SPACE_SICKNESS_PENALTY : 0);
}

/**
 * Whether somebody can ever get used to free fall (p. 434).
 *
 * "If you suffer from Space Sickness, you cannot adapt!"
 */
export function canAdaptToFreeFall(spaceSickness: boolean): boolean {
  return !spaceSickness;
}

// ── high acceleration (p. 434) ──────────────────────────────────────────────

/**
 * "Make a HT roll whenever you experience a sudden acceleration of at least
 * 2.5 times your home gravity."
 */
export const ACCELERATION_ROLL_AT = 2.5;

/** "Treat a home gravity under 0.1G as 0.1G for this purpose." */
export const MINIMUM_HOME_GRAVITY = 0.1;

/** Whether a sudden acceleration is worth a roll at all (p. 434). */
export function accelerationNeedsRoll(options: {
  gForce: number;
  homeGravity?: number;
}): boolean {
  const home = Math.max(MINIMUM_HOME_GRAVITY, options.homeGravity ?? 1);
  return options.gForce >= ACCELERATION_ROLL_AT * home;
}

/**
 * The target for a high-acceleration roll (p. 434).
 *
 * "-2 per doubling of acceleration (-2 at 5x home gravity, -4 at 10x, and so
 * on); +2 if seated or lying prone, or -2 if upside down."
 *
 * The doublings are counted from the 2.5x that calls for the roll in the first
 * place, which is what makes the book's own examples come out: 5x is one
 * doubling and -2, 10x is two and -4.
 */
export function accelerationTarget(options: {
  health: number;
  gForce: number;
  homeGravity?: number;
  /** True when seated or lying prone. */
  braced?: boolean;
  /** True when upside down. */
  inverted?: boolean;
}): number {
  const home = Math.max(MINIMUM_HOME_GRAVITY, options.homeGravity ?? 1);
  const multiple = Math.max(0, options.gForce) / home;
  const doublings =
    multiple <= ACCELERATION_ROLL_AT
      ? 0
      : Math.floor(Math.log2(multiple / ACCELERATION_ROLL_AT));
  const posture = (options.braced ? 2 : 0) + (options.inverted ? -2 : 0);
  return options.health - 2 * doublings + posture;
}

/**
 * What a failed acceleration roll costs (p. 434).
 *
 * "On a failure, you lose FP equal to your margin of failure. On a critical
 * failure, you also black out for 10 seconds times your margin of failure."
 */
export function accelerationHarm(roll: {
  margin: number;
  criticalFailure: boolean;
}): { fatigue: number; blackoutSeconds: number } {
  const margin = Math.max(0, Math.abs(roll.margin));
  return {
    fatigue: margin,
    blackoutSeconds: roll.criticalFailure ? margin * 10 : 0,
  };
}

/**
 * How fast somebody is thrown against something by a sudden acceleration
 * (p. 434).
 *
 * "A sudden acceleration may throw you against a solid object. If this
 * happens, treat it as a collision with that object at a velocity equal to 10
 * x G-force of the acceleration."
 */
export function thrownVelocity(gForce: number): number {
  return Math.max(0, gForce) * 10;
}

// ── seasickness (p. 436) ────────────────────────────────────────────────────

/**
 * "if you lack that disadvantage, you roll at HT+5" for seasickness.
 */
export const SEASICKNESS_BONUS = 5;

/** "must check for seasickness on their first day afloat." */
export const SEASICKNESS_CHECK_DAYS = 1;

/** The target for a day at sea (p. 436). */
export function seasicknessTarget(options: {
  health: number;
  /** True for somebody with the Motion Sickness disadvantage. */
  motionSickness?: boolean;
}): number {
  return options.health + (options.motionSickness ? 0 : SEASICKNESS_BONUS);
}

/** What a day at sea came to. */
export type SeasicknessOutcome = "immune" | "unaffected" | "nauseated";

/**
 * The seasickness roll (p. 436).
 *
 * "with a success by 5 or more, or a critical success, you suffer no ill
 * effects at all" -- which is not the same as merely passing, since a bare
 * success only spares you today.
 */
export function seasicknessOutcome(roll: {
  success: boolean;
  margin: number;
  criticalSuccess: boolean;
}): SeasicknessOutcome {
  if (roll.criticalSuccess || (roll.success && roll.margin >= 5)) return "immune";
  return roll.success ? "unaffected" : "nauseated";
}
