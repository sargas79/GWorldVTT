/**
 * A ranged mode's Shots entry as the table gives it, and as the modules
 * change it (since API 1.54.0).
 *
 * What a weapon holds and how long it takes to reload are read from its Shots
 * column (Campaigns p. 373). The stored column is the table's figure and stays
 * so; a module whose rules load a weapon with more or fewer shots, or reload
 * it faster or slower, changes the parsed entry through `gworld.shotsEntry`
 * instead. Everything that reads capacity or reload time reads it from here.
 */

import { parseShots, type ShotsEntry } from "../rules/ammunition.js";
import { COMBAT_HOOKS, callCombatHook } from "./combat-extensions.js";

/** What `gworld.shotsEntry` hands its listeners. */
export interface ShotsEntryContext {
  /** Whoever holds the weapon, where it is held. */
  actor: any;
  item: any;
  modeIndex: number;
  /** The stored mode, read-only. */
  mode: any;
  /** The parsed entry, which a listener may change. */
  entry: ShotsEntry;
}

/** A whole, non-negative count, or null. */
function countOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Math.floor(Number(value));
  return Number.isFinite(n) ? Math.max(0, n) : null;
}

/**
 * The Shots entry for a mode, once the modules have had their say. A listener
 * that throws, or writes nonsense, leaves the table's figure: a count or a
 * time that isn't a number reads as the column's own.
 */
export function shotsEntryFor(item: any, modeIndex: number, mode: any = item?.system?.rangedModes?.[modeIndex]): ShotsEntry {
  const table = parseShots(String(mode?.shots ?? ""));
  const context: ShotsEntryContext = {
    actor: item?.actor ?? item?.parent ?? null,
    item,
    modeIndex,
    mode,
    entry: { ...table },
  };
  callCombatHook(COMBAT_HOOKS.shotsEntry, context);
  const asked = context.entry ?? table;
  const capacity = asked.capacity === null ? null : countOrNull(asked.capacity);
  const reloadSeconds = asked.reloadSeconds === null ? null : countOrNull(asked.reloadSeconds);
  return {
    ...table,
    capacity: capacity === null && asked.capacity !== null ? table.capacity : capacity,
    reloadSeconds: reloadSeconds === null && asked.reloadSeconds !== null ? table.reloadSeconds : reloadSeconds,
    chambered: typeof asked.chambered === "boolean" ? asked.chambered : table.chambered,
    perShot: typeof asked.perShot === "boolean" ? asked.perShot : table.perShot,
  };
}
