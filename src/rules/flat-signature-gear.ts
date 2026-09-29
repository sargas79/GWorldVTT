/**
 * Flat-cost Signature Gear (Basic Set Revised p. 342, listed among the perks on
 * p. 328).
 *
 * "The GM may prefer that Signature Gear (p. 85) neither have a variable point
 * cost nor provide gear." Instead it is a 1-point perk that gives plot
 * protection against permanent loss to one item of any value, however the item
 * was acquired. So the number of perks is the number of items flagged, each
 * costing a point, and the trait no longer buys goods worth a share of starting
 * wealth.
 */

/** A perk costs one point (p. 328). */
export const SIGNATURE_PERK_POINTS = 1;

/** Whether a trait name is Signature Gear, with or without a specialty ("Signature Gear (Sword)"). */
export function isSignatureGearName(name: unknown): boolean {
  return /^signature gear(?:\s*\(.*\))?$/i.test(String(name ?? "").trim());
}

/** The items flagged as Signature Gear: each is one perk. */
export function flaggedSignatureItems<T extends { system?: { signature?: unknown } }>(items: readonly T[]): T[] {
  return items.filter((item) => item?.system?.signature === true);
}

/** What the flagged items cost in points: a point each. */
export function flatSignatureGearCost(flagged: number): number {
  return SIGNATURE_PERK_POINTS * Math.max(0, Math.trunc(Number(flagged) || 0));
}

/**
 * How the perks are billed across the Signature Gear traits a character holds:
 * all of the cost lands on the first, and any others bill nothing, since the
 * count is of items and not of traits. Returns the points for each trait id
 * and the points no trait carries (flagged items with no Signature Gear trait
 * held), which the audit adds anyway so a flag is never free.
 */
export function flatSignatureBilling(
  traits: ReadonlyArray<{ id: string; name: unknown }>,
  flagged: number,
): { byTrait: Map<string, number>; unbilled: number } {
  const cost = flatSignatureGearCost(flagged);
  const byTrait = new Map<string, number>();
  const holders = traits.filter((trait) => isSignatureGearName(trait.name));
  holders.forEach((trait, index) => byTrait.set(trait.id, index === 0 ? cost : 0));
  return { byTrait, unbilled: holders.length === 0 ? cost : 0 };
}
