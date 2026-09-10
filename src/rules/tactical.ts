/**
 * Tactical combat: the hex grid, facing, and what both do to a fight
 * (GURPS Basic Set: Campaigns pp. 384-392).
 *
 * The Basic Combat this system already implements is abstract: everyone can
 * reach everyone, nobody has a back, and a shield helps against everything.
 * Tactical combat puts the fight on a map, and almost all of what that changes
 * comes from one fact -- a figure faces a direction, so an attack arrives from
 * somewhere relative to that.
 *
 * Directions are the six hex-sides, numbered 0 to 5 going clockwise. Which
 * compass bearing 0 corresponds to is the caller's business: this cares only
 * about the difference between where a figure faces and where an attack comes
 * from.
 */

/** One of the six hex directions, clockwise from a caller-chosen zero. */
export type HexDirection = 0 | 1 | 2 | 3 | 4 | 5;

/** Where an attack falls relative to the defender's facing. */
export type Arc = "front" | "side" | "back";

/** Which side of the body, for the rules that care which hand is which. */
export type BodySide = "left" | "right";

/** Normalises any integer to a hex direction, so callers can do plain arithmetic. */
export function hexDirection(value: number): HexDirection {
  return (((Math.round(value) % 6) + 6) % 6) as HexDirection;
}

/**
 * Where an attack lands relative to a defender.
 *
 * "You must face toward one of the six hexes adjacent to your hex at all times.
 * Your facing defines your front, right, left, and back hexes." Of the six, the
 * hex faced and the two flanking it are front; one to each side; one behind.
 */
export function attackArc(
  facing: HexDirection,
  attackFrom: HexDirection,
): { arc: Arc; side: BodySide | null } {
  const relative = hexDirection(attackFrom - facing);
  switch (relative) {
    case 0:
    case 1:
    case 5:
      return { arc: "front", side: null };
    case 2:
      return { arc: "side", side: "right" };
    case 4:
      return { arc: "side", side: "left" };
    default:
      return { arc: "back", side: null };
  }
}

/** What a defender can see around them, which is what the arcs turn on. */
export interface Vision {
  /** Peripheral Vision (p. 74): defend to the side unpenalised, behind at -2. */
  peripheral?: boolean;
  /** 360° Vision (p. 34): no penalty from any direction. */
  allRound?: boolean;
  /**
   * Extra-Flexible arms or Double-Jointed, which is what lets a fighter bring
   * a shield or a one-handed weapon round to the wrong side of their body.
   */
  flexible?: boolean;
}

/** Which hand holds what, for the rules that ask. */
export interface Handedness {
  /** The side the weapon is on. A right-handed fighter's weapon side is right. */
  weaponSide: BodySide;
}

/** The shield is on the other side from the weapon. */
export function shieldSide(hands: Handedness): BodySide {
  return hands.weaponSide === "right" ? "left" : "right";
}

/** What an attack's arc does to one defender's defenses. */
export interface ArcDefense {
  /** True when no active defense is possible at all. */
  helpless: boolean;
  /** Penalty applied to every defense, zero or negative. */
  modifier: number;
  /** An additional penalty to Parry alone. */
  parryModifier: number;
  canDodge: boolean;
  canParry: boolean;
  canBlock: boolean;
}

/**
 * How an attack's arc changes what a defender may do (pp. 390-391).
 *
 * From the front, nothing changes. From a side, everything is at -2 unless the
 * defender can see that way, and the two defenses that depend on which hand
 * holds what are restricted to that side of the body. From behind, there is no
 * defense at all without Peripheral or 360° Vision, and even with them a block
 * is impossible and a parry is harder.
 */
export function arcDefense(options: {
  arc: Arc;
  /** Which side the attack came from, for a side attack. */
  side?: BodySide | null;
  vision?: Vision;
  hands?: Handedness;
  /** Whether the weapon in hand is one-handed, which is what limits the parry. */
  oneHandedWeapon?: boolean;
}): ArcDefense {
  const { arc, side = null, vision = {}, oneHandedWeapon = true } = options;
  const hands = options.hands ?? { weaponSide: "right" as BodySide };

  const open: ArcDefense = {
    helpless: false,
    modifier: 0,
    parryModifier: 0,
    canDodge: true,
    canParry: true,
    canBlock: true,
  };

  if (arc === "front") return open;

  if (arc === "side") {
    return {
      ...open,
      // "you defend at -2 unless you have Peripheral Vision or 360° Vision"
      modifier: vision.peripheral || vision.allRound ? 0 : -2,
      // "you cannot block an attack that comes from your weapon side, only one
      // that comes from your shield side" -- and no advantage waives this.
      canBlock: vision.flexible || side === shieldSide(hands),
      // A one-handed weapon only reaches the side of the body it is on. A
      // two-handed weapon is held across the body and is not so limited.
      canParry: vision.flexible || !oneHandedWeapon || side === hands.weaponSide,
    };
  }

  // From behind: nothing at all without one of the two advantages.
  if (!vision.peripheral && !vision.allRound) {
    return {
      helpless: true,
      modifier: 0,
      parryModifier: 0,
      canDodge: false,
      canParry: false,
      canBlock: false,
    };
  }

  return {
    helpless: false,
    // 360° Vision sees behind as well as anywhere; Peripheral Vision does not.
    modifier: vision.allRound ? 0 : -2,
    // "you have an extra -2 to parry an attack from behind ... unless your
    // weapon arm has Extra-Flexible or you have Double-Jointed"
    parryModifier: vision.flexible ? 0 : -2,
    canDodge: true,
    canParry: true,
    canBlock: Boolean(vision.flexible),
  };
}

