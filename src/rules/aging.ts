/**
 * Growing old (GURPS Basic Set: Campaigns p. 444; Characters pp. 53, 66, 95, 154).
 *
 * "Beginning at age 50, make a series of 'aging rolls' each year ... At age
 * 70, roll every six months. At age 90, roll every three months!" Each
 * series is "four HT rolls -- one for each of your four basic attributes, in
 * the following order: ST, DX, IQ, HT." A failure takes a level off that
 * attribute; a critical failure, or any 17 or 18, takes two. Extended
 * Lifespan doubles the ages and the intervals, Short Lifespan halves them,
 * and the Unaging "never have to make aging rolls".
 */

/** The ages at which the rolls begin, and then come oftener (p. 444). */
export const AGING_THRESHOLDS: readonly { age: number; rollsPerYear: number }[] = [
  { age: 50, rollsPerYear: 1 },
  { age: 70, rollsPerYear: 2 },
  { age: 90, rollsPerYear: 4 },
];

/** The attributes rolled for, in the book's order. */
export const AGED_ATTRIBUTES = ["ST", "DX", "IQ", "HT"] as const;
export type AgedAttribute = (typeof AGED_ATTRIBUTES)[number];

/** A trait as the sheet holds it, for reading the lifespan traits off. */
export interface LifespanTrait {
  name: string;
  levels?: number;
}

export interface Lifespan {
  /** What the ages and intervals are multiplied by: 2 a level of Extended Lifespan, half a level of Short. */
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
    // "Each level of Extended Lifespan doubles all these values" (p. 53).
    if (key === "extended lifespan") multiplier *= 2 ** levels;
    // "Each level of this disadvantage halves" them (p. 154).
    else if (key === "short lifespan") multiplier /= 2 ** levels;
    else if (key === "longevity") longevity = true;
    else if (key === "unaging") unaging = true;
  }
  return { multiplier, longevity, unaging };
}

const NO_LIFESPAN: Lifespan = { multiplier: 1, longevity: false, unaging: false };

/**
 * How many series of aging rolls a year this character makes (p. 444): none
 * before 50, one a year to 70, two to 90 and four from there -- the ages and
 * the intervals both stretched or shrunk by the lifespan traits.
 */
export function agingRollsPerYear(age: number, lifespan: Lifespan = NO_LIFESPAN): number {
  if (lifespan.unaging || !Number.isFinite(age)) return 0;
  let rolls = 0;
  for (const step of AGING_THRESHOLDS) {
    if (age >= step.age * lifespan.multiplier) rolls = step.rollsPerYear / lifespan.multiplier;
  }
  return rolls;
}

/**
 * The modifiers to every aging roll (p. 444): "Your world's medical tech
 * level minus 3; e.g., -3 at TL0, or +4 at TL7. +2 if you are Very Fit, +1 if
 * Fit, -1 if Unfit, or -2 if Very Unfit."
 */
export function agingModifier(options: { medicalTl: number; fit?: number; unfit?: number }): number {
  return Math.floor(options.medicalTl) - 3 + (options.fit ?? 0) - (options.unfit ?? 0);
}

export interface AgingRollResult {
  attribute: AgedAttribute;
  /** Levels lost: 0, 1 or 2. */
  lost: number;
  /** True when Longevity turned a failure into a success. */
  savedByLongevity: boolean;
}

/**
 * What one of the four rolls came to (p. 444; Characters p. 66).
 *
 * "On a failure, reduce the attribute in question by one level. A critical
 * failure, or any roll of 17 or 18, causes the loss of two levels. Exception:
 * If you have Longevity, treat any roll of 16 or less as a success, and treat
 * a 17 or 18 as an ordinary failure -- and if your modified HT is 17+, only an
 * 18 fails!"
 */
export function agingRoll(options: {
  attribute: AgedAttribute;
  success: boolean;
  criticalFailure?: boolean;
  /** The three dice as rolled. */
  rolled: number;
  longevity?: boolean;
  /** HT after the modifiers, for Longevity's second clause. */
  modifiedHt?: number;
}): AgingRollResult {
  const { attribute } = options;
  if (options.longevity) {
    const failsOn = (options.modifiedHt ?? 10) >= 17 ? 18 : 17;
    if (options.rolled < failsOn) {
      return { attribute, lost: 0, savedByLongevity: !options.success };
    }
    return { attribute, lost: 1, savedByLongevity: false };
  }
  if (options.success) return { attribute, lost: 0, savedByLongevity: false };
  const two = options.criticalFailure || options.rolled >= 17;
  return { attribute, lost: two ? 2 : 1, savedByLongevity: false };
}

/** "If any attribute reaches 0 from aging, you die a 'natural' death." */
export function diesOfAge(attributeAfter: number): boolean {
  return attributeAfter <= 0;
}
