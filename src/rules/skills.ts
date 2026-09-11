/**
 * Skill costs, levels, and defaults (GURPS Lite pp. 12-13).
 */

import type { Difficulty } from "./types.js";

/**
 * Relative level of a skill bought at the cheapest step, by difficulty.
 * One character point buys Attribute+0 for Easy, -1 for Average, -2 for Hard.
 */
const DIFFICULTY_OFFSET: Record<Difficulty, number> = { E: 0, A: -1, H: -2, VH: -3 };

/**
 * Default penalty when using an untrained skill (GURPS Basic Set: Characters
 * p. 173). Very Hard skills share the Hard penalty; most in practice have a
 * specific listed default or none at all.
 */
const DIFFICULTY_DEFAULT_PENALTY: Record<Difficulty, number> = { E: -4, A: -5, H: -6, VH: -6 };

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
 * Technique difficulty. Techniques are only ever Average or Hard
 * (GURPS Basic Set: Characters p. 230).
 */
export type TechniqueDifficulty = "A" | "H";

/**
 * Points needed to raise a technique by `levels` above its default.
 *
 * An Average technique costs 1 point per level. A Hard one costs 2 for the
 * first level and 1 for each after, so the cost is not simply level x rate.
 */
export function techniquePointCost(levels: number, difficulty: TechniqueDifficulty): number {
  if (levels <= 0) return 0;
  return difficulty === "A" ? levels : levels + 1;
}

/** The inverse: how many levels a given number of points buys. */
export function techniqueLevelsForPoints(
  points: number,
  difficulty: TechniqueDifficulty,
): number {
  if (points <= 0) return 0;
  if (difficulty === "A") return points;
  // Hard techniques waste a single point, which buys nothing.
  return points < 2 ? 0 : points - 1;
}

export interface TechniqueResolution {
  /** The technique's absolute level. */
  level: number;
  /** Levels actually applied, after the prerequisite cap. */
  levels: number;
  /** True when the cap prevented the bought levels from all applying. */
  cappedByPrerequisite: boolean;
}

/**
 * Resolves a technique against the skill it defaults from.
 *
 * A technique starts at `prerequisiteLevel + defaultModifier` (the modifier is
 * negative) and is bought up from there. Its ceiling is usually the
 * prerequisite skill's own level, but each technique sets its own: Arm Lock
 * reaches the prerequisite +4 and Kicking +5 (p. 230), so the cap is not
 * assumed to sit at or below the skill.
 */
export function resolveTechnique(options: {
  prerequisiteLevel: number;
  defaultModifier: number;
  levels: number;
  /** The technique's ceiling, expressed relative to the prerequisite level. */
  maxRelativeToPrerequisite?: number;
}): TechniqueResolution {
  const { prerequisiteLevel, defaultModifier, levels } = options;
  const base = prerequisiteLevel + defaultModifier;

  const relativeCap = options.maxRelativeToPrerequisite ?? 0;
  const ceiling = prerequisiteLevel + relativeCap;

  const uncapped = base + Math.max(0, levels);
  const level = Math.min(uncapped, ceiling);

  return {
    level,
    levels: level - base,
    cappedByPrerequisite: uncapped > ceiling,
  };
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

/**
 * A skill name reduced to what identifies the skill.
 *
 * The book marks a skill whose content depends on tech level with "/TL", and
 * writes the tech level learned into the marker on a character sheet:
 * Armoury/TL, Armoury/TL3. But it drops the marker whenever it refers to the
 * skill from somewhere else -- a revolver is used with "Guns (Pistol)", and
 * Architecture defaults from "Engineer (Civil)". The marker is notation about
 * the skill, not part of its name, so matching has to see through it.
 *
 * Case and surrounding space go too, so that a hand-typed skill still matches
 * one dragged in from the compendium.
 */
export function normalizeSkillName(name: string): string {
  return name
    .trim()
    .replace(/\/TL[\d^]*/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Whether two names refer to the same skill. */
export function sameSkill(a: string, b: string): boolean {
  return normalizeSkillName(a) === normalizeSkillName(b);
}

/**
 * The most points anyone will sensibly put into one skill, used only to stop
 * the steppers below looping for ever on a nonsense input.
 */
const SKILL_POINT_CEILING = 1000;

/**
 * The next point total that actually buys something (GURPS Lite p. 12).
 *
 * Skill points come in steps -- 1, 2, 4, 8, then four at a time -- and the
 * totals between them buy nothing at all. Stepping up by one would spend a
 * character point for no change to the level three times out of four, so the
 * step goes to the next total on the table.
 *
 * A total that is off the table steps up to the next one on it, which is how a
 * skill imported at an odd figure comes back into line.
 */
export function nextSkillPoints(points: number): number {
  const from = Math.max(0, Math.floor(points));
  for (let step = 0; ; step++) {
    const cost = skillStepCost(step);
    if (cost > from) return cost;
    if (cost >= SKILL_POINT_CEILING) return from;
  }
}

/**
 * The previous point total that buys something, or zero.
 *
 * Zero is a real answer: it is the skill unlearned, rolled at default if it has
 * one. A total off the table steps down to the highest one below it.
 */
export function previousSkillPoints(points: number): number {
  const from = Math.max(0, Math.floor(points));
  let below = 0;
  for (let step = 0; ; step++) {
    const cost = skillStepCost(step);
    if (cost >= from) return below;
    below = cost;
    if (cost >= SKILL_POINT_CEILING) return below;
  }
}