/** The skills whose parry makes superior use of mobility, and so retreats better. */
const MOBILE_PARRY_SKILLS = new Set([
  "boxing",
  "judo",
  "karate",
  "main-gauche",
  "rapier",
  "saber",
  "smallsword",
]);

/**
 * The bonus for retreating (p. 377).
 *
 * "Retreating gives +3 to Dodge, or +1 to Block or Parry. Exception: If you
 * parry using Boxing, Judo, Karate, or any fencing skill, a retreat gives +3 to
 * Parry, as these forms make superior use of mobility."
 *
 * A weapon marked as fencing in the equipment tables counts, which is what that
 * flag was recorded for.
 */
export function retreatBonus(options: {
  defense: "dodge" | "parry" | "block";
  /** The skill the parry is made with, for the exception. */
  skill?: string;
  /** Whether the weapon parried with is a fencing weapon. */
  isFencing?: boolean;
}): number {
  if (options.defense === "dodge") return 3;
  if (options.defense === "block") return 1;

  const skill = (options.skill ?? "").trim().toLowerCase();
  // A skill may carry a specialty -- "Boxing" is bare but a fencing weapon's
  // skill can read "Rapier" or "Main-Gauche"; the base name is what matters.
  const base = skill.split("(")[0]!.trim();
  if (options.isFencing || MOBILE_PARRY_SKILLS.has(base)) return 3;
  return 1;
}

/** How much of your Move a step is worth: one yard for most people. */
export const STEP_YARDS = 1;

/** Posture surcharges, in movement points per hex (p. 387). */
const POSTURE_COST: Record<string, number | null> = {
  standing: 0,
  crouching: 0.5,
  kneeling: 2,
  crawling: 2,
  // "Lying down: All movement points to move one hex" -- handled by the caller,
  // since it is not a surcharge but a flat consumption of everything.
  lying: null,
  // "Sitting: Cannot move!"
  sitting: null,
};

export type MoveDirection = "forward" | "sideways" | "backward";

/**
 * What it costs to move one hex (p. 387).
 *
 * Forward is a movement point; sideways or backward is two. Posture adds on
 * top, and an obstruction in the hex -- an ally, a body -- adds one each.
 *
 * Returns null when the posture forbids ordinary movement: sitting cannot move
 * at all, and lying down spends everything to shift one hex, neither of which
 * is a per-hex cost the caller can add up.
 */
export function hexMovementCost(options: {
  direction: MoveDirection;
  posture?: string;
  /** Minor obstructions in the hex being entered. */
  obstructions?: number;
  /** Treacherous ground or stairs, each +1 per hex. */
  badFooting?: boolean;
}): number | null {
  const posture = POSTURE_COST[options.posture ?? "standing"];
  if (posture === null || posture === undefined) return null;

  const base = options.direction === "forward" ? 1 : 2;
  const obstructions = Math.max(0, options.obstructions ?? 0);
  return base + posture + obstructions + (options.badFooting ? 1 : 0);
}

/**
 * What a facing change costs mid-move: one movement point per hex-side turned
 * (p. 387). Turning 180° is three hex-sides, so three points.
 *
 * At the end of a move it is free, which is `facingChangeAtEndOfMove` below.
 */
export function facingChangeCost(from: HexDirection, to: HexDirection): number {
  const difference = Math.abs(hexDirection(to - from));
  return Math.min(difference, 6 - difference);
}

/**
 * How freely a figure may turn at the end of its move (p. 387).
 *
 * Spending no more than half your movement points leaves you facing wherever
 * you like; spending more leaves you able to turn by a single hex-side.
 */
export function facingChangeAtEndOfMove(options: {
  movementPointsSpent: number;
  movementPointsAvailable: number;
}): "any" | "oneHexSide" {
  const { movementPointsSpent, movementPointsAvailable } = options;
  if (movementPointsAvailable <= 0) return "any";
  return movementPointsSpent <= movementPointsAvailable / 2 ? "any" : "oneHexSide";
}
