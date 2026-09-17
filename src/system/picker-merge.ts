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
import { nextSpellPoints, previousSpellPoints, type MagicStyle, type SpellDifficulty } from "../rules/magic.js";
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

/**
 * The key naming what a custom entry is: the category for a trait ("Quirk"),
 * the type's own label for anything else. The picker's custom row and the
 * sheet's Add buttons both name a new item from it, so a quirk made either
 * way is a "New quirk" and never a "New Trait".
 */
export function customKindKey(custom: PickerCustom): string {
  return custom.category ? `GWORLD.Picker.Kind.${custom.category}` : `TYPES.Item.${custom.itemType}`;
}

/**
 * Whether an item's name is the player's to write in the row.
 *
 * A quirk or a perk is the player's own words -- "Always orders the fish" --
 * and so is any trait that came from nowhere in the compendia, which is what
 * a blank reference means. A trait the book prints keeps the book's name.
 */
export function namedByPlayer(item: { type?: unknown; system?: { category?: unknown; reference?: unknown } | null }): boolean {
  if (item.type !== "trait") return false;
  const category = String(item.system?.category ?? "");
  if (category === "quirk" || category === "perk") return true;
  return !String(item.system?.reference ?? "").trim();
}

/** The key of what a name field asks for, until it is filled in. */
export function namePlaceholderKey(category: unknown): string {
  const kind = String(category ?? "");
  return kind === "quirk" || kind === "perk" ? `GWORLD.Builder.NamePlaceholder.${kind}` : "GWORLD.Builder.NamePlaceholder.trait";
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
  // A ritual spell is priced as a Hard technique, not off the Skill Cost Table
  // (the sheet's own stepping does the same in advancement.ts), so a spell is
  // asked about through its own pair rather than the skill one.
  const spell = item.type === "spell";
  const style = (system?.derived?.style ?? "standard") as MagicStyle;
  const up = (points: number) => spell
    ? nextSpellPoints(points, difficulty as SpellDifficulty, style)
    : nextSkillPoints(points, difficulty);
  const down = (points: number) => spell
    ? previousSpellPoints(points, difficulty as SpellDifficulty, style)
    : previousSkillPoints(points, difficulty);

  const cheapest = up(0);
  // A ritual spell's totals are the technique table's, which the relative-level
  // helpers do not describe, so the snap walks the same steps the field does.
  if (spell && style === "ritual") {
    let snapped = cheapest;
    while (up(snapped) <= wanted) snapped = up(snapped);
    return {
      points: snapped,
      next: up(snapped),
      previous: Math.max(cheapest, down(snapped)),
      relativeLevel: techniqueLevelsForPoints(snapped, "H"),
    };
  }

  const reached = relativeLevelForPoints(wanted, difficulty);
  const snapped = reached === null
    ? cheapest
    : (pointsForRelativeLevel(reached, difficulty) ?? cheapest);
  return {
    points: snapped,
    next: up(snapped),
    previous: Math.max(cheapest, down(snapped)),
    relativeLevel: relativeLevelForPoints(snapped, difficulty),
  };
}

/**
 * The points a character already has in an entry, if they have it at all.
 *
 * The amount beside a row is what will be *added* -- `planAddition` writes
 * `from + points` -- so the total to keep on the table is the one the character
 * ends up at, not the amount by itself. Raising a skill already worth 1 point
 * by 3 reaches 4, which is a step; snapping the 3 on its own to 2 would reach 3,
 * which buys nothing 2 does not.
 */
export function existingPoints(item: PlannedItem, existing: readonly PlannedItem[]): number {
  const match = existing.find(
    (candidate) => candidate.id && candidate.type === item.type && sameName(candidate.name, item.name),
  );
  return Math.max(0, Math.floor(Number(match?.system?.points ?? 0)));
}

/**
 * The amount to take for an entry, snapped where the entry is priced from a
 * table. Levelled traits are counted in levels and pass through.
 *
 * `held` is what the character already has in it, so the snap lands the *total*
 * on a step rather than the increment.
 */
export function snapAmount(item: PlannedItem, amount: number, held = 0): number {
  if (!pricedByTable(item)) return Math.max(1, Math.floor(Number(amount) || 1));
  const floor = Math.max(0, Math.floor(Number(held) || 0));
  const wanted = floor + Math.max(0, Math.floor(Number(amount) || 0));
  // Never below the smallest total that adds anything: an amount of nothing
  // would buy nothing, and the field is there to buy something.
  const total = Math.max(smallestTotalAbove(item, floor), pointSteps(item, wanted).points);
  return total - floor;
}

/**
 * The cheapest total on the table that is worth more than the points already
 * held. For a character with none, that is the cheapest total there is.
 */
function smallestTotalAbove(item: PlannedItem, held: number): number {
  return held <= 0 ? pointSteps(item, 0).points : pointSteps(item, held).next;
}

/** The step above or below an amount, for the field's spinner. */
export function steppedAmount(item: PlannedItem, amount: number, direction: 1 | -1, held = 0): number {
  if (!pricedByTable(item)) {
    return Math.max(1, Math.floor(Number(amount) || 1) + direction);
  }
  const floor = Math.max(0, Math.floor(Number(held) || 0));
  const total = floor + snapAmount(item, amount, floor);
  const steps = pointSteps(item, total);
  const moved = direction > 0 ? steps.next : steps.previous;
  // Down stops at the cheapest total that adds anything to what they hold.
  return Math.max(smallestTotalAbove(item, floor), moved) - floor;
}
