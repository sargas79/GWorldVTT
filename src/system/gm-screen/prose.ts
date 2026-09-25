/**
 * The book's own text for each section, from a content module.
 *
 * The system can't ship the books' prose. A GM who owns the book may install
 * a module whose journal carries it, one entry for each section or part, with
 * the section's id in a flag: `flags.<module>.gmScreen = "criticalHit"`, or a
 * list of ids where one passage covers several. The screen finds those
 * entries by the flag alone, as the Rules page finds its reference pages
 * (`rule-references.ts`), knowing nothing of any module's id. A world journal
 * entry flagged the same way counts too, for a GM who writes their own.
 */

/** A journal entry as the index gives it, as far as this reads it. */
export interface ProseEntry {
  uuid: string;
  flags?: Record<string, unknown> | null;
  /** Whether this user may read it. */
  visible: boolean;
}

/** The section ids an entry's flags name, from any scope. */
export function proseTargetsOf(flags: Record<string, unknown> | null | undefined): string[] {
  const out: string[] = [];
  for (const scoped of Object.values(flags ?? {})) {
    const named = (scoped as { gmScreen?: unknown } | null)?.gmScreen;
    const ids = Array.isArray(named) ? named : [named];
    for (const id of ids) if (typeof id === "string" && id.trim()) out.push(id.trim());
  }
  return out;
}

/**
 * The entry for each section id, among the ones this user may read. The first
 * to name an id keeps it: two modules giving the same section's text show one,
 * and neither is an error.
 */
export function proseMap(entries: Iterable<ProseEntry>): Map<string, string> {
  const out = new Map<string, string>();
  for (const entry of entries) {
    if (!entry.visible) continue;
    for (const id of proseTargetsOf(entry.flags)) if (!out.has(id)) out.set(id, entry.uuid);
  }
  return out;
}

/** Whether a module's prose is a document's uuid rather than HTML. */
export function isUuid(prose: string): boolean {
  return /^(Compendium|JournalEntry)\.[\w.-]+$/.test(prose.trim());
}

/**
 * Every flagged entry this user may read: the active modules' journal packs,
 * read by index only so nothing loads until it's shown, and the world's
 * journal. A pack that can't be indexed costs its own text, not the screen.
 */
export async function proseEntries(): Promise<Map<string, string>> {
  const g = game as any;
  const user = g.user;
  const entries: ProseEntry[] = [];
  for (const pack of g.packs ?? []) {
    if (pack?.documentName !== "JournalEntry") continue;
    const packageName = pack.metadata?.packageName;
    if (pack.metadata?.packageType !== "module" || !g.modules?.get(packageName)?.active) continue;
    const visible =
      user?.isGM === true ||
      (typeof pack.testUserPermission === "function"
        ? pack.testUserPermission(user, "OBSERVER")
        : pack.visible !== false);
    if (!visible) continue;
    try {
      const index = await pack.getIndex({ fields: ["flags"] });
      for (const entry of index) {
        entries.push({
          uuid: String(entry.uuid ?? `Compendium.${pack.collection}.JournalEntry.${entry._id}`),
          flags: entry.flags ?? null,
          visible: true,
        });
      }
    } catch (error) {
      console.warn(`gworld | could not read ${pack.collection} for the GM Screen`, error);
    }
  }
  for (const entry of g.journal ?? []) {
    entries.push({
      uuid: String(entry.uuid),
      flags: entry.flags ?? null,
      visible: entry.testUserPermission?.(user, "OBSERVER") === true,
    });
  }
  return proseMap(entries);
}

/**
 * A journal entry's text, ready to show: its text pages in order, each under
 * its own name where there are several, enriched so links and rolls work. A
 * page's own uuid gives that page alone. Empty where there is nothing to show
 * or the user may not read it.
 */
export async function proseHtml(uuid: string): Promise<string> {
  const g = game as any;
  let doc: any;
  try {
    doc = await (globalThis as any).fromUuid(uuid);
  } catch (error) {
    console.warn(`gworld | GM Screen prose ${uuid} could not be loaded`, error);
    return "";
  }
  if (!doc) return "";
  const pages: any[] =
    doc.documentName === "JournalEntryPage"
      ? [doc]
      : [...(doc.pages ?? [])].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
  const text = pages.filter(
    (page) => page.type === "text" && page.testUserPermission?.(g.user, "OBSERVER") !== false,
  );
  const enrich = (html: string) =>
    (foundry as any).applications.ux.TextEditor.implementation.enrichHTML(html, {
      relativeTo: doc,
      secrets: g.user?.isGM === true,
    });
  const parts: string[] = [];
  for (const page of text) {
    const body = await enrich(String(page.text?.content ?? ""));
    parts.push(
      text.length > 1
        ? `<h4 class="gs-prose-page">${escapeHtml(String(page.name ?? ""))}</h4>${body}`
        : body,
    );
  }
  return parts.join("");
}

/** A module's own prose: a document to load, or HTML to enrich. */
export async function moduleProseHtml(prose: string): Promise<string> {
  if (isUuid(prose)) return proseHtml(prose.trim());
  return (foundry as any).applications.ux.TextEditor.implementation.enrichHTML(prose, {
    secrets: (game as any).user?.isGM === true,
  });
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
