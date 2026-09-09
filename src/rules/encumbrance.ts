/**
 * Encumbrance and its effect on Move and Dodge (GURPS Lite p. 22).
 */

import type { EncumbranceLevel } from "./types.js";

export interface EncumbranceTier {
  level: EncumbranceLevel;
  key: "none" | "light" | "medium" | "heavy" | "extraHeavy";
  /** Carried weight limit as a multiple of Basic Lift. */
  basicLiftMultiple: number;
  /** Basic Move is multiplied by this, dropping fractions. */
  moveMultiplier: number;
}

/** The five encumbrance tiers, ordered from none to extra-heavy. */
export const ENCUMBRANCE_TIERS: readonly EncumbranceTier[] = [
  { level: 0, key: "none", basicLiftMultiple: 1, moveMultiplier: 1 },
  { level: 1, key: "light", basicLiftMultiple: 2, moveMultiplier: 0.8 },
  { level: 2, key: "medium", basicLiftMultiple: 3, moveMultiplier: 0.6 },
  { level: 3, key: "heavy", basicLiftMultiple: 6, moveMultiplier: 0.4 },
  { level: 4, key: "extraHeavy", basicLiftMultiple: 10, moveMultiplier: 0.2 },
];

/**
 * The encumbrance level for a carried weight.
 *
 * Weight beyond 10x Basic Lift is over the extra-heavy limit and cannot be
 * carried at all; this reports level 4, and callers should flag it as overloaded
 * via {@link isOverloaded}.
 */
export function encumbranceLevel(carriedWeight: number, basicLift: number): EncumbranceLevel {
  if (basicLift <= 0) return 4;
  for (const tier of ENCUMBRANCE_TIERS) {
    if (carriedWeight <= basicLift * tier.basicLiftMultiple) return tier.level;
  }
  return 4;
}

/** Whether the carried weight exceeds even extra-heavy encumbrance. */
export function isOverloaded(carriedWeight: number, basicLift: number): boolean {
  return basicLift > 0 && carriedWeight > basicLift * 10;
}

/** Looks up a tier by level. */
export function encumbranceTier(level: EncumbranceLevel): EncumbranceTier {
  return ENCUMBRANCE_TIERS[level] ?? ENCUMBRANCE_TIERS[0]!;
}

/**
 * Move after encumbrance. Fractions are dropped, and encumbrance can never
 * reduce Move below 1 (GURPS Lite p. 22).
 */
export function encumberedMove(basicMove: number, level: EncumbranceLevel): number {
  if (basicMove <= 0) return 0;
  const reduced = Math.floor(basicMove * encumbranceTier(level).moveMultiplier);
  return Math.max(1, reduced);
}

/** The Dodge penalty for an encumbrance level: -1 per level. */
export function encumbranceDodgePenalty(level: EncumbranceLevel): number {
  return level === 0 ? 0 : -level;
}

export interface EncumbranceState {
  level: EncumbranceLevel;
  key: EncumbranceTier["key"];
  carriedWeight: number;
  basicLift: number;
  move: number;
  dodgePenalty: number;
  overloaded: boolean;
}

/** Computes the full encumbrance state for a character. */
export function encumbranceState(
  carriedWeight: number,
  basicLift: number,
  basicMove: number,
): EncumbranceState {
  const level = encumbranceLevel(carriedWeight, basicLift);
  return {
    level,
    key: encumbranceTier(level).key,
    carriedWeight,
    basicLift,
    move: encumberedMove(basicMove, level),
    dodgePenalty: encumbranceDodgePenalty(level),
    overloaded: isOverloaded(carriedWeight, basicLift),
  };
}
