/**
 * What an applied template gave a character, each part with its price
 * (GURPS Basic Set: Characters pp. 258, 261).
 *
 * A template's traits and skills are items, and each shows the points it
 * cost. Its attributes and secondary characteristics are numbers written onto
 * the character, and until #631 they were listed bare -- "ST 13", "HP +2" --
 * so nothing on the sheet said what that half of the template came to, or let
 * a player check the whole against the template's stated cost.
 *
 * A character template buys its scores at the ordinary rate, so each line is
 * priced by what it moved the score from and to: on a fresh character that is
 * the book's own price, and a second template stacked on the first is billed
 * only for what it raised. A racial template's modifiers are billed as one
 * racial cost, which the book may discount (a Dragon's ST is cheaper for its
 * size), so each line carries its list price only when the list prices add up
 * to what was billed; otherwise the lines stay bare and the racial cost gets a
 * line of its own.
 *
 * Kept apart from the sheet so it can be tested without Foundry: the lines
 * carry keys, and the sheet labels them.
 */

import {
  attributePointCost,
  basicSpeedPointCost,
  secondaryPointCost,
  type SECONDARY_COST_PER_LEVEL,
} from "../../rules/attributes.js";
import type { Attribute } from "../../rules/types.js";

/** One line of what a template gave. */
export interface TemplateGrantLine {
  /**
   * What the line is: "attribute" and "secondary" name a score by `key`,
   * "modifiers" is a racial cost billed as a whole, "item" and "raised" an
   * item by `name`.
   */
  kind: "attribute" | "secondary" | "modifiers" | "item" | "raised";
  /** The attribute or secondary key ("ST", "hp", "sm"), for those lines. */
  key?: string;
  /** The item's name, for item lines. */
  name?: string;
  /** The score written ("ST 13"), for a character template's attribute. */
  score?: number;
  /** The levels added or granted ("HP +2"). */
  change?: number;
  /** The points the line cost, or null where it has no price of its own. */
  cost: number | null;
}

export interface TemplateGrants {
  lines: TemplateGrantLine[];
  /** What the template came to on this character: every priced part added up. */
  total: number;
}

/** The parts of an applied-template record this reads. */
export interface AppliedTemplateRecord {
  kind?: string;
  attributeCost?: unknown;
  granted?: Record<string, unknown>;
  /** Flattened: "attributes.ST", "purchased.hp". */
  previous?: Record<string, unknown>;
  written?: Record<string, unknown>;
  itemIds?: readonly string[];
  raised?: ReadonlyArray<{ id: string; points?: unknown; levels?: unknown }>;
}

/** An item as far as its price goes, or undefined when it is gone. */
export type ItemLookup = (id: string) =>
  | {
      name: string;
      /** What the item bills: a trait's total, a skill's points. */
      total?: unknown;
      /** The stored `system.points`, which a raise records. */
      points?: unknown;
      levels?: unknown;
      pointsPerLevel?: unknown;
    }
  | undefined;

const ATTRIBUTES = new Set(["ST", "DX", "IQ", "HT"]);
const SECONDARIES = new Set(["hp", "will", "per", "fp", "basicSpeed", "basicMove"]);

function number(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** The price of `levels` of a secondary characteristic, or of a Basic Speed adjustment. */
function secondaryPrice(key: string, levels: number): number {
  if (key === "basicSpeed") return basicSpeedPointCost(levels);
  return secondaryPointCost(key as Exclude<keyof typeof SECONDARY_COST_PER_LEVEL, "basicSpeedQuarter">, levels);
}

/** The list price of a modifier a racial template granted; size has none. */
function modifierPrice(key: string, levels: number): number | null {
  if (ATTRIBUTES.has(key)) return attributePointCost(key as Attribute, 10 + levels);
  if (SECONDARIES.has(key)) return secondaryPrice(key, levels);
  return null;
}

export function templateGrants(record: AppliedTemplateRecord, itemOf: ItemLookup): TemplateGrants {
  const lines: TemplateGrantLine[] = [];
  let total = 0;

  // A character template's scores, bought at the ordinary rate.
  const written = record.written ?? {};
  const previous = record.previous ?? {};
  for (const [path, value] of Object.entries(written)) {
    const [where, key = ""] = path.split(".");
    const now = number(value);
    if (where === "attributes" && ATTRIBUTES.has(key)) {
      const before = previous[path] === undefined ? 10 : number(previous[path]);
      const cost = attributePointCost(key as Attribute, now) - attributePointCost(key as Attribute, before);
      lines.push({ kind: "attribute", key, score: now, cost });
      total += cost;
    } else if (where === "purchased" && SECONDARIES.has(key)) {
      const added = now - number(previous[path]);
      if (!added) continue;
      const cost = secondaryPrice(key, added);
      lines.push({ kind: "secondary", key, change: added, cost });
      total += cost;
    }
  }

  // A racial template's modifiers, billed as one racial cost.
  const granted = Object.entries(record.granted ?? {})
    .map(([key, value]) => ({ key, change: number(value) }))
    .filter((entry) => entry.change !== 0);
  const billed = number(record.attributeCost);
  const listed = granted.reduce((sum, entry) => sum + (modifierPrice(entry.key, entry.change) ?? 0), 0);
  const priceEach = listed === billed;
  for (const { key, change } of granted) {
    const kind = ATTRIBUTES.has(key) ? "attribute" : "secondary";
    lines.push({ kind, key, change, cost: priceEach ? modifierPrice(key, change) : null });
  }
  if (billed && !priceEach) lines.push({ kind: "modifiers", cost: billed });
  total += billed;

  for (const id of record.itemIds ?? []) {
    const item = itemOf(id);
    if (!item) continue;
    const cost = item.total === undefined || !Number.isFinite(Number(item.total)) ? null : Number(item.total);
    lines.push({ kind: "item", name: item.name, cost });
    total += cost ?? 0;
  }

  // An item an earlier template gave, raised to what this one needs: this
  // template paid the difference, in points or in levels.
  for (const raised of record.raised ?? []) {
    const item = itemOf(raised.id);
    if (!item) continue;
    const levels = raised.levels === undefined ? 0 : number(item.levels) - number(raised.levels);
    const cost = number(item.points) - number(raised.points) + levels * number(item.pointsPerLevel);
    lines.push({ kind: "raised", name: item.name, cost });
    total += cost;
  }

  return { lines, total };
}
