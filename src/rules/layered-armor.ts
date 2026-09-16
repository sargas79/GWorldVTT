/**
 * Armour worn in layers, marked for the front, and the blunt trauma that
 * gets through it (GURPS Basic Set: Characters pp. 282, 286; Campaigns
 * p. 379).
 *
 * The armour tables mark two things the DR figure does not say. "*" means
 * the piece is flexible: lighter, concealable, quicker to put on, and open
 * to blunt trauma. "F" means "the DR only protects against attacks from the
 * front". Layering has its own rule, and so does the bruise a mail hauberk
 * leaves when it stops a mace.
 */

import { HIT_LOCATION_ORDER, type HitLocation } from "./hit-locations.js";
import type { Arc } from "./tactical.js";
import type { DamageType } from "./types.js";
import { drAgainst, type ArmorPiece } from "./armor.js";

/** Whether a piece's DR counts against a blow from this arc (Characters p. 282). */
export function protectsAgainst(piece: Pick<ArmorPiece, "frontOnly">, arc: Arc | null): boolean {
  if (!piece.frontOnly) return true;
  // With no facing in play -- basic combat, or no tokens to measure between --
  // every blow is one the breastplate is turned towards.
  return arc === null || arc === "front";
}

/** The pieces covering one location, in the order they were put on. */
export function piecesAt(pieces: readonly ArmorPiece[], location: HitLocation): ArmorPiece[] {
  return pieces.filter((piece) => (piece.locations.length ? piece.locations : HIT_LOCATION_ORDER).includes(location));
}

/**
 * Whether a piece may be worn under another (p. 286): "you can only layer
 * armor if the inner layer is both flexible and concealable".
 */
export function canBeInnerLayer(piece: Pick<ArmorPiece, "flexible" | "concealable">): boolean {
  return piece.flexible === true && piece.concealable === true;
}

/**
 * The locations where armour is layered, and whether the layering is legal.
 *
 * "You can freely combine multiple pieces of armor that don't cover the same
 * hit location, but you can only layer armor if the inner layer is both
 * flexible and concealable."
 */
export function layeringAt(pieces: readonly ArmorPiece[], location: HitLocation): {
  layers: number;
  legal: boolean;
} {
  const here = piecesAt(pieces, location);
  if (here.length <= 1) return { layers: here.length, legal: true };
  // Every layer but the outermost has to be one that can go underneath, and
  // the pieces that can are the ones the rule names.
  const inner = here.filter(canBeInnerLayer).length;
  return { layers: here.length, legal: inner >= here.length - 1 };
}

/** The head, where an extra layer costs nothing. */
const HEAD: readonly HitLocation[] = ["skull", "face", "eye"];

/**
 * The penalty for wearing armour over armour (p. 286): "Wearing an extra
 * layer of armor anywhere but on the head gives -1 to DX and DX-based
 * skills." One penalty however many places are doubled up: it is the
 * clothing, not the count.
 */
export function layeringPenalty(pieces: readonly ArmorPiece[]): number {
  const doubled = HIT_LOCATION_ORDER.some(
    (location) => !HEAD.includes(location) && piecesAt(pieces, location).length > 1,
  );
  return doubled ? -1 : 0;
}

/**
 * Blunt trauma through flexible armour (Campaigns p. 379).
 *
 * "For every full 10 points of cutting, impaling, or piercing damage or 5
 * points of crushing damage stopped by your DR, you suffer 1 HP of injury
 * due to blunt trauma. This is actual injury, not basic damage. There is no
 * wounding multiplier."
 */
export const TRAUMA_PER_CRUSHING = 5;
export const TRAUMA_PER_OTHER = 10;

/** The damage types blunt trauma applies to at all. */
const TRAUMA_TYPES: readonly DamageType[] = ["cr", "cut", "imp", "pi-", "pi", "pi+", "pi++"];

export function causesBluntTrauma(type: DamageType): boolean {
  return TRAUMA_TYPES.includes(type);
}

/**
 * The injury a blow leaves behind when flexible armour stops it.
 *
 * "If even one point of damage penetrates your flexible DR, however, you do
 * not suffer blunt trauma. If you layer other DR over flexible DR, only
 * damage that penetrates the outer layer can inflict blunt trauma."
 */
export function bluntTraumaInjury(options: {
  /** Damage reaching the flexible layer, after anything rigid over it. */
  reachingFlexible: number;
  /** The flexible layer's DR at this location. */
  flexibleDr: number;
  type: DamageType;
}): number {
  const { reachingFlexible, flexibleDr, type } = options;
  if (!causesBluntTrauma(type) || flexibleDr <= 0) return 0;
  // Anything through the flexible DR is a wound, and a wound is not a bruise.
  if (reachingFlexible > flexibleDr) return 0;
  if (reachingFlexible <= 0) return 0;
  const per = type === "cr" ? TRAUMA_PER_CRUSHING : TRAUMA_PER_OTHER;
  return Math.floor(reachingFlexible / per);
}

/** What a blow meets at one location, layer by layer. */
export interface ArmorAtLocation {
  /** Rigid DR, over the flexible. */
  rigidDr: number;
  /** Flexible DR, under it, which is what blunt trauma is read against. */
  flexibleDr: number;
  /** The two together: everything the blow meets as armour. */
  totalDr: number;
  /**
   * A Force Field's DR (Characters p. 47), which is kept out of the total
   * because it "reduces the damage from attacks before armor DR" rather than
   * adding to what the blow finally meets.
   */
  fieldDr: number;
  /** The best Hardened the wearer has here, in levels (p. 47). */
  hardened: number;
}

/**
 * What a blow meets at one location: the rigid DR over the flexible, the
 * flexible DR under it, so blunt trauma can be worked out from what got
 * through the outer layer, and the Force Field in front of both.
 *
 * A Force Field "protects your entire body - including your eyes - as well as
 * anything you are carrying" (p. 47), so its own covered locations are not
 * consulted: it is read wherever the blow landed.
 *
 * Hardened is a modifier on one piece, and the "Layered Defenses" box allows
 * layers with different modifiers. An attack meets one divisor, not one per
 * layer, so what is taken is the best hardening protecting the spot -- the
 * wearer gets the benefit of the toughest thing they put on.
 */
export function armorLayers(
  pieces: readonly ArmorPiece[],
  location: HitLocation,
  type: DamageType,
  arc: Arc | null = null,
): ArmorAtLocation {
  let rigidDr = 0;
  let flexibleDr = 0;
  let fieldDr = 0;
  let hardened = 0;
  const here = new Set(piecesAt(pieces, location));
  for (const piece of pieces) {
    const reaches = piece.forceField === true || here.has(piece);
    if (!reaches || !protectsAgainst(piece, arc)) continue;
    hardened = Math.max(hardened, Math.max(0, Math.floor(piece.hardened ?? 0)));
    const dr = drAgainst(piece, type, location);
    if (piece.forceField === true) fieldDr += dr;
    else if (piece.flexible) flexibleDr += dr;
    else rigidDr += dr;
  }
  return { rigidDr, flexibleDr, totalDr: rigidDr + flexibleDr, fieldDr, hardened };
}
