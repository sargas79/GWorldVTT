/**
 * Shooting at somebody behind something (GURPS Basic Set: Campaigns p. 407).
 *
 * Cover is not one modifier. It is a choice between three ways of dealing with
 * it, each with a different cost, and which one is right depends on the weapon
 * and on how much of the target is showing -- which is exactly the sort of
 * decision worth putting in front of the shooter rather than reducing to a
 * number somebody picks.
 */

/** What the shooter decided to do about the cover. */
export type CoverApproach =
  /** Aim at a part that is not behind anything. */
  | "exposedLocation"
  /** Roll the location randomly and accept that some shots hit the cover. */
  | "randomLocation"
  /** Shoot straight through it. */
  | "shootThrough";

/** The extra penalty for a location that is only half showing (p. 407). */
export const HALF_EXPOSED_PENALTY = -2;

/** The extra penalty for shooting through cover rather than around it. */
export const SHOOT_THROUGH_PENALTY = -2;

/** The penalty for shooting at a target you cannot see at all (p. 394). */
export const COMPLETELY_CONCEALED_PENALTY = -10;

export interface CoverShot {
  /** Modifier from the cover, on top of the hit location penalty if any. */
  modifier: number;
  /** True when the hit location must be rolled rather than aimed at. */
  randomHitLocation: boolean;
  /** True when the cover's own DR is added against the shot. */
  coverDrApplies: boolean;
  /**
   * The roll on 1d at or above which a shot at a half-exposed location hits the
   * cover instead, or null when no such roll is made.
   */
  strikesCoverOn: number | null;
}

/**
 * What a given approach to cover costs (p. 407).
 *
 * - Targeting an exposed location takes the ordinary hit location penalty, and
 *   another -2 if that location is only half showing.
 * - Rolling randomly takes no location penalty at all, but "shots that hit a
 *   covered location strike the cover instead", and a half-exposed location is
 *   struck only on 1-3 of 1d.
 * - Shooting through takes -2 and the cover's DR -- unless the target is
 *   completely concealed, which is shooting blind and costs the usual -10.
 */
export function coverShot(options: {
  approach: CoverApproach;
  /** True when the location being aimed at is only half showing. */
  halfExposed?: boolean;
  /** True when nothing of the target can be seen at all. */
  completelyConcealed?: boolean;
}): CoverShot {
  const { approach } = options;

  if (approach === "shootThrough") {
    return {
      // "If your foe is completely concealed by cover, you suffer the usual
      // penalty for shooting blind, typically -10."
      modifier: options.completelyConcealed
        ? COMPLETELY_CONCEALED_PENALTY
        : SHOOT_THROUGH_PENALTY,
      randomHitLocation: false,
      coverDrApplies: true,
      strikesCoverOn: null,
    };
  }

  if (approach === "randomLocation") {
    return {
      modifier: 0,
      randomHitLocation: true,
      coverDrApplies: false,
      // "For shots that hit a location that is only half exposed, roll 1d: on a
      // roll of 4-6, the shot strikes cover, not the target."
      strikesCoverOn: 4,
    };
  }

  return {
    modifier: options.halfExposed ? HALF_EXPOSED_PENALTY : 0,
    randomHitLocation: false,
    coverDrApplies: false,
    strikesCoverOn: null,
  };
}

/**
 * Whether a randomly rolled shot struck the cover rather than the target.
 *
 * Only asked for a half-exposed location: a location fully behind cover is hit
 * by nothing, and one fully exposed is hit by everything.
 */
export function struckCover(dieRoll: number, shot: CoverShot): boolean {
  if (shot.strikesCoverOn === null) return false;
  return dieRoll >= shot.strikesCoverOn;
}
