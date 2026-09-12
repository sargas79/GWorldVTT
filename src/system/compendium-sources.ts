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
}

/** The packs this system ships: every Item pack the system package itself provides. */
export function defaultSources(packs: readonly PackSummary[], systemId: string): string[] {
  return packs
    .filter((pack) => pack.documentName === "Item")
    .filter((pack) => pack.packageType === "system" && pack.packageName === systemId)
    .map((pack) => pack.collection);
}

/**
 * The packs the setting names, kept to those that exist.
 *
 * An empty or unreadable setting means the system's own packs, and so does a
 * setting naming only packs that have since been removed: a picker with
 * nothing in it would be worse than one with the book in it.
 */
export function chosenSources(
  packs: readonly PackSummary[],
  setting: unknown,
  systemId: string,
): string[] {
  const named = Array.isArray(setting) ? setting.filter((s): s is string => typeof s === "string") : [];
  const available = new Set(
    packs.filter((pack) => pack.documentName === "Item").map((pack) => pack.collection),
  );
  const kept = named.filter((collection) => available.has(collection));
  return kept.length > 0 ? kept : defaultSources(packs, systemId);
}

/** A pack as Foundry describes it, reduced to what the setting cares about. */
export function summarisePack(pack: any): PackSummary {
  return {
    collection: String(pack?.collection ?? ""),
    label: String(pack?.title ?? pack?.metadata?.label ?? pack?.collection ?? ""),
    packageType: String(pack?.metadata?.packageType ?? ""),
    packageName: String(pack?.metadata?.packageName ?? ""),
    documentName: String(pack?.documentName ?? pack?.metadata?.type ?? ""),
  };
}

/** Every Item pack the world can see, as summaries. */
export function availablePacks(): PackSummary[] {
  return [...((game as any).packs ?? [])]
    .map(summarisePack)
    .filter((pack) => pack.documentName === "Item");
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
