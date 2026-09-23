/**
 * Picks (GURPS Basic Set: Campaigns p. 405).
 *
 * A melee weapon that does swing/impaling damage -- a pick, a warhammer, the
 * spike of a halberd -- may get stuck in the foe it hits. After any blow with
 * one that penetrates DR and does damage, the wielder must, at the start of
 * the next turn, either let go of it (a free action) or take a Ready maneuver
 * to roll ST to pull it free:
 *
 *   - success: it comes free; one that must be readied after an attack (the
 *     "‡" weapons) can be readied the turn after;
 *   - failure: it stays stuck -- it can't be used or readied, and moving
 *     means letting go -- and later turns offer the same two choices;
 *   - critical failure: it is stuck for good, to be pulled from a fallen foe
 *     after the battle.
 */

/** Whether a blow leaves the weapon stuck in its victim. */
export function getsStuck(blow: {
  /** Whether the mode is a pick. */
  pick: boolean;
  /** Damage that got past DR. */
  penetrating: number;
  /** Injury the victim took. */
  injury: number;
}): boolean {
  return blow.pick === true && blow.penetrating > 0 && blow.injury > 0;
}

/** What a ST roll to free a stuck weapon came to. */
export type FreeingResult = "freed" | "stuck" | "stuckForGood";

/** Reads a ST roll to free a stuck weapon. */
export function freeingResult(outcome: { success: boolean; criticalFailure?: boolean }): FreeingResult {
  if (outcome.success) return "freed";
  return outcome.criticalFailure === true ? "stuckForGood" : "stuck";
}
