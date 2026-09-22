/**
 * The Progression tab: where the points went, what the next step of every
 * improvable thing costs, and the log of points earned.
 *
 * An upgrade is never refused for want of points. Each row says whether it
 * would overspend, and by how much, so the sheet can flag it.
 *
 * Kept apart from the sheet so it can be tested without Foundry.
 */

import type { PointAward } from "../../rules/character-points.js";
import type { Attribute } from "../../rules/types.js";
import { byName } from "../sort.js";
import {
  attributeImprovement,
  itemImprovement,
  languageImprovement,
  secondaryImprovement,
  traitBuyOff,
  traitImprovement,
  type Improvement,
  type LevelledItem,
  type PricedTrait,
  type SecondaryKey,
} from "./improvements.js";

/** The ledger's categories, in the order the tab lists them. */
export const PROGRESSION_CATEGORIES = [
  "attributes",
  "secondaries",
  "advantages",
  "disadvantages",
  "quirks",
  "skills",
  "techniques",
  "spells",
  "languages",
  "templates",
] as const;

export type ProgressionCategory = (typeof PROGRESSION_CATEGORIES)[number];

/** Each category with the points the ledger has in it. */
export function ledgerCategories(ledger: Partial<Record<ProgressionCategory, unknown>>): Array<{ key: ProgressionCategory; points: number }> {
  return PROGRESSION_CATEGORIES.map((key) => ({ key, points: Number(ledger[key] ?? 0) || 0 }));
}

export interface ImprovementRow {
  /**
   * What an upgrade acts on: "attribute:DX", "secondary:hp", "item:<id>",
   * "trait:<id>", "buyoff:<id>" or "language:<id>:spoken".
   */
  key: string;
  /** "upgrade" buys the next step; "buyoff" pays to lose a disadvantage or a level of one. */
  kind: "upgrade" | "buyoff";
  category: ProgressionCategory;
  name: string;
  /** Points already in it: the score's cost for an attribute, the points for an item. */
  invested: number;
  /** Whether anything is already bought: a skill with points, any attribute. */
  owned: boolean;
  improve: Improvement;
}

export interface ProgressionInput {
  unspent: number;
  attributes: Array<{ key: Attribute; score: number; cost: number; effective?: number }>;
  secondaries: Array<{ key: SecondaryKey; label: string; purchased: number; value: number; cost: number }>;
  items: Array<{ id: string; name: string; type: "skill" | "technique" | "spell"; attributeScore: number | null; item: LevelledItem }>;
  traits: Array<{ id: string; name: string; category: string; points: number; trait: PricedTrait }>;
  languages?: Array<{ id: string; name: string; spoken: string; written: string; isNative: boolean; points: number }>;
}

/**
 * Every improvement on offer, a row each: attributes and secondary
 * characteristics in the book's order, then skills, techniques, spells,
 * levelled advantages and perks, disadvantages and quirks to buy off, and
 * languages' comprehension, each run by name.
 */
export function improvementRows(input: ProgressionInput): ImprovementRow[] {
  const rows: ImprovementRow[] = [];
  for (const a of input.attributes) {
    rows.push({ kind: "upgrade", key: `attribute:${a.key}`, category: "attributes", name: a.key, invested: a.cost, owned: true, improve: attributeImprovement(a.key, a.score, input.unspent, a.effective ?? a.score) });
  }
  for (const s of input.secondaries) {
    rows.push({ kind: "upgrade", key: `secondary:${s.key}`, category: "secondaries", name: s.label, invested: s.cost, owned: s.purchased !== 0, improve: secondaryImprovement(s.key, s.purchased, s.value, input.unspent) });
  }
  const categoryOf = { skill: "skills", technique: "techniques", spell: "spells" } as const;
  for (const entry of [...input.items].sort(byName)) {
    const improve = itemImprovement(entry.item, input.unspent, entry.attributeScore);
    if (!improve) continue;
    rows.push({ kind: "upgrade", key: `item:${entry.id}`, category: categoryOf[entry.type], name: entry.name, invested: improve.from, owned: improve.from > 0, improve });
  }
  for (const entry of [...input.traits].sort(byName)) {
    // Buying more of a disadvantage is not improving the character.
    if (entry.category !== "advantage" && entry.category !== "perk") continue;
    const improve = traitImprovement(entry.trait, input.unspent);
    if (!improve) continue;
    rows.push({ kind: "upgrade", key: `trait:${entry.id}`, category: "advantages", name: entry.name, invested: entry.points, owned: true, improve });
  }
  for (const entry of [...input.traits].sort(byName)) {
    if (entry.category !== "disadvantage" && entry.category !== "quirk") continue;
    const improve = traitBuyOff(entry.trait, input.unspent);
    if (!improve) continue;
    rows.push({ kind: "buyoff", key: `buyoff:${entry.id}`, category: entry.category === "quirk" ? "quirks" : "disadvantages", name: entry.name, invested: entry.points, owned: true, improve });
  }
  for (const entry of [...(input.languages ?? [])].sort(byName)) {
    for (const aspect of ["spoken", "written"] as const) {
      const improve = languageImprovement(entry[aspect], entry.isNative, input.unspent);
      if (!improve) continue;
      rows.push({ kind: "upgrade", key: `language:${entry.id}:${aspect}`, category: "languages", name: `${entry.name} (${aspect})`, invested: entry.points, owned: true, improve });
    }
  }
  return rows;
}

export const PROGRESSION_MODES = ["all", "affordable", "owned"] as const;
export type ProgressionMode = (typeof PROGRESSION_MODES)[number];

export function asProgressionMode(value: unknown): ProgressionMode {
  return (PROGRESSION_MODES as readonly string[]).includes(String(value)) ? (value as ProgressionMode) : "all";
}

/** The rows a mode shows: all of them, those within the budget, or those already bought into. */
export function rowsForMode<T extends ImprovementRow>(rows: readonly T[], mode: ProgressionMode): T[] {
  if (mode === "affordable") return rows.filter((r) => !r.improve.overspends);
  if (mode === "owned") return rows.filter((r) => r.owned);
  return [...rows];
}

/** The award log newest first, each with its stored index, and the sessions it names. */
export function awardHistory(awards: readonly PointAward[]): {
  rows: Array<PointAward & { index: number }>;
  sessions: number;
  latestSession: string;
} {
  const rows = awards
    .map((award, index) => ({ ...award, index }))
    .sort((a, b) => (Number(b.at) || 0) - (Number(a.at) || 0) || b.index - a.index);
  const named = new Set(awards.map((a) => String(a.session ?? "").trim()).filter(Boolean));
  const latest = rows.find((r) => String(r.session ?? "").trim())?.session ?? "";
  return { rows, sessions: named.size, latestSession: String(latest) };
}
