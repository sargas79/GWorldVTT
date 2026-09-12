/**
 * Growing old (GURPS Basic Set: Campaigns p. 444; Characters pp. 53, 66, 95, 154).
 *
 * "Once a character reaches age 50, he must make an aging roll ... once a
 * year", twice a year from 70 and four times a year from 90. The roll is
 * against HT; a failure takes a point off an attribute, a critical failure
 * two. Longevity turns all but a natural 17 or 18 into a success; Extended
 * Lifespan and Short Lifespan stretch and shrink the ages the rolls start at;
 * Unaging never rolls at all.
 */

/** The ages at which the rolls begin, and then come oftener (p. 444). */
export const AGING_THRESHOLDS: readonly { age: number; rollsPerYear: number }[] = [
  { age: 50, rollsPerYear: 1 },
  { age: 70, rollsPerYear: 2 },
  { age: 90, rollsPerYear: 4 },
];

/** A trait as the sheet holds it, for reading the lifespan traits off. */
export interface LifespanTrait {
  name: string;
  levels?: number;
}

export interface Lifespan {
  /** What the thresholds are multiplied by: 2 a level of Extended Lifespan, half a level of Short. */
  multiplier: number;
  /** Longevity (Characters p. 66): fails only on a 17 or 18. */
  longevity: boolean;
  /** Unaging (p. 95): no aging rolls at all. */
  unaging: boolean;
}

/** The lifespan traits, read by name. */
export function lifespanFrom(traits: readonly LifespanTrait[]): Lifespan {
  let multiplier = 1;
  let longevity = false;
  let unaging = false;
  for (const trait of traits) {
    const key = trait.name.trim().toLowerCase();
    const levels = Math.max(1, Math.floor(trait.levels ?? 0) || 1);
    // "Each level doubles ... the ages at which you make aging rolls" (p. 53).
    if (key === "extended lifespan") multiplier *= 2 ** levels;
    // "Each level halves" them (p. 154).
    else if (key === "short lifespan") multiplier /= 2 ** levels;
    else if (key === "longevity") longevity = true;
    else if (key === "unaging") unaging = true;
  }
  return { multiplier, longevity, unaging };
}

/** How often this character rolls for age: 0, 1, 2 or 4 times a year (p. 444). */
export function agingRollsPerYear(age: number, lifespan: Lifespan = { multiplier: 1, longevity: false, unaging: false }): number {
  if (lifespan.unaging || !Number.isFinite(age)) return 0;
  let rolls = 0;
  for (const step of AGING_THRESHOLDS) {
    if (age >= step.age * lifespan.multiplier) rolls = step.rollsPerYear;
  }
  return rolls;
}

export type AgedAttribute = "ST" | "DX" | "IQ" | "HT";

/** Which attribute a failed roll costs, by a die (p. 444): 1-2 ST, 3 DX, 4 IQ, 5-6 HT. */
export function agedAttribute(die: number): AgedAttribute {
  if (die <= 2) return "ST";
  if (die === 3) return "DX";
  if (die === 4) return "IQ";
  return "HT";
}

export interface AgingResult {
  /** True when nothing was lost. */
  held: boolean;
  /** Points lost: 1 on a failure, 2 on a critical failure. */
  lost: number;
  /** True when Longevity turned a failure into a success. */
  savedByLongevity: boolean;
}

/**
 * What an aging roll came to (p. 444; Characters p. 66).
 *
 * "On a failure, lose 1 point from ST, DX, IQ, or HT. On a critical failure,
 * lose 2 points." With Longevity "you only fail aging rolls on a natural 17
 * or 18 (only 18 if your HT is 17 or more)".
 */
export function agingResult(options: {
  success: boolean;
  criticalFailure?: boolean;
  /** The three dice as rolled. */
  rolled: number;
  longevity?: boolean;
  ht?: number;
}): AgingResult {
  if (options.success) return { held: true, lost: 0, savedByLongevity: false };
  if (options.longevity) {
    const failsOn = (options.ht ?? 10) >= 17 ? 18 : 17;
    if (options.rolled < failsOn) return { held: true, lost: 0, savedByLongevity: true };
  }
  return { held: false, lost: options.criticalFailure ? 2 : 1, savedByLongevity: false };
}
