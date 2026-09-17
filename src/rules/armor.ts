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
  /** The item's id on the actor, where the piece is one. */
  id?: string;
  /** What the piece is called, for a breakdown that names it. */
  name?: string;
  /** The DR that applies unless the split says otherwise. */
  dr: number;
  /** The second, lower DR, or null when the piece has only one. */
  drSplit: number | null;
  /** The damage types the lower DR applies to. Empty when there is no split. */
  drSplitAppliesTo: readonly DamageType[];
  /** Locations covered. An empty list means the whole body. */
  locations: readonly HitLocation[];
  /** The "*": flexible, and so open to blunt trauma (Characters p. 282). */
  flexible?: boolean;
  /** The "F": the DR protects against attacks from the front alone. */
  frontOnly?: boolean;
  /** Concealable as or under clothing, which is what layering needs (p. 286). */
  concealable?: boolean;
  /** Levels of Hardened (Characters p. 47), each a step off the attack's armour divisor. */
  hardened?: number;
  /** Whether the DR is spent as it stops damage, and how (p. 47). */
  ablative?: Ablative;
  /** Points of DR already destroyed, which "heals" at the rate lost HP does. */
  drLost?: number;
  /** A Force Field (p. 47): it meets the blow before any other armour does. */
  forceField?: boolean;
  /**
   * Places where the piece gives a different DR from the rest of itself: a
   * suit whose torso is better armoured than its limbs, a helmet whose skull
   * is better armoured than its face. The Basic Set's own case is footwear
   * with a tougher sole (Characters p. 283), which `soleDr` carries.
   *
   * An exception replaces the piece's whole figure at that location, split
   * and all: a piece with both a location exception and a damage-type split
   * would be saying two different things about the same spot.
   */
  drByLocation?: ReadonlyArray<{ locations: readonly HitLocation[]; dr: number }>;
  /** Footwear's DR on the underside of the foot (Characters p. 283), met by a blow from below. */
  soleDr?: number | null;
}

/** The DR a piece gives at one location, before any split or spending. */
function baseDrAt(piece: ArmorPiece, location: HitLocation | undefined): number | null {
  if (location === undefined) return null;
  for (const exception of piece.drByLocation ?? []) {
    if (exception.locations.includes(location)) return Math.max(0, Math.floor(exception.dr));
  }
  return null;
}

/** How a piece of armour is spent as it stops damage (Characters p. 47). */
export type Ablative = "none" | "ablative" | "semiAblative";

/**
 * The armour divisors in order, as Hardened steps down them (Characters p. 47):
 * "These steps are, in order: 'ignores DR', 100, 10, 5, 3, 2, and 1 (no
 * divisor)." The first step is written here as a divisor of 0, which is what
 * the rest of the system already means by an attack that ignores DR.
 */
export const ARMOR_DIVISOR_STEPS: readonly number[] = [0, 100, 10, 5, 3, 2, 1];

/** An attack's divisor as one piece of hardened armour meets it. */
export interface HardenedAgainst {
  /** The divisor left after the steps, never below 1. */
  divisor: number;
  /** Whether the attack still ignores DR entirely. */
  ignoresDr: boolean;
}

/**
 * What Hardened armour does to an attack's armour divisor (Characters p. 47):
 * "Each level of Hardened reduces the armor divisor of an attack by one step."
 *
 * A divisor the ladder does not list stands at the first step it is no better
 * than -- a (4) at (3) -- and steps down from there. A fractional divisor
 * below 1 is the attack being *worse* against armour to begin with, and is
 * left alone: Hardened is armour resisting penetration, not helping it.
 */
export function hardenedAgainst(
  divisor: number,
  ignoresDr: boolean,
  levels: number,
): HardenedAgainst {
  const steps = Math.max(0, Math.floor(levels) || 0);
  if (steps === 0) return { divisor, ignoresDr };
  if (!ignoresDr && divisor < 1) return { divisor, ignoresDr };

  // Where on the ladder the attack stands: an attack that ignores DR is at
  // the top, and any other divisor takes the first step at or below it.
  const start = ignoresDr ? 0 : ARMOR_DIVISOR_STEPS.findIndex((step) => step !== 0 && step <= divisor);
  const from = start === -1 ? ARMOR_DIVISOR_STEPS.length - 1 : start;
  const landed = ARMOR_DIVISOR_STEPS[Math.min(from + steps, ARMOR_DIVISOR_STEPS.length - 1)]!;
  return { divisor: landed, ignoresDr: false };
}

