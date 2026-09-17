/**
 * What adding a compendium entry to a character should actually do.
 *
 * Adding Acute Hearing to someone who already has it should give them another
 * level of it, not a second Acute Hearing beside the first; adding a rope to
 * someone carrying one should make it two ropes. Until now every add made a
 * new item, and a levelled trait bought a level at a time turned into a stack
 * of copies each priced at nothing.
 *
 * And the amount is chosen before the item lands: a level for a levelled
 * trait, points for a skill. A skill added with no points at all is not known,
 * and used to arrive that way and sit under "Untrained" until somebody noticed.
 *
 * Kept apart from the picker so it can be tested without Foundry.
 */

import { traitLevelCeiling, traitPoints } from "../rules/traits.js";
import {
  nextSkillPoints,
  nextTechniquePoints,
  normalizeSkillName,
  pointsForRelativeLevel,
  previousSkillPoints,
  previousTechniquePoints,
  relativeLevelForPoints,
  techniqueLevelsForPoints,
  techniquePointCost,
  type TechniqueDifficulty,
} from "../rules/skills.js";
import type { Difficulty } from "../rules/types.js";

/** The parts of an item the plan reads. */
export interface PlannedItem {
  id?: string;
  type: string;
  name: string;
  system?: Record<string, any>;
}

/** What the picker asked for beside the entry: levels for a trait, points for a skill. */
export interface ChosenAmount {
  levels?: number;
  points?: number;
}

export type AdditionPlan =
  | { action: "create"; data: Record<string, unknown> }
  | {
      action: "update";
      itemId: string;
      changes: Record<string, unknown>;
      /** What moved, for telling the user: "Acute Hearing 2 → 3 levels". */
      moved: { what: "levels" | "points" | "quantity"; from: number; to: number };
    };

/** Whether a trait is priced per level or from a table, so levels mean something. */
export function isLevelledTrait(system: Record<string, any> | undefined): boolean {
  const table: unknown[] = system?.costTable ?? [];
  return Boolean(system?.pointsPerLevel) || table.length > 0;
}

/** Whether the picker should ask how much of this entry to take. */
export function amountKind(item: PlannedItem): "levels" | "points" | null {
  if (item.type === "trait") return isLevelledTrait(item.system) ? "levels" : null;
  if (item.type === "skill" || item.type === "technique" || item.type === "spell") return "points";
  return null;
}

/**
 * What the chosen amount will cost, for showing beside the field before the
 * entry is taken. Null where the entry has no amount to choose.
 */
export function previewCost(item: PlannedItem, amount: number): number | null {
  const kind = amountKind(item);
  if (kind === null) return null;
  const system = item.system ?? {};
  if (kind === "points") return Math.max(0, Math.floor(amount));
  return traitPoints({
    points: Number(system.points ?? 0),
    levels: Math.max(0, Math.floor(amount)),
    pointsPerLevel: Number(system.pointsPerLevel ?? 0),
    costTable: system.costTable ?? [],
  });
}

/** The highest number of levels the picker should offer, or null for no limit. */
export function levelCeiling(item: PlannedItem): number | null {
  const system = item.system ?? {};
  return traitLevelCeiling({
    maxLevels: Number(system.maxLevels ?? 0),
    costTable: system.costTable ?? [],
  });
}

function sameName(a: string, b: string): boolean {
  return normalizeSkillName(a) === normalizeSkillName(b);
}

/**
 * Decides between making a new item and raising one the character has.
 *
 * `source` is the compendium entry's data as it would be created; `existing`
 * is what the character already carries. A levelled trait or a skill that is
 * already there is raised by the chosen amount, a piece of equipment already
 * there gains a unit, and everything else -- a flat advantage, a suit of
 * armour, a language -- is added as a fresh copy, which is what a second one
 * of those means.
 */
export function planAddition(options: {
  source: PlannedItem;
  existing: readonly PlannedItem[];
  chosen?: ChosenAmount;
}): AdditionPlan {
  const { source } = options;
  const chosen = options.chosen ?? {};
  const kind = amountKind(source);

  const match = options.existing.find(
    (item) => item.id && item.type === source.type && sameName(item.name, source.name),
  );

  const data: Record<string, unknown> = { ...source };
  const system: Record<string, unknown> = { ...(source.system ?? {}) };

  if (kind === "levels") {
    const levels = Math.max(1, Math.floor(chosen.levels ?? 1));
    if (match) {
      const from = Math.max(0, Math.floor(Number(match.system?.levels ?? 0)));
      const ceiling = levelCeiling(source);
      const to = ceiling === null ? from + levels : Math.min(ceiling, from + levels);
      return {
        action: "update",
        itemId: match.id!,
        changes: { "system.levels": to },
        moved: { what: "levels", from, to },
      };
    }
    const ceiling = levelCeiling(source);
    system.levels = ceiling === null ? levels : Math.min(ceiling, levels);
    return { action: "create", data: { ...data, system } };
  }

  if (kind === "points") {
    const points = Math.max(0, Math.floor(chosen.points ?? 1));
    if (match) {
      const from = Math.max(0, Math.floor(Number(match.system?.points ?? 0)));
      return {
        action: "update",
        itemId: match.id!,
        changes: { "system.points": from + points },
        moved: { what: "points", from, to: from + points },
      };
    }
    system.points = points;
    return { action: "create", data: { ...data, system } };
  }

  if (source.type === "equipment" && match) {
    const from = Math.max(0, Math.floor(Number(match.system?.quantity ?? 1)));
    const each = Math.max(1, Math.floor(Number(source.system?.quantity ?? 1)));
    return {
      action: "update",
      itemId: match.id!,
      changes: { "system.quantity": from + each },
      moved: { what: "quantity", from, to: from + each },
    };
  }

  return { action: "create", data: { ...data, system } };
}

