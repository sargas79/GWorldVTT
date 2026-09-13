/**
 * Legality Class and Control Rating (GURPS Basic Set: Characters p. 267,
 * Campaigns p. 507).
 *
 * Every weapon, most armour and some gear carries a Legality Class from 0
 * (banned: nuclear weapons) to 4 (open: a sword, a shotgun). "An item has a LC
 * only if it is likely to be controlled. Ordinary clothing and tools normally
 * do not require a LC", which is why the class is nullable: a rope has none,
 * and that is not the same as being banned.
 *
 * A society has a Control Rating from 0 (anarchy) to 6 (total control), and
 * the two meet on the table at p. 507: how far the item's LC sits above or
 * below the CR decides who may carry it.
 */

/** The classes the book defines, most restricted first (Characters p. 267). */
export const LEGALITY_CLASSES = [0, 1, 2, 3, 4] as const;
export type LegalityClass = (typeof LEGALITY_CLASSES)[number];

/** The book's name for each class. */
export const LEGALITY_CLASS_NAMES: Readonly<Record<LegalityClass, string>> = {
  0: "banned",
  1: "military",
  2: "restricted",
  3: "licensed",
  4: "open",
};

/** Control Ratings run from anarchy to total control (Campaigns p. 506). */
export const CONTROL_RATINGS = [0, 1, 2, 3, 4, 5, 6] as const;
export type ControlRating = (typeof CONTROL_RATINGS)[number];

/**
 * What the Control Rating and Legality Class table at p. 507 says about an
 * item here:
 *
 * - "LC = CR + 1 or more: Any citizen may carry the item."
 * - "LC = CR: Anyone but a convicted criminal or the equivalent may carry the
 *   item. Registration may be required, but there is no permit fee."
 * - "LC = CR - 1: A license is required to own or carry the item... a license
 *   costs 1d x 10% of the price of the item itself."
 * - "LC = CR - 2: Prohibited except to police SWAT teams, military units, and
 *   intelligence services."
 * - "LC = CR - 3 or worse: Only permitted to the military or secret police."
 */
export type Legality = "open" | "registered" | "licensed" | "prohibited" | "military";

/** Whether an item with this LC may be carried under this CR, and on what terms. */
export function legalityUnder(lc: number | null, controlRating: number): Legality {
  if (lc === null) return "open";
  const gap = lc - controlRating;
  if (gap >= 1) return "open";
  if (gap === 0) return "registered";
  if (gap === -1) return "licensed";
  if (gap === -2) return "prohibited";
  return "military";
}

/** Whether the legality is one that stops an ordinary citizen carrying the item. */
export function isRestricted(legality: Legality): boolean {
  return legality === "licensed" || legality === "prohibited" || legality === "military";
}

/**
 * What a license costs (p. 507): "1d x 10% of the price of the item itself".
 * The die is passed in so the figure can be rolled by the table or fixed.
 */
export function licenseCost(price: number, die: number): number {
  const tenths = Math.min(6, Math.max(1, Math.floor(die)));
  return Math.round(Math.max(0, price) * tenths * 0.1);
}

/**
 * Whether a value is one of the five classes. A form field or a compendium
 * record can carry anything, and the sheet only shows what the book defines.
 */
export function isLegalityClass(value: unknown): value is LegalityClass {
  return typeof value === "number" && (LEGALITY_CLASSES as readonly number[]).includes(value);
}
