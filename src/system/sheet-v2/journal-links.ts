/**
 * A character's links to Foundry documents that tell their story: quests,
 * clues, people, places and notes.
 *
 * The journal holds the text, with its own permissions and editor; the
 * character keeps only which document and what kind of thing it is. The
 * sheet's Journal tab shows the linked text in place.
 *
 * Kept apart from the sheet so it can be tested without Foundry.
 */

export const JOURNAL_KINDS = ["quest", "clue", "person", "place", "note"] as const;
export type JournalKind = (typeof JOURNAL_KINDS)[number];

export interface JournalLink {
  uuid: string;
  kind: JournalKind;
}

export function isJournalKind(value: unknown): value is JournalKind {
  return typeof value === "string" && (JOURNAL_KINDS as readonly string[]).includes(value);
}

/** Reads stored links, dropping any that are malformed. */
export function readLinks(value: unknown): JournalLink[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((l): l is { uuid: string; kind: unknown } => typeof l?.uuid === "string" && l.uuid.length > 0)
    .map((l) => ({ uuid: l.uuid, kind: isJournalKind(l.kind) ? l.kind : "note" }));
}

/** The links with one added, or its kind changed if it is already linked. */
export function addLink(links: readonly JournalLink[], uuid: string, kind: JournalKind): JournalLink[] {
  if (!uuid) return [...links];
  const existing = links.find((l) => l.uuid === uuid);
  if (existing) return links.map((l) => (l.uuid === uuid ? { uuid, kind } : l));
  return [...links, { uuid, kind }];
}

/** The links without one. */
export function removeLink(links: readonly JournalLink[], uuid: string): JournalLink[] {
  return links.filter((l) => l.uuid !== uuid);
}

/**
 * What kind a dropped document is linked as when the place it was dropped
 * does not say: an actor is a person, a scene a place, and anything else takes
 * the kind being looked at.
 */
export function kindForDrop(documentName: string, looking: unknown): JournalKind {
  if (documentName === "Actor") return "person";
  if (documentName === "Scene") return "place";
  return isJournalKind(looking) ? looking : "note";
}

/** The document types a character's journal can link. */
export const LINKABLE_DOCUMENTS = ["JournalEntry", "JournalEntryPage", "Actor", "Scene"] as const;
