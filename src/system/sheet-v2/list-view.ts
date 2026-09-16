/**
 * The list-with-a-detail-panel the new sheet's tabs share: how rows are
 * sorted, grouped and filtered, and which one is selected.
 *
 * Name is the default order everywhere. A list may also be sorted by level or
 * by points, highest first, with name breaking ties so the order is stable.
 *
 * Kept apart from the sheet so it can be tested without Foundry.
 */

import { byName } from "../sort.js";

export const SORT_MODES = ["name", "level", "points"] as const;
export type SortMode = (typeof SORT_MODES)[number];

/** Reads a stored or chosen sort back into one the list knows, defaulting to name. */
export function asSortMode(value: unknown): SortMode {
  return (SORT_MODES as readonly string[]).includes(String(value)) ? (value as SortMode) : "name";
}

export interface SortableRow {
  name: string;
  id?: string;
  level?: number | null;
  points?: number | null;
}

const numberOr = (value: unknown, fallback: number) => (value === null || value === undefined || !Number.isFinite(Number(value)) ? fallback : Number(value));

/** A sorted copy of the rows. A row with no level sorts after those that have one. */
export function sortRows<T extends SortableRow>(rows: readonly T[], mode: SortMode): T[] {
  const copy = [...rows];
  if (mode === "level") return copy.sort((a, b) => numberOr(b.level, -Infinity) - numberOr(a.level, -Infinity) || byName(a, b));
  if (mode === "points") return copy.sort((a, b) => numberOr(b.points, 0) - numberOr(a.points, 0) || byName(a, b));
  return copy.sort(byName);
}

export interface RowGroup<T> {
  key: string;
  rows: T[];
}

/**
 * Rows in groups, in the order given; a key not in the order follows, by
 * name. Empty groups are left out.
 */
export function groupRows<T>(rows: readonly T[], keyOf: (row: T) => string, order: readonly string[]): RowGroup<T>[] {
  const buckets = new Map<string, T[]>();
  for (const row of rows) {
    const key = keyOf(row);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(row);
  }
  const extra = [...buckets.keys()].filter((k) => !order.includes(k)).sort((a, b) => a.localeCompare(b));
  return [...order, ...extra].filter((k) => buckets.has(k)).map((key) => ({ key, rows: buckets.get(key)! }));
}

/** The row to show in the detail panel: the one wanted if it is still there, or else the first. */
export function selectedKey(keys: readonly string[], wanted: string | null | undefined): string | null {
  if (wanted && keys.includes(wanted)) return wanted;
  return keys[0] ?? null;
}

/** Whether a row's name matches what was typed into a search box. */
export function matchesSearch(name: string, needle: string): boolean {
  const n = needle.trim().toLowerCase();
  return n.length === 0 || name.toLowerCase().includes(n);
}

/** The first line of an HTML description, for a row's summary. */
export function firstLine(html: unknown, limit = 90): string {
  const text = String(html ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'");
  const line = text.split("\n").map((l) => l.trim()).find(Boolean) ?? "";
  if (line.length <= limit) return line;
  const cut = line.slice(0, limit);
  const space = cut.lastIndexOf(" ");
  return `${(space > limit * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}
