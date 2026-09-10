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

import {
  HIT_LOCATION_ORDER,
  locationDrAgainst,
  type HitLocation,
} from "./hit-locations.js";
import { DAMAGE_TYPES, type DamageType } from "./types.js";

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
  // The location's own DR depends on the damage too: locationDrAgainst exempts
  // toxic from the skull's natural armour, and seeding from extraDr directly
  // would have given poison something to chew through.
  const total = Object.fromEntries(
    HIT_LOCATION_ORDER.map((loc) => [loc, locationDrAgainst(loc, type)]),
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

/** One DR figure and the damage it protects against. */
export interface DrBand {
  dr: number;
  types: DamageType[];
}

/**
 * Every distinct DR a location has, with the damage each applies to, commonest
 * first.
 *
 * Resolving two figures -- one against cutting and one against crushing -- is
 * not enough once pieces from different tables overlap. Mail takes its lower DR
 * against crushing alone; a ballistic vest takes its lower against five more
 * types besides. Worn together against an impaling attack the mail gives its
 * higher figure and the vest its lower, and that total appears in neither pass.
 * So the profile is built from every damage type and then grouped.
 */
export function drProfile(pieces: readonly ArmorPiece[], location: HitLocation): DrBand[] {
  const byType = new Map<number, DamageType[]>();

  for (const type of DAMAGE_TYPES) {
    const dr = drByLocation(pieces, type)[location];
    const bucket = byType.get(dr);
    if (bucket) bucket.push(type);
    else byType.set(dr, [type]);
  }

  return [...byType.entries()]
    .map(([dr, types]) => ({ dr, types }))
    .sort((a, b) => b.types.length - a.types.length || b.dr - a.dr);
}

/**
 * Whether a location is protected unevenly, and what the profile looks like.
 * Returned so a sheet can show the ordinary figure with its exceptions rather
 * than a number that is only right against some of what lands there.
 */
export function splitSummary(
  pieces: readonly ArmorPiece[],
  location: HitLocation,
): { splits: boolean; bands: DrBand[] } {
  const bands = drProfile(pieces, location);
  return { splits: bands.length > 1, bands };
}
