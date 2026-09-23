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

import { parseShots, type ReloadAid, type ReloadRequiredRoll, type ReloadRoll, type ShotsEntry } from "../rules/ammunition.js";
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
    // What Fast-Draw (Ammo) saves, and the aids the Reload button offers (since 1.71.0).
    fastDrawSeconds: countOrNull(asked.fastDrawSeconds) ?? table.fastDrawSeconds,
    fastDrawPer: asked.fastDrawPer === "round" ? "round" : "reload",
    aids: reloadAids(asked.aids),
    // A time per round on top of the fixed one, the roll in place of
    // Fast-Draw (Ammo), and the rolls the load needs (since 1.88.0).
    perRoundSeconds: countOrNull(asked.perRoundSeconds) ?? table.perRoundSeconds,
    fastDrawRoll: reloadRoll(asked.fastDrawRoll),
    requiredRolls: Array.isArray(asked.requiredRolls)
      ? asked.requiredRolls.flatMap((roll: any): ReloadRequiredRoll[] => {
        const read = reloadRoll(roll);
        if (!read || typeof roll.label !== "string" || !roll.label) return [];
        return [{ ...read, label: roll.label, onFail: roll.onFail === "continue" ? "continue" : "abort" }];
      })
      : [],
  };
}

/** A roll a listener wrote: a skill's name, a level, or both; anything else is null. */
function reloadRoll(value: any): ReloadRoll | null {
  if (!value || typeof value !== "object") return null;
  const skill = typeof value.skill === "string" && value.skill.trim() ? value.skill.trim() : undefined;
  const level = value.level === undefined || value.level === null || !Number.isFinite(Number(value.level)) ? undefined : Math.floor(Number(value.level));
  if (skill === undefined && level === undefined) return null;
  return {
    ...(skill !== undefined ? { skill } : {}),
    ...(level !== undefined ? { level } : {}),
    ...(typeof value.label === "string" && value.label ? { label: value.label } : {}),
  };
}

/** The aids a listener wrote, each with an id and a label; anything else is dropped. */
function reloadAids(value: unknown): ReloadAid[] {
  if (!Array.isArray(value)) return [];
  const number = (n: unknown) => (n === undefined || n === null || !Number.isFinite(Number(n)) ? undefined : Number(n));
  return value.flatMap((aid: any) => {
    if (!aid || typeof aid.id !== "string" || !aid.id || typeof aid.label !== "string") return [];
    const seconds = number(aid.seconds);
    const fastDrawSeconds = number(aid.fastDrawSeconds);
    const multiplier = number(aid.multiplier);
    return [{
      id: aid.id,
      label: aid.label,
      ...(seconds !== undefined ? { seconds: Math.round(seconds) } : {}),
      ...(fastDrawSeconds !== undefined ? { fastDrawSeconds: Math.max(0, Math.floor(fastDrawSeconds)) } : {}),
      // Used one at a time with the others in its group, and a factor on the time (since 1.88.0).
      ...(typeof aid.exclusiveGroup === "string" && aid.exclusiveGroup ? { exclusiveGroup: aid.exclusiveGroup } : {}),
      ...(multiplier !== undefined ? { multiplier: Math.max(0, multiplier) } : {}),
      checked: aid.checked === true,
    }];
  });
}
