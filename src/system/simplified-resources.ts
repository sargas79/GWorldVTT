/**
 * Simplified Resources (Basic Set Revised p. 578): with the switch on, a
 * character's ranged weapons stop counting shots until the party is cut off,
 * someone ditches the ammunition, or they are captured. Each weapon carries an
 * "ammunition tracked" flag; off is the shortcut, on is per-shot tracking.
 * The reload tally and the pure ratios live in `rules/simplified-resources`.
 */

import { SYSTEM_ID } from "./constants.js";
import { isRuleOn } from "./optional-rules.js";
import { hasInfiniteAmmunition } from "./cinematic.js";
import { SIMPLIFIED_RELOADS, daysOfPower, reloadTally, trackedRegardless } from "../rules/simplified-resources.js";
import { parseTechLevel } from "../rules/tech-level.js";
import { carriedAmmunitionFor, isAmmunition } from "./ammunition.js";

export const AMMO_TRACKED_FLAG = "ammoTracked";

/** Whether the switch is on and this actor is a character. */
function simplified(actor: any): boolean {
  return isRuleOn("simplifiedResources") && actor?.type === "character";
}

/**
 * What a weapon's ammunition is, for the exceptions the shortcut never covers
 * (p. 578): explosive rounds (a mode that does explosive damage), fine
 * ammunition (a box carried for it of fine or very fine quality) and magical
 * ammunition (a box with an enchantment). The box the mode was loaded from
 * counts first, else every carried box that fits.
 */
export function ammunitionKindOf(item: any): { explosive: boolean; fine: boolean; magical: boolean } {
  const modes: any[] = Array.isArray(item?.system?.rangedModes) ? item.system.rangedModes : [];
  const explosive = modes.some((mode) => String(mode?.damageType ?? "").trim().toLowerCase() === "ex");
  const actor = item?.actor ?? null;
  let boxes: any[] = [];
  if (actor) {
    const loadedFrom = new Set(modes.map((mode) => String(mode?.loadedFrom ?? "")).filter(Boolean));
    const fitting = loadedFrom.size
      ? [...(actor.items ?? [])].filter((box: any) => loadedFrom.has(String(box.id)))
      : modes.flatMap((_mode, index) => carriedAmmunitionFor(actor, item, index));
    boxes = fitting.filter((box: any) => isAmmunition(box));
  }
  const fine = boxes.some((box) => ["fine", "veryFine"].includes(String(box.system?.quality ?? "")));
  const magical = boxes.some((box) => Array.isArray(box.system?.enchantments) && box.system.enchantments.length > 0);
  return { explosive, fine, magical };
}

/** Whether a weapon's ammunition is counted shot by shot. Always so where the switch is off, or the ammunition is explosive, fine or magical. */
export function isAmmoTracked(item: any): boolean {
  if (!simplified(item?.actor)) return true;
  if (item?.getFlag?.(SYSTEM_ID, AMMO_TRACKED_FLAG) === true) return true;
  return trackedRegardless(ammunitionKindOf(item));
}

/** Whether the tracking is the user's choice on the sheet, as against forced by the ammunition. */
export function ammoTrackedByChoice(item: any): boolean {
  return item?.getFlag?.(SYSTEM_ID, AMMO_TRACKED_FLAG) === true;
}

/**
 * What the sheet's toggle shows for a weapon: null where the shortcut does not
 * apply (switch off, not a character's ranged weapon), else whether the
 * count is on and whether the ammunition forces it.
 */
export function ammoToggleFor(item: any): { tracked: boolean; forced: boolean } | null {
  if (!simplified(item?.actor)) return null;
  if (!(Array.isArray(item?.system?.rangedModes) && item.system.rangedModes.length > 0)) return null;
  const forced = trackedRegardless(ammunitionKindOf(item));
  return { tracked: forced || ammoTrackedByChoice(item), forced };
}

/** Flips a weapon's toggle from the sheet. Returns the new state, or null where nothing changed. */
export async function toggleAmmoTracked(item: any): Promise<boolean | null> {
  const toggle = ammoToggleFor(item);
  if (!toggle || toggle.forced) return null;
  const next = !toggle.tracked;
  return (await setAmmoTracked(item, next)) ? next : null;
}

/**
 * The days a character's gadgets run (p. 578): the day every gizmo has plus
 * one for each set of spares carried, worked from the batteries and power
 * cells in the pack (`daysOfPower` on their cost and weight). `tl` is the
 * character's own unless given. Null where the switch is off.
 */
export function gadgetDays(actor: any, options: { tl?: number } = {}): { days: number; tl: number; spareCost: number; spareWeight: number } | null {
  if (!isRuleOn("simplifiedResources")) return null;
  const tl = options.tl ?? parseTechLevel(actor?.system?.tl) ?? 8;
  let spareCost = 0;
  let spareWeight = 0;
  for (const item of actor?.items ?? []) {
    if (item.type !== "equipment" || item.system?.carried === false) continue;
    if (!/^(Battery|Batteries|Power Cell)\b/i.test(String(item.name ?? ""))) continue;
    const quantity = Math.max(0, Number(item.system?.quantity ?? 1) || 0);
    spareCost += (Number(item.system?.cost) || 0) * quantity;
    spareWeight += (Number(item.system?.weight) || 0) * quantity;
  }
  return { days: daysOfPower({ tl, spareCost, spareWeight }), tl, spareCost, spareWeight };
}

/** Whether firing this weapon leaves the count alone: Infinite Ammunition, or Simplified Resources with the weapon untracked. */
export function spendsNoAmmunition(item: any): boolean {
  const actor = item?.actor ?? null;
  return hasInfiniteAmmunition(actor) || (simplified(actor) && !isAmmoTracked(item));
}

/** Sets a weapon's toggle. Returns false where the user cannot change it. */
export async function setAmmoTracked(item: any, tracked: boolean): Promise<boolean> {
  if (!item?.isOwner || typeof item.setFlag !== "function") return false;
  await item.setFlag(SYSTEM_ID, AMMO_TRACKED_FLAG, !!tracked);
  return true;
}

/**
 * The party is cut off, or the character was captured or ditched their gear:
 * every ranged weapon of the actor counts shots from now on. The book's five
 * reloads are what is left, which the weapon's own loaded count and the
 * ammunition in the pack stand for. Returns how many weapons changed.
 */
export async function cutOff(actor: any): Promise<number> {
  if (!actor?.isOwner) return 0;
  let changed = 0;
  for (const item of actor.items ?? []) {
    const hasRanged = Array.isArray(item.system?.rangedModes) && item.system.rangedModes.length > 0;
    if (!hasRanged || item.getFlag?.(SYSTEM_ID, AMMO_TRACKED_FLAG) === true) continue;
    if (await setAmmoTracked(item, true)) changed++;
  }
  return changed;
}

export const simplifiedResourcesApi = Object.freeze({
  isTracked: isAmmoTracked,
  setTracked: setAmmoTracked,
  cutOff,
  toggle: toggleAmmoTracked,
  toggleFor: ammoToggleFor,
  ammunitionKind: ammunitionKindOf,
  gadgetDays,
  reloads: SIMPLIFIED_RELOADS,
  tally: reloadTally,
});
