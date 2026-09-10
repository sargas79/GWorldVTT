/**
 * Damage Resistance from worn armour (GURPS Basic Set: Characters p. 283).
 *
 * Most armour has one DR. Some has two, written "4/2", because it stops one kind
 * of attack better than another: mail turns a blade but does little against the
 * shock of a mace. Which kind gets which number depends on the table the armour
 * comes from, and the two tables state it from opposite ends:
 *
 *   Low-tech and barding: "use the lower DR against crushing attacks", so
 *   everything else takes the higher.
 *
 *   High- and ultra-tech: "use the first, higher DR against piercing and cutting
 *   attacks; use the second, lower DR against all other damage types."
 *
 * They agree wherever they overlap -- crushing takes the lower DR and piercing
 * and cutting take the higher in both -- and differ only on the types the
 * low-tech footnote does not name, which each table settles for its own armour.
 * So the split is stored with the damage types it applies to rather than as a
 * flag, and no piece has to belong to both readings.
 */

import { HIT_LOCATION_ORDER, HIT_LOCATIONS, type HitLocation } from "./hit-locations.js";
import type { DamageType } from "./types.js";

/** The damage types the lower DR applies to, by the table the armour comes from. */
export const SPLIT_AGAINST = {
  /** "Use the lower DR against crushing attacks." */
  lowTech: ["cr"] as const,
  /** "Use the lower DR against all other damage types" — all but piercing and cutting. */
  highTech: ["cr", "imp", "burn", "tox", "cor", "fat"] as const,
} satisfies Record<string, readonly DamageType[]>;

export interface ArmorPiece {
  /** The DR that applies unless the split says otherwise. */
  dr: number;
  /** The second, lower DR, or null when the piece has only one. */
  drSplit: number | null;
  /** The damage types the lower DR applies to. Empty when there is no split. */
  drSplitAppliesTo: readonly DamageType[];
  /** Locations covered. An empty list means the whole body. */
  locations: readonly HitLocation[];
}

/** The DR one piece offers against one kind of damage. */
export function drAgainst(piece: ArmorPiece, type: DamageType): number {
  if (piece.drSplit === null) return piece.dr;
  return piece.drSplitAppliesTo.includes(type) ? piece.drSplit : piece.dr;
}

/**
 * DR per hit location from everything worn, against one kind of damage.
 *
 * The skull's own DR is included, because it is armour the body came with and
 * the injury rules add it the same way.
 */
export function drByLocation(
  pieces: readonly ArmorPiece[],
  type: DamageType,
): Record<HitLocation, number> {
  const total = Object.fromEntries(
    HIT_LOCATION_ORDER.map((loc) => [loc, HIT_LOCATIONS[loc].extraDr]),
  ) as Record<HitLocation, number>;

  for (const piece of pieces) {
    const value = drAgainst(piece, type);
    const covered = piece.locations.length ? piece.locations : HIT_LOCATION_ORDER;
    for (const loc of covered) {
      if (loc in total) total[loc] += value;
    }
  }

  return total;
}

/**
 * Whether any piece covering a location protects it unevenly, and the DR when
 * the lower figure applies. Returned so a sheet can show "DR 4 (2 vs crushing)"
 * without having to know which attack is coming.
 */
export function splitSummary(
  pieces: readonly ArmorPiece[],
  location: HitLocation,
): { splits: boolean; against: readonly DamageType[] } {
  const covering = pieces.filter(
    (p) => (p.locations.length ? p.locations : HIT_LOCATION_ORDER).includes(location),
  );
  const against = [...new Set(covering.flatMap((p) => (p.drSplit === null ? [] : p.drSplitAppliesTo)))];
  return { splits: against.length > 0, against };
}
