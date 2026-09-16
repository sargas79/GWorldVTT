/**
 * What the next step of an improvement is, and what it costs.
 *
 * The Skills tab's improve card, the Traits tab's level card and the
 * Progression tab's upgrade list all read this. The step itself comes from
 * advancement.ts, which the sheet's steppers write through, so the cost shown
 * is the cost charged.
 *
 * Nothing is refused for want of points. Spending past the budget is allowed
 * and flagged (`overspends`), because a GM may allow it and a character being
 * built is over and under by turns.
 */

import { steppedLevels, steppedPoints, type LevelledTrait, type PointedItem } from "../advancement.js";
import {
  ATTRIBUTE_COST_PER_LEVEL,
  BASIC_SPEED_STEP,
  SECONDARY_COST_PER_LEVEL,
} from "../../rules/attributes.js";
import { relativeLevelForPoints, techniqueLevelsForPoints } from "../../rules/skills.js";
import { traitPoints } from "../../rules/traits.js";
import type { Attribute, Difficulty } from "../../rules/types.js";

/** One step up, priced. */
export interface Improvement {
  /** What is spent now and what would be after the step: points for an item, the score for an attribute. */
  from: number;
  to: number;
  /** The level or score now and after the step, where there is one to show. */
  levelFrom: number | null;
  levelTo: number | null;
  /** Character points the step costs. */
  cost: number;
  /** Whether the step spends more than the character has left. */
  overspends: boolean;
  /** How far past the budget the step would leave the character; zero when it does not. */
  overBy: number;
}

function priced(from: number, to: number, levelFrom: number | null, levelTo: number | null, cost: number, unspent: number): Improvement {
  const after = unspent - cost;
  return { from, to, levelFrom, levelTo, cost, overspends: cost > 0 && after < 0, overBy: cost > 0 && after < 0 ? -after : 0 };
}

/** What a skill, technique or spell needs to be priced. */
export interface LevelledItem extends PointedItem {
  system?: PointedItem["system"] & {
    derived?: { style?: unknown; level?: unknown; relativeLevel?: unknown } | null;
  } | null;
}

/**
 * The next step of a skill, technique or spell, or null when there is none.
 *
 * `attributeScore` is what an untrained skill would be bought off; a trained
 * one moves by the difference in relative level, so every bonus it already has
 * carries over.
 */
export function itemImprovement(item: LevelledItem, unspent: number, attributeScore: number | null = null): Improvement | null {
  const from = Number(item.system?.points ?? 0) || 0;
  const to = steppedPoints(item, "up");
  if (to <= from) return null;

  const derived = item.system?.derived ?? {};
  const levelValue = derived.level;
  const level = levelValue === null || levelValue === undefined || !Number.isFinite(Number(levelValue)) ? null : Number(levelValue);
  let levelTo: number | null = null;

  if (item.type === "technique") {
    const difficulty = item.system?.difficulty === "H" ? "H" : "A";
    const gained = techniqueLevelsForPoints(to, difficulty) - techniqueLevelsForPoints(from, difficulty);
    levelTo = level === null ? null : level + gained;
  } else {
    const difficulty = (item.system?.difficulty ?? "A") as Difficulty;
    const style = String(derived.style ?? "standard");
    // A ritual mage's spell costs a point a level, like a Hard technique.
    const relTo = item.type === "spell" && style === "ritual" ? null : relativeLevelForPoints(to, difficulty);
    const relFromValue = derived.relativeLevel;
    const relFrom = relFromValue === null || relFromValue === undefined ? null : Number(relFromValue);
    if (relTo !== null && level !== null && from > 0 && relFrom !== null && Number.isFinite(relFrom)) {
      levelTo = level + (relTo - relFrom);
    } else if (relTo !== null && attributeScore !== null) {
      levelTo = attributeScore + relTo;
    } else if (level !== null && item.type === "spell") {
      levelTo = level + 1;
    }
  }
  return priced(from, to, level, levelTo, to - from, unspent);
}

/** What a levelled trait needs to be priced. */
export interface PricedTrait extends LevelledTrait {
  system?: LevelledTrait["system"] & {
    points?: unknown;
    pointsPerLevel?: unknown;
    modifiers?: unknown;
    selfControl?: unknown;
  } | null;
}

