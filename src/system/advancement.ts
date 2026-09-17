/**
 * What one step up or down costs, for the things a character improves by
 * spending points on them one step at a time.
 *
 * The sheet's steppers and the Progression tab's upgrades both go through
 * here, so what an upgrade is priced at is exactly what the stepper would
 * write:
 *
 *   - A skill walks the Skill Cost Table (Characters p. 170): 1, 2, 4, 8, then
 *     four at a time, at three times each figure for a wildcard.
 *   - A technique costs a point per level, two for the first at Hard
 *     (Characters p. 229).
 *   - A spell walks whichever table its style says: the Skill Cost Table for a
 *     standard mage, a point at a time for a ritual one.
 *   - A levelled trait moves a level at a time, stopping at its printed cap
 *     and at the last step its cost table prices.
 *
 * Kept apart from the sheets so it can be tested without Foundry.
 */

import type { MagicStyle } from "../rules/magic.js";
import { nextSpellPoints, previousSpellPoints } from "../rules/magic.js";
import {
  nextSkillPoints,
  nextTechniquePoints,
  previousSkillPoints,
  previousTechniquePoints,
} from "../rules/skills.js";
import { nextTraitLevel, previousTraitLevel, traitLevelCeiling } from "../rules/traits.js";

export type StepDirection = "up" | "down";

/** What stepping points needs to know about an item. */
export interface PointedItem {
  type: string;
  system?: {
    points?: unknown;
    difficulty?: unknown;
    derived?: { style?: unknown } | null;
  } | null;
}

/**
 * The points an item would hold one step up or down: a skill, technique or
 * spell. The same figure when there is no step to take.
 */
export function steppedPoints(item: PointedItem, direction: StepDirection): number {
  const current = Number(item.system?.points ?? 0) || 0;
  const down = direction === "down";
  const difficulty = item.system?.difficulty as never;
  if (item.type === "technique") {
    const kind = difficulty === "H" ? "H" : "A";
    return down ? previousTechniquePoints(current, kind) : nextTechniquePoints(current, kind);
  }
  if (item.type === "spell") {
    const style = (item.system?.derived?.style ?? "standard") as MagicStyle;
    return down ? previousSpellPoints(current, difficulty, style) : nextSpellPoints(current, difficulty, style);
  }
  return down ? previousSkillPoints(current, difficulty) : nextSkillPoints(current, difficulty);
}

/** What stepping levels needs to know about a trait. */
export interface LevelledTrait {
  system?: {
    levels?: unknown;
    maxLevels?: unknown;
    costTable?: unknown;
  } | null;
}

function levelShape(trait: LevelledTrait) {
  const system = trait.system ?? {};
  return {
    levels: Number(system.levels ?? 0) || 0,
    maxLevels: Number(system.maxLevels ?? 0) || 0,
    costTable: (Array.isArray(system.costTable) ? system.costTable : []) as number[],
  };
}

/** The levels a trait would have one step up or down. The same figure at a limit. */
export function steppedLevels(trait: LevelledTrait, direction: StepDirection): number {
  const shape = levelShape(trait);
  return direction === "down" ? previousTraitLevel(shape) : nextTraitLevel(shape);
}

/**
 * A level typed into a box, brought within what the trait can hold.
 *
 * The buttons stop where the book stops; a typed figure has to stop there
 * too, or Intolerance could be written at 7 levels against a cap of 2, and a
 * tabled trait past its last row would have no price at all. Nonsense and
 * blanks come back as the level held now. Zero is allowed: Magery 0 is a
 * level of Magery.
 */
export function clampedLevels(trait: LevelledTrait, typed: unknown): number {
  const shape = levelShape(trait);
  // Number("") is 0, which is not what an emptied box means.
  if (typed === null || typed === undefined || String(typed).trim() === "") return shape.levels;
  const value = Math.round(Number(typed));
  if (!Number.isFinite(value)) return shape.levels;
  const ceiling = traitLevelCeiling(shape);
  const floored = Math.max(0, value);
  return ceiling === null ? floored : Math.min(floored, ceiling);
}
