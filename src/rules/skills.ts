/**
 * Skill costs, levels, and defaults (GURPS Lite pp. 12-13).
 */

import type { Difficulty } from "./types.js";

/**
 * Relative level of a skill bought at the cheapest step, by difficulty.
 * One character point buys Attribute+0 for Easy, -1 for Average, -2 for Hard.
 */
const DIFFICULTY_OFFSET: Record<Difficulty, number> = { E: 0, A: -1, H: -2 };

/** Default penalty when using an untrained skill (GURPS Lite p. 13). */
const DIFFICULTY_DEFAULT_PENALTY: Record<Difficulty, number> = { E: -4, A: -5, H: -6 };

/**
 * The Rule of 20: a skill defaulting from an attribute above 20 treats that
 * attribute as 20 (GURPS Lite p. 13).
 */
export const RULE_OF_20_CAP = 20;

/**
 * Character point cost of the `step`-th purchasable level of a skill.
 * The Skill Cost Table runs 1, 2, 4, then +4 per step thereafter.
 */
export function skillStepCost(step: number): number {
  if (step < 0) return 0;
  if (step === 0) return 1;
  if (step === 1) return 2;
  return 4 * (step - 1);
}

/** The step index that a given relative level corresponds to, for a difficulty. */
function stepForRelativeLevel(relativeLevel: number, difficulty: Difficulty): number {
  return relativeLevel - DIFFICULTY_OFFSET[difficulty];
}

/**
 * Character points needed to reach a relative level (e.g. `+1` for Attribute+1).
 * Returns `null` for levels cheaper than the 1-point minimum, which cannot be
 * bought at all.
 */
export function pointsForRelativeLevel(
  relativeLevel: number,
  difficulty: Difficulty,
): number | null {
  const step = stepForRelativeLevel(relativeLevel, difficulty);
  return step < 0 ? null : skillStepCost(step);
}

/**
 * Relative level bought by spending `points` on a skill of this difficulty.
 * Returns `null` if fewer than 1 point is spent — the skill is not known.
 *
 * Points in excess of a step's cost are not wasted from the character's
 * perspective, they simply do not yet reach the next step.
 */
export function relativeLevelForPoints(points: number, difficulty: Difficulty): number | null {
  if (points < 1) return null;

  let step = 0;
  while (skillStepCost(step + 1) <= points) step++;
  return step + DIFFICULTY_OFFSET[difficulty];
}

/**
 * Absolute skill level from points spent, e.g. an Average skill bought with
 * 4 points off DX 12 is level 13.
 *
 * `bonus` covers talents, equipment, and other flat additions to the skill
 * itself (as opposed to situational modifiers applied at roll time).
 * Returns `null` when no points are spent — use {@link defaultLevel} instead.
 */
export function skillLevel(
  attributeScore: number,
  points: number,
  difficulty: Difficulty,
  bonus = 0,
): number | null {
  const relative = relativeLevelForPoints(points, difficulty);
  if (relative === null) return null;
  return attributeScore + relative + bonus;
}

/**
 * Default level for an untrained skill, using the general rule of Attribute-4
 * (Easy), -5 (Average), or -6 (Hard). Skills with a specific listed default
 * should use {@link namedDefaultLevel} instead.
 */
export function defaultLevel(attributeScore: number, difficulty: Difficulty): number {
  return Math.min(attributeScore, RULE_OF_20_CAP) + DIFFICULTY_DEFAULT_PENALTY[difficulty];
}

/**
 * Default level from an explicitly listed default such as `IQ-5`, applying the
 * Rule of 20 to the source attribute.
 */
export function namedDefaultLevel(sourceScore: number, penalty: number): number {
  return Math.min(sourceScore, RULE_OF_20_CAP) + penalty;
}

/**
 * The level a character actually rolls against: their trained level if they have
 * one, otherwise the best available default. Returns `null` for skills with no
 * default that the character has not learned.
 */
export function effectiveSkillLevel(options: {
  attributeScore: number;
  difficulty: Difficulty;
  points: number;
  bonus?: number;
  /** Candidate default levels already resolved to absolute numbers. */
  defaults?: number[];
}): { level: number; fromDefault: boolean } | null {
  const trained = skillLevel(
    options.attributeScore,
    options.points,
    options.difficulty,
    options.bonus ?? 0,
  );

  const bestDefault =
    options.defaults && options.defaults.length > 0 ? Math.max(...options.defaults) : null;

  if (trained !== null && (bestDefault === null || trained >= bestDefault)) {
    return { level: trained, fromDefault: false };
  }
  if (bestDefault !== null) return { level: bestDefault, fromDefault: true };
  return null;
}