function traitCostAt(trait: PricedTrait, levels: number): number {
  const s = trait.system ?? {};
  return traitPoints({
    points: Number(s.points ?? 0) || 0,
    levels,
    pointsPerLevel: Number(s.pointsPerLevel ?? 0) || 0,
    costTable: (Array.isArray(s.costTable) ? s.costTable : []) as number[],
    modifiers: (Array.isArray(s.modifiers) ? s.modifiers : []).map((m: any) => Number(m?.value ?? m) || 0),
    selfControl: s.selfControl === null || s.selfControl === undefined || s.selfControl === "" ? null : Number(s.selfControl),
  });
}

/** Whether a trait has levels to buy at all: priced per level, or from a table. */
export function isLevelled(trait: PricedTrait): boolean {
  const s = trait.system ?? {};
  return (Number(s.pointsPerLevel ?? 0) || 0) !== 0 || (Array.isArray(s.costTable) && s.costTable.length > 0);
}

/**
 * The next level of a levelled trait, or null when it has no levels or none
 * left. A disadvantage's next level is worth fewer points, so its cost is
 * negative: it gives points back, and never overspends.
 */
export function traitImprovement(trait: PricedTrait, unspent: number): Improvement | null {
  if (!isLevelled(trait)) return null;
  const from = Number(trait.system?.levels ?? 0) || 0;
  const to = steppedLevels(trait, "up");
  if (to <= from) return null;
  const cost = traitCostAt(trait, to) - traitCostAt(trait, from);
  return priced(from, to, from, to, cost, unspent);
}

/**
 * Buying off a disadvantage or quirk: a levelled one loses a level, anything
 * else goes altogether. The cost is the points it stops giving, so it is
 * positive. Null for a trait that gives no points back.
 */
export function traitBuyOff(trait: PricedTrait, unspent: number): Improvement | null {
  const levels = Number(trait.system?.levels ?? 0) || 0;
  const current = traitCostAt(trait, levels);
  if (isLevelled(trait) && levels > 1) {
    const to = steppedLevels(trait, "down");
    // The level gives fewer points afterwards: what it stops giving is the cost.
    const cost = traitCostAt(trait, to) - current;
    return cost > 0 ? priced(levels, to, levels, to, cost, unspent) : null;
  }
  return current < 0 ? priced(levels, 0, levels, 0, -current, unspent) : null;
}

/** Comprehension levels, lowest first, each a point more than the last. */
export const COMPREHENSION_LEVELS = ["none", "broken", "accented", "native"] as const;

/**
 * The next comprehension level of a language's spoken or written side, a
 * point each. Free for the character's native language. Null at native.
 */
export function languageImprovement(level: unknown, isNative: boolean, unspent: number): Improvement | null {
  const from = COMPREHENSION_LEVELS.indexOf(level as (typeof COMPREHENSION_LEVELS)[number]);
  if (from < 0 || from >= COMPREHENSION_LEVELS.length - 1) return null;
  return priced(from, from + 1, from, from + 1, isNative ? 0 : 1, unspent);
}

/** The next point of an attribute: 10 for ST and HT, 20 for DX and IQ (Characters p. 14). */
export function attributeImprovement(attribute: Attribute, score: number, unspent: number): Improvement {
  return priced(score, score + 1, score, score + 1, ATTRIBUTE_COST_PER_LEVEL[attribute], unspent);
}

export type SecondaryKey = "hp" | "will" | "per" | "fp" | "basicMove" | "basicSpeed";

/**
 * The next step of a secondary characteristic bought up from its default
 * (Characters pp. 15-17): a level, or a quarter point of Basic Speed.
 * `purchased` is the adjustment bought so far; `value` the figure it gives.
 */
export function secondaryImprovement(key: SecondaryKey, purchased: number, value: number, unspent: number): Improvement {
  if (key === "basicSpeed") {
    return priced(purchased, purchased + BASIC_SPEED_STEP, value, value + BASIC_SPEED_STEP, SECONDARY_COST_PER_LEVEL.basicSpeedQuarter, unspent);
  }
  return priced(purchased, purchased + 1, value, value + 1, SECONDARY_COST_PER_LEVEL[key], unspent);
}
