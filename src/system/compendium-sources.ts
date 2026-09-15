/**
 * Which compendia the picker draws from.
 *
 * The system ships four packs, and until now the picker read every Item pack
 * in the world -- which was the same thing, since nobody else's packs held
 * this system's item types. A GM keeping a private pack of house-ruled
 * advantages, or a campaign's own gear list, had no way to offer it to their
 * players in the same list as the book's.
 *
 * The choice is a world setting: a list of pack ids, empty meaning "the
 * system's own". The pure half here decides what that list means; the
 * settings page that edits it lives in `apps/compendium-sources.ts`.
 */

import { SYSTEM_ID } from "./constants.js";

export const COMPENDIUM_SOURCES_KEY = "compendiumSources";

/** What this module needs to know about a pack. */
export interface PackSummary {
  /** The pack's id, e.g. "gworld.skills" or "world.house-rules". */
  collection: string;
  label: string;
  /** "system", "world" or "module". */
  packageType: string;
  packageName: string;
  documentName: string;
  /**
   * The book the pack is one part of, from the pack's manifest entry
   * (`flags.gworld.book`), and the title to show it under. A module carrying
   * a book ships one pack per item type, and a GM wants one switch per book
   * rather than one per pack. Absent on packs that carry no such flag.
   */
  book?: string;
  bookTitle?: string;
}

/** One row of the settings page: a book, or a package's packs grouped as one. */
export interface BookRow {
  key: string;
  title: string;
  /** Whether the row comes from a book flag, or is only packs of one package. */
  flagged: boolean;
  packs: PackSummary[];
}

/** How much of a book is ticked. */
export type BookState = "all" | "some" | "none";

/**
 * Packs grouped one row per book, in the order they were first seen.
 *
 * A pack that names its book goes under that book's title; one that does not
 * goes under its package, which for a module of one pack is the same row it
 * was always on. The system's own packs all name the Basic Set, so they come
 * up as one row too.
 */
export function groupByBook(packs: readonly PackSummary[]): BookRow[] {
  const rows = new Map<string, BookRow>();
  for (const pack of packs) {
    const flagged = Boolean(pack.book);
    const key = flagged ? `book:${pack.packageName}:${pack.book}` : `package:${pack.packageName}`;
    let row = rows.get(key);
    if (!row) {
      row = {
        key,
        title: flagged ? pack.bookTitle || String(pack.book) : pack.packageName,
        flagged,
        packs: [],
      };
      rows.set(key, row);
    }
    row.packs.push(pack);
  }
  return [...rows.values()];
}

/** Whether every pack of a row is chosen, some are, or none is. */
export function bookState(row: BookRow, chosen: ReadonlySet<string>): BookState {
  const ticked = row.packs.filter((pack) => chosen.has(pack.collection)).length;
  if (ticked === 0) return "none";
  return ticked === row.packs.length ? "all" : "some";
}

/** The packs this system ships: every Item pack the system package itself provides. */
export function defaultSources(packs: readonly PackSummary[], systemId: string): string[] {
  return packs
    .filter((pack) => pack.documentName === "Item")
    .filter((pack) => pack.packageType === "system" && pack.packageName === systemId)
    .map((pack) => pack.collection);
}

/**
 * The system's own packs that a module's stand in for, each with the packs
 * that replace it.
 *
 * A module that ships its own copy of a book the system ships -- the same
 * `flags.gworld.book`, and packs of the same document type -- is the copy
 * the table means to use. Offering both lists every entry twice, so the
 * system's packs of that book and type give way to the module's.
 */
export function supersededPacks(packs: readonly PackSummary[], systemId: string): Map<string, string[]> {
  const replaced = new Map<string, string[]>();
  for (const pack of packs) {
    if (pack.packageType !== "system" || pack.packageName !== systemId || !pack.book) continue;
    const by = packs
      .filter((other) => other.packageType === "module" && other.book === pack.book && other.documentName === pack.documentName)
      .map((other) => other.collection);
    if (by.length > 0) replaced.set(pack.collection, by);
  }
  return replaced;
}

/**
 * The packs the setting names, kept to those that exist.
 *
 * An empty or unreadable setting means the system's own packs, and so does a
 * setting naming only packs that have since been removed: a picker with
 * nothing in it would be worse than one with the book in it. A system pack a
 * module's copy of its book supersedes is read as that copy, either way.
 */
export function chosenSources(
  packs: readonly PackSummary[],
  setting: unknown,
  systemId: string,
): string[] {
  const named = Array.isArray(setting) ? setting.filter((s): s is string => typeof s === "string") : [];
  const replaced = supersededPacks(packs, systemId);
  const swap = (list: readonly string[]) => [...new Set(list.flatMap((collection) => replaced.get(collection) ?? [collection]))];
  const available = new Set(
    packs.filter((pack) => pack.documentName === "Item" && !replaced.has(pack.collection)).map((pack) => pack.collection),
  );
  const kept = swap(named).filter((collection) => available.has(collection));
  return kept.length > 0 ? kept : swap(defaultSources(packs, systemId)).filter((collection) => available.has(collection));
}

/** A pack as Foundry describes it, reduced to what the setting cares about. */
export function summarisePack(pack: any): PackSummary {
  const summary: PackSummary = {
    collection: String(pack?.collection ?? ""),
    label: String(pack?.title ?? pack?.metadata?.label ?? pack?.collection ?? ""),
    packageType: String(pack?.metadata?.packageType ?? ""),
    packageName: String(pack?.metadata?.packageName ?? ""),
    documentName: String(pack?.documentName ?? pack?.metadata?.type ?? ""),
  };
  const flags = pack?.metadata?.flags?.[SYSTEM_ID];
  const book = String(flags?.book ?? "").trim();
  if (book) {
    summary.book = book;
    const title = String(flags?.bookTitle ?? "").trim();
    if (title) summary.bookTitle = title;
  }
  return summary;
}

/** Every Item pack the world can see, as summaries. */
export function availablePacks(): PackSummary[] {
  return [...((game as any).packs ?? [])]
    .map(summarisePack)
    .filter((pack) => pack.documentName === "Item");
}

/** The system packs a module's copy of their book supersedes, of any document type. */
export function supersededCollections(): Set<string> {
  const packs = [...((game as any).packs ?? [])].map(summarisePack);
  return new Set(supersededPacks(packs, SYSTEM_ID).keys());
}

/**
 * Takes superseded packs out of the Compendium sidebar while the module that
 * supersedes them is active. Only the rendered list is changed: the world's
 * compendium configuration is left alone, so they are back once it is off.
 */
export function registerSupersededPackHiding(): void {
  Hooks.on("renderCompendiumDirectory", (_app: unknown, html: HTMLElement) => {
    const superseded = supersededCollections();
    if (superseded.size === 0) return;
    for (const entry of html.querySelectorAll<HTMLElement>("[data-pack]")) {
      if (superseded.has(String(entry.dataset.pack ?? ""))) entry.remove();
    }
  });
}

/** The ids of the packs the picker should read, as the world is configured. */
export function sourceCollections(): Set<string> {
  let setting: unknown = [];
  try {
    setting = game.settings.get(SYSTEM_ID, COMPENDIUM_SOURCES_KEY);
  } catch {
    // Not registered yet, which only happens before init; the default serves.
  }
  return new Set(chosenSources(availablePacks(), setting, SYSTEM_ID));
}