/**
 * The DR a piece has destroyed by stopping a blow (Characters p. 47).
 *
 * Ablative: "Each point of DR stops one point of basic damage but is destroyed
 * in the process", so it loses whatever it actually stopped.
 *
 * Semi-ablative: "every 10 points of basic damage rolled removes one point of
 * DR, regardless of whether the attack penetrates DR" -- read off the rolled
 * figure rather than off what was stopped.
 *
 * Ordinary armour loses nothing, and neither loses more than it has left.
 */
export function ablativeLoss(options: {
  ablative: Ablative | undefined;
  /** The DR the piece still had when the blow landed. */
  dr: number;
  /** Basic damage rolled, before DR. */
  basicDamage: number;
}): number {
  const dr = Math.max(0, Math.floor(options.dr));
  const rolled = Math.max(0, options.basicDamage);
  if (options.ablative === "ablative") return Math.min(dr, Math.floor(rolled));
  if (options.ablative === "semiAblative") return Math.min(dr, Math.floor(rolled / 10));
  return 0;
}

/** The DR a piece has left, after what earlier blows destroyed. */
export function remainingDr(dr: number, drLost: number | undefined): number {
  return Math.max(0, Math.floor(dr) - Math.max(0, Math.floor(drLost ?? 0)));
}

/** The DR one piece offers against one kind of damage. */
export function drAgainst(piece: ArmorPiece, type: DamageType, location?: HitLocation): number {
  // A place the piece armours differently from the rest of itself gives its
  // own figure, and the split has nothing to say about it.
  const exception = baseDrAt(piece, location);
  const dr = exception !== null
    ? exception
    : piece.drSplit === null || !piece.drSplitAppliesTo.includes(type)
      ? piece.dr
      : piece.drSplit;
  // Ablative DR is "destroyed in the process" of stopping a blow, so what the
  // next one meets is what is left (Characters p. 47).
  return remainingDr(dr, piece.drLost);
}

/**
 * DR at one location from worn armour alone, against one kind of damage.
 *
 * Deliberately excludes the location's own natural DR, which `drByLocation`
 * includes. Both figures are wanted, in different places: a sheet showing what
 * protects the skull wants the whole of it, but `computeInjury` adds the
 * location's own DR itself, so handing it the combined figure would count the
 * skull's bone twice.
 */
export function wornDrAt(
  pieces: readonly ArmorPiece[],
  location: HitLocation,
  type: DamageType,
): number {
  let total = 0;
  for (const piece of pieces) {
    const covered = piece.locations.length ? piece.locations : HIT_LOCATION_ORDER;
    if (covered.includes(location)) total += drAgainst(piece, type, location);
  }
  return total;
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
    const covered = piece.locations.length ? piece.locations : HIT_LOCATION_ORDER;
    for (const loc of covered) {
      if (loc in total) total[loc] += drAgainst(piece, type, loc);
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
 * Every distinct DR a location has, with the damage each applies to, highest DR
 * first -- which is the base figure, since a split is never above it.
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

  // Highest DR first, which is the base figure: drSplit is never above dr, so
  // the band a piece leads with is the one it is worth the most against.
  // Ordering by how many damage types a band covers would headline a DR 12/5
  // vest as DR 5, because its lower figure applies to six types and its higher
  // to five.
  return [...byType.entries()]
    .map(([dr, types]) => ({ dr, types }))
    .sort((a, b) => b.dr - a.dr);
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

/**
 * The DR a piece gives a blow from below (since API 1.63.0): footwear's
 * `soleDr` on the foot, where it has one, and its ordinary figure otherwise.
 */
export function drFromBelow(piece: ArmorPiece, type: DamageType, location: HitLocation): number {
  if (location === "foot" && typeof piece.soleDr === "number") return Math.max(0, piece.soleDr);
  return drAgainst(piece, type, location);
}
