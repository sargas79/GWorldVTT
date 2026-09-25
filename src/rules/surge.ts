/**
 * Surge against the Electrical disadvantage (GURPS Basic Set: Characters
 * pp. 105, 134; since API 1.155.0).
 *
 * Surge marks an attack as an electrical surge "that can disable electronics
 * or anything with the Electrical disadvantage" (p. 105). The Basic Set puts
 * one number on that: a character with Electrical who takes a critical hit
 * from an electrical attack short-circuits and falls unconscious, on top of
 * the blow's other effects (p. 134). What an ordinary hit disables, and what
 * the surge does to a machine that isn't a character, it leaves to the GM.
 */

/** What a Surge blow did beyond its damage. */
export type SurgeEffect = "shortCircuit" | "gmDecides";

/**
 * What a blow does as a surge (pp. 105, 134): `shortCircuit` for a critical
 * hit on a victim with Electrical, `gmDecides` for any other hit on one, and
 * null for a blow without Surge or a victim without Electrical.
 */
export function surgeEffect(options: { surge: boolean; electrical: boolean; criticalHit: boolean }): SurgeEffect | null {
  if (!options.surge || !options.electrical) return null;
  return options.criticalHit ? "shortCircuit" : "gmDecides";
}
