/**
 * How the Skills tab arranges a character's skills.
 *
 * Two orders. By attribute is the printed sheet's: DX-based skills together,
 * then IQ, then HT, each group headed by the score it is rolled from. A single
 * alphabetical list is what people who know their skills by name want, and
 * what a player scanning for "Stealth" finds faster.
 *
 * Either way an untrained skill sits with the rest. It used to be filed under
 * a separate "Untrained" heading until a point was spent on it, which made a
 * skill just chosen from the compendium appear to have gone somewhere else.
 * Now it stays in its place, dimmed, marked as rolled at default.
 *
 * Kept apart from the sheet so it can be tested without Foundry.
 */

import type { SkillAttribute } from "../rules/types.js";

export type SkillOrder = "attribute" | "alphabetical";

/** The order the attribute groups are shown in, matching the printed sheet. */
export const SKILL_GROUP_ORDER: readonly SkillAttribute[] = ["DX", "IQ", "HT", "ST", "Will", "Per"];

/** What the grouping needs to know about a skill. */
export interface GroupableSkill {
  id: string;
  name: string;
  attribute: SkillAttribute;
  points: number;
  /** The level it is rolled against, or null when it cannot be rolled at all. */
  level: number | null;
  /** True when the skill can be used untrained, at a default. */
  hasDefault: boolean;
}

export interface SkillRow<T extends GroupableSkill> {
  skill: T;
  /** True when points have been spent on it. */
  trained: boolean;
  /** True when it can be rolled at all: trained, or untrained with a default. */
  rollable: boolean;
}

export interface SkillGroup<T extends GroupableSkill> {
  /** The attribute the group is based on, or null for the single alphabetical list. */
  attribute: SkillAttribute | null;
  /** That attribute's score, for the group heading. */
  score: number | null;
  rows: SkillRow<T>[];
}

function byName<T extends GroupableSkill>(a: T, b: T): number {
  return a.name.localeCompare(b.name);
}

function toRow<T extends GroupableSkill>(skill: T): SkillRow<T> {
  const trained = skill.points > 0;
  return {
    skill,
    trained,
    rollable: skill.level !== null && (trained || skill.hasDefault),
  };
}

/**
 * Arranges skills for the tab.
 *
 * `scores` gives each attribute's current value for the group headings. A
 * group with nothing in it is left out rather than shown empty.
 */
export function groupSkills<T extends GroupableSkill>(
  skills: readonly T[],
  options: { order: SkillOrder; scores: Partial<Record<SkillAttribute, number>> },
): SkillGroup<T>[] {
  const sorted = [...skills].sort(byName);

  if (options.order === "alphabetical") {
    return sorted.length === 0 ? [] : [{ attribute: null, score: null, rows: sorted.map(toRow) }];
  }

  return SKILL_GROUP_ORDER.map((attribute) => ({
    attribute,
    score: options.scores[attribute] ?? null,
    rows: sorted.filter((skill) => skill.attribute === attribute).map(toRow),
  })).filter((group) => group.rows.length > 0);
}

/** The other order, for the button that flips between them. */
export function otherOrder(order: SkillOrder): SkillOrder {
  return order === "alphabetical" ? "attribute" : "alphabetical";
}

/** Reads a stored setting back into an order, defaulting to the printed sheet's. */
export function asSkillOrder(value: unknown): SkillOrder {
  return value === "alphabetical" ? "alphabetical" : "attribute";
}
