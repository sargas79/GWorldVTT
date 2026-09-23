/**
 * Surprise and the mental stun it causes (GURPS Basic Set: Campaigns pp. 393,
 * 420).
 *
 * A defender taken by surprise is mentally stunned: stunned as a blow stuns,
 * but snapping out of it is an IQ roll, not a HT roll -- "you're not hurt,
 * you're confused". Total surprise freezes them first for 1d seconds; partial
 * surprise lets them roll at once, a point easier on each turn after the
 * first. Combat Reflexes never freezes, treats total surprise as partial, and
 * is +6 on the IQ rolls.
 */

/** Total or partial surprise (p. 393). */
export type SurpriseKind = "total" | "partial";

/** Combat Reflexes' bonus to every IQ roll to recover from surprise (p. 393). */
export const SURPRISE_COMBAT_REFLEXES_BONUS = 6;

/** What surprise comes to for this defender: Combat Reflexes treats total surprise as partial. */
export function surpriseKind(total: boolean, combatReflexes: boolean): SurpriseKind {
  return total && !combatReflexes ? "total" : "partial";
}

/**
 * The bonus to an IQ roll to snap out of a mental stun: +6 for Combat
 * Reflexes, and with partial surprise +1 on the second turn, +2 on the third
 * and so on -- one per roll already failed.
 */
export function surpriseRecoveryBonus(options: { partial: boolean; tries: number; combatReflexes: boolean }): number {
  const tries = Math.max(0, Math.floor(Number(options.tries) || 0));
  return (options.combatReflexes ? SURPRISE_COMBAT_REFLEXES_BONUS : 0) + (options.partial ? tries : 0);
}
