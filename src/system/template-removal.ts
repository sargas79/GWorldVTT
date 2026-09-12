/**
 * What taking a template off will actually do, worked out before it is done.
 *
 * A template's record says what it added and what it overwrote. Between then
 * and now the character has been played with: a trait it granted may have
 * been given levels, an attribute it set may have been raised by hand. "You
 * are free to alter anything that came with it" (Characters p. 258) means
 * those alterations are the player's, and removal should neither throw them
 * away unannounced nor fail because of them.
 *
 * So the removal is planned: which of the template's items are still there
 * and which of those were edited since, which numbers still read what the
 * template wrote -- and so go back to what they were -- and which the player
 * has changed since, and so are left alone. The dialog shows the plan, and
 * the removal follows it.
 *
 * Kept apart from the Foundry document so it can be tested without one.
 */

/** The part of an applied-template record the plan reads. */
export interface RemovalRecord {
  name: string;
  itemIds: readonly string[];
  /** What each path held before the template wrote it. */
  previous?: Record<string, number>;
  /**
   * What the template wrote to each path. Absent on records made before
   * this was kept, for which every previous value is restored as it was.
   */
  written?: Record<string, number>;
  /** When it was applied, as a timestamp; null or absent for older records. */
  at?: number | null;
}

/** What the plan needs to know about an item the template added. */
export interface RemovalItem {
  id: string;
  name: string;
  /** Foundry's `_stats.modifiedTime`, if the item carries one. */
  modifiedTime?: number | null;
}

export interface RemovalPlan {
  /** Items the template added that are still on the sheet. */
  present: RemovalItem[];
  /** Of those, the ones changed after the template was applied. */
  edited: RemovalItem[];
  /** How many of the template's items are already gone. */
  missing: number;
  /** Paths still reading what the template wrote, and what they go back to. */
  restore: Record<string, number>;
  /** Paths the player changed since, with their present value, left alone. */
  kept: Array<{ path: string; value: number }>;
}

export function planTemplateRemoval(
  record: RemovalRecord,
  items: ReadonlyMap<string, RemovalItem>,
  current: (path: string) => number | undefined,
): RemovalPlan {
  const present: RemovalItem[] = [];
  let missing = 0;
  for (const id of record.itemIds) {
    const item = items.get(id);
    if (item) present.push(item);
    else missing += 1;
  }

  const at = typeof record.at === "number" ? record.at : null;
  const edited = at === null
    ? []
    : present.filter((item) => typeof item.modifiedTime === "number" && item.modifiedTime > at);

  const restore: Record<string, number> = {};
  const kept: Array<{ path: string; value: number }> = [];
  const written = record.written ?? {};
  for (const [path, before] of Object.entries(record.previous ?? {})) {
    const wrote = written[path];
    const now = current(path);
    // A number the template never recorded writing is restored as it always
    // was; one it did is restored only while it still reads what was written.
    if (wrote !== undefined && now !== undefined && now !== wrote) {
      kept.push({ path, value: now });
    } else {
      restore[path] = before;
    }
  }

  return { present, edited, missing, restore, kept };
}

/** Whether the plan has anything the player should look at before agreeing. */
export function needsReview(plan: RemovalPlan): boolean {
  return plan.edited.length > 0 || plan.kept.length > 0;
}
