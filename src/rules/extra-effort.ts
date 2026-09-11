/**
 * Extra Effort (GURPS Basic Set: Campaigns pp. 356-357).
 *
 * "Through sheer force of will, you can push your body past its usual limits."
 * It comes in two shapes, and they work differently enough that the book states
 * them separately.
 *
 * Out of combat it is a Will roll at a penalty set by how much more you are
 * asking of yourself, and it costs FP whether it works or not. In combat there
 * is no roll at all -- "mainly to avoid bogging down combat with extra die
 * rolls and calculations" -- only FP spent up front for a named advantage.
 */

import { RAPID_STRIKE_PENALTY } from "./attack-options.js";
import { strongAttackDamageBonus } from "./maneuvers.js";

/** The increase one point of penalty buys, as a percentage. */
export const EXTRA_EFFORT_STEP = 5;

/** What one attempt costs, in FP, win or lose. */
export const EXTRA_EFFORT_FP = 1;

/** What Feverish Defense adds to a single active defense roll. */
export const FEVERISH_DEFENSE_BONUS = 2;

/**
 * The penalty for asking a given percentage more of yourself (p. 356).
 *
 * "-1 per 5% increase in capabilities (e.g., to add 10% to ST, roll at -2)."
 * A fraction of a step is charged as a whole one: the table has no half
 * penalties, and rounding the other way would make 4% free.
 */
export function extraEffortModifier(percentIncrease: number): number {
  const wanted = Math.max(0, percentIncrease);
  if (wanted === 0) return 0;
  return -Math.ceil(wanted / EXTRA_EFFORT_STEP);
}

/**
 * The Will roll an extra-effort attempt is made against (p. 356).
 *
 * Two things beyond the size of the effort: "if you are fatigued, apply a
 * penalty equal to the missing FP", and "+5 if you are motivated by fear,
 * anger, or concern for a loved one".
 */
export function extraEffortTarget(options: {
  will: number;
  percentIncrease: number;
  /** FP already spent -- maximum minus current. */
  missingFp?: number;
  /** The GM's +5, granted for fear, anger or concern for a loved one. */
  motivated?: boolean;
}): number {
  const missing = Math.max(0, options.missingFp ?? 0);
  return (
    options.will
    + extraEffortModifier(options.percentIncrease)
    - missing
    + (options.motivated ? 5 : 0)
  );
}

/**
 * The Rapid Strike penalty after a Flurry of Blows (p. 357).
 *
 * "you can halve the penalty for Rapid Strike ... by spending 1 FP per attack."
 * The penalty is negative, so halving it means moving it towards zero, which is
 * what the rounding has to respect: -6 becomes -3, and an odd penalty is
 * rounded in the fighter's favour rather than against them.
 */
export function flurryOfBlowsPenalty(rapidStrikePenalty = RAPID_STRIKE_PENALTY): number {
  return Math.ceil(rapidStrikePenalty / 2);
}

/**
 * The damage bonus Mighty Blows buys (p. 357).
 *
 * "you can spend FP to gain the damage bonus of an All-Out Attack (Strong)
 * without sacrificing your defenses" -- the same bonus, so the same function,
 * and the same restriction to ST-based thrust and swing damage.
 */
export function mightyBlowsBonus(dice: number): number {
  return strongAttackDamageBonus(dice);
}
