/**
 * Legality Class on the sheet (GURPS Basic Set: Characters p. 267, Campaigns
 * p. 507).
 *
 * The book gives every controlled item a class; what a class means depends
 * on the society's Control Rating, which is a fact about the campaign world
 * rather than about any item. So the CR is a world setting, and the Gear tab
 * says beside each piece what carrying it here would take.
 */

import { SYSTEM_ID } from "./constants.js";
import { DATA_HOOKS } from "./data-extensions.js";
import { isRuleOn } from "./optional-rules.js";
import {
  CONTROL_RATINGS,
  isLegalityClass,
  isRestricted,
  legalityUnder,
  type ControlRating,
  type Legality,
  type LegalityClass,
} from "../rules/legality.js";

/** The world setting: the campaign's Control Rating, or blank for none set. */
export const CONTROL_RATING_KEY = "controlRating";

/** The campaign's Control Rating, or null when the table has not set one. */
export function currentControlRating(): ControlRating | null {
  if (!isRuleOn("legalityClass")) return null;
  let stored: unknown = "";
  try {
    stored = game.settings.get(SYSTEM_ID, CONTROL_RATING_KEY);
  } catch {
    // Asked before settings are registered: no rating serves.
  }
  const value = Number(stored);
  return stored !== "" && (CONTROL_RATINGS as readonly number[]).includes(value)
    ? (value as ControlRating)
    : null;
}

/**
 * An item's Legality Class as the system reads it (since API 1.95.0): its
 * stored `lc`, once the `gworld.legalityClass` listeners have had their say --
 * an antique whose class rose with its age, a weapon disguised as something
 * else (Characters p. 267, Campaigns p. 507). Null for an item with no class,
 * and for one a listener set to anything but 0-4. A listener that throws
 * changes nothing.
 */
export function legalityClassOf(item: any): LegalityClass | null {
  const stored = item?.system?.lc;
  const context = { item, actor: item?.actor ?? null, lc: isLegalityClass(stored) ? stored : null as number | null };
  const hooks = (globalThis as { Hooks?: { callAll?: (event: string, ...args: unknown[]) => unknown } }).Hooks;
  try {
    hooks?.callAll?.(DATA_HOOKS.legalityClass, context);
  } catch (error) {
    console.warn(`gworld | a ${DATA_HOOKS.legalityClass} listener failed`, error);
    return isLegalityClass(stored) ? stored : null;
  }
  return isLegalityClass(context.lc) ? context.lc : null;
}

/** What the Gear tab says about one item's legality. */
export interface LegalityNote {
  /** "LC3", or blank for an item with no class. */
  label: string;
  /** The book's word for what carrying it here takes, or blank with no CR set. */
  status: Legality | "";
  /** True when an ordinary citizen may not simply carry it here. */
  restricted: boolean;
}

/** The legality note for an item, from its LC and the campaign's CR. */
export function legalityNote(
  lc: unknown,
  controlRating: ControlRating | null = currentControlRating(),
): LegalityNote {
  if (!isRuleOn("legalityClass") || !isLegalityClass(lc))
    return { label: "", status: "", restricted: false };
  const label = `LC${lc}`;
  if (controlRating === null) return { label, status: "", restricted: false };
  const status = legalityUnder(lc, controlRating);
  return { label, status, restricted: isRestricted(status) };
}
