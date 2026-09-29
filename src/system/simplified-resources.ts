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
import { SIMPLIFIED_RELOADS, reloadTally } from "../rules/simplified-resources.js";

export const AMMO_TRACKED_FLAG = "ammoTracked";

/** Whether the switch is on and this actor is a character. */
function simplified(actor: any): boolean {
  return isRuleOn("simplifiedResources") && actor?.type === "character";
}

/** Whether a weapon's ammunition is counted shot by shot. Always so where the switch is off. */
export function isAmmoTracked(item: any): boolean {
  if (!simplified(item?.actor)) return true;
  return item?.getFlag?.(SYSTEM_ID, AMMO_TRACKED_FLAG) === true;
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
  reloads: SIMPLIFIED_RELOADS,
  tally: reloadTally,
});