/** What the picker makes when the list doesn't have what is wanted. */
export interface PickerCustom {
  itemType: string;
  /** A trait's category: a quirk is a -1 point disadvantage with no levels (Characters p. 162). */
  category?: string;
}

/** The data for a custom entry. */
export function customItemData(custom: PickerCustom, name: string): Record<string, unknown> {
  const system: Record<string, unknown> = {};
  if (custom.category) system.category = custom.category;
  if (custom.itemType === "trait" && custom.category === "quirk") Object.assign(system, { points: -1, levels: 0, pointsPerLevel: 0 });
  if (custom.itemType === "trait" && custom.category === "perk") Object.assign(system, { points: 1, levels: 0, pointsPerLevel: 0 });
  return { name, type: custom.itemType, system };
}

/**
 * The point totals an amount field may hold.
 *
 * Points bought a level at a time do not buy a level at a time. The Skill Cost
 * Table steps 1, 2, 4, 8 and then by 4, so 3 points buy exactly what 2 buy and
 * 5 exactly what 4 buy. A spinner stepping by one therefore walks through
 * totals that are simply worse than the one below them, which is what the
 * picker used to offer. These steps are the table's own.
 *
 * Techniques are not on that table (Characters p. 230) and have their own.
 */
const SKILL_DIFFICULTIES: readonly string[] = ["E", "A", "H", "VH", "W"];

/** A skill's or spell's difficulty, falling back to the one the table shares. */
function skillDifficulty(system: Record<string, any> | undefined): Difficulty {
  const given = String(system?.difficulty ?? "");
  // The steps are the same at every difficulty but a wildcard's, so an entry
  // with none set still steps rather than stalling.
  return (SKILL_DIFFICULTIES.includes(given) ? given : "E") as Difficulty;
}

/** A technique's difficulty; Average is the common one and the safer guess. */
function techniqueDifficulty(system: Record<string, any> | undefined): TechniqueDifficulty {
  return String(system?.difficulty ?? "") === "H" ? "H" : "A";
}

/** Whether an entry's amount is points off a cost table rather than levels. */
function pricedByTable(item: PlannedItem): boolean {
  return amountKind(item) === "points";
}

/** What a point total reaches, and the totals either side of it. */
export interface PointSteps {
  /** The total itself, snapped to one that buys something. */
  points: number;
  /** The next total up the table. */
  next: number;
  /** The total below, or the cheapest one where there is nothing below. */
  previous: number;
  /**
   * What those points reach: a skill's or spell's relative level, or the
   * levels a technique gains over its default. Null where they reach nothing.
   */
  relativeLevel: number | null;
}

/**
 * Snaps a point total down to one that actually buys a level, and gives the
 * steps either side of it.
 *
 * Snapping goes down, never up: a total is money already spent, so landing on
 * the level it reaches spends no more than the player asked for.
 */
export function pointSteps(item: PlannedItem, points: number): PointSteps {
  const wanted = Math.max(0, Math.floor(Number(points) || 0));
  const system = item.system ?? {};

  if (item.type === "technique") {
    const difficulty = techniqueDifficulty(system);
    const cheapest = nextTechniquePoints(0, difficulty);
    const levels = techniqueLevelsForPoints(wanted, difficulty);
    const snapped = levels <= 0 ? cheapest : techniquePointCost(levels, difficulty);
    return {
      points: snapped,
      next: nextTechniquePoints(snapped, difficulty),
      previous: Math.max(cheapest, previousTechniquePoints(snapped, difficulty)),
      relativeLevel: techniqueLevelsForPoints(snapped, difficulty),
    };
  }

  const difficulty = skillDifficulty(system);
  const cheapest = nextSkillPoints(0, difficulty);
  const reached = relativeLevelForPoints(wanted, difficulty);
  const snapped = reached === null
    ? cheapest
    : (pointsForRelativeLevel(reached, difficulty) ?? cheapest);
  return {
    points: snapped,
    next: nextSkillPoints(snapped, difficulty),
    previous: Math.max(cheapest, previousSkillPoints(snapped, difficulty)),
    relativeLevel: relativeLevelForPoints(snapped, difficulty),
  };
}

/**
 * The amount to take for an entry, snapped where the entry is priced from a
 * table. Levelled traits are counted in levels and pass through.
 */
export function snapAmount(item: PlannedItem, amount: number): number {
  if (!pricedByTable(item)) return Math.max(1, Math.floor(Number(amount) || 1));
  return pointSteps(item, amount).points;
}

/** The step above or below an amount, for the field's spinner. */
export function steppedAmount(item: PlannedItem, amount: number, direction: 1 | -1): number {
  if (!pricedByTable(item)) {
    return Math.max(1, Math.floor(Number(amount) || 1) + direction);
  }
  const steps = pointSteps(item, amount);
  return direction > 0 ? steps.next : steps.previous;
}
