/**
 * A rule's reference page, where a content module provides one.
 *
 * The system cannot ship the books' text, so the Rules settings page names
 * each rule and cites its page. A GM who owns the book may install a content
 * module whose journal compendium carries the rule's own text, one entry a
 * rule, with the rule's switch key in a flag: `flags.<module>.rule =
 * "highSpeed"`. The page links to those entries when they are there, reading
 * the flag alone and knowing nothing of any module's id.
 */

/** A compendium index entry, as far as this reads it. */
export interface IndexedEntry {
  uuid: string;
  flags?: Record<string, unknown> | null;
}

/**
 * The reference page for each rule, by its key. The first entry to name a rule
 * keeps it: two modules flagging the same rule give one link, not two, and
 * neither is an error.
 */
export function ruleReferenceMap(entries: Iterable<IndexedEntry>): Map<string, string> {
  const out = new Map<string, string>();
  for (const entry of entries) {
    for (const key of flaggedRuleKeys(entry.flags)) {
      if (!out.has(key)) out.set(key, entry.uuid);
    }
  }
  return out;
}

/**
 * The keys a page can answer to. A module registers its own rules under its
 * id (`<module>.<key>`) and may flag its pages with the short key, since the
 * flag already sits in its own scope; the page links under both. A flag
 * naming a full key, or a system key, links under that alone.
 */
export function flaggedRuleKeys(flags: Record<string, unknown> | null | undefined): string[] {
  for (const [scope, scoped] of Object.entries(flags ?? {})) {
    const rule = (scoped as { rule?: unknown } | null)?.rule;
    if (typeof rule !== "string" || !rule.trim()) continue;
    const key = rule.trim();
    return key.includes(".") ? [key] : [key, `${scope}.${key}`];
  }
  return [];
}

/**
 * The reference pages the active modules' journal compendia provide.
 *
 * Only the index is read, with the flags added to its fields, so no journal is
 * loaded until one is opened. A pack that cannot be indexed is passed over:
 * a broken module should cost its own links, not the settings page.
 */
export async function ruleReferencePages(): Promise<Map<string, string>> {
  const entries: IndexedEntry[] = [];
  for (const pack of game.packs ?? []) {
    if (pack?.documentName !== "JournalEntry") continue;
    const packageName = pack.metadata?.packageName;
    if (pack.metadata?.packageType !== "module" || !game.modules?.get(packageName)?.active) continue;
    try {
      const index = await pack.getIndex({ fields: ["flags"] });
      for (const entry of index) {
        entries.push({
          uuid: String(entry.uuid ?? `Compendium.${pack.collection}.JournalEntry.${entry._id}`),
          flags: entry.flags ?? null,
        });
      }
    } catch (error) {
      console.warn(`gworld | could not read ${pack.collection} for rule references`, error);
    }
  }
  return ruleReferenceMap(entries);
}
