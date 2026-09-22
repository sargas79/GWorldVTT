/**
 * Demolition (GURPS Basic Set: Campaigns p. 415).
 *
 * A charge's damage comes from how much explosive there is and how strong a
 * kind: six dice times the square root of four times its weight in pounds
 * times its relative explosive force (REF), where TNT is 1. Run backwards,
 * the same formula says how much of an explosive a blast of a given size
 * takes.
 *
 * Explosives do crushing damage with the Explosion modifier, so a charge's
 * damage is an ordinary "cr ex" blast from then on; the p. 415 placements
 * decide what it does to what it was packed against.
 */

import type { DiceAdds } from "./types.js";
import { structureState, type StructureState } from "./structures.js";

/** One row of the Relative Explosive Force Table. */
export interface ExplosiveForce {
  /** A stable id for the row. */
  id: string;
  /** The table's name for it. */
  name: string;
  /** The tech level it appears at. */
  tl: number;
  /** Its strength against TNT's 1. */
  ref: number;
}

/**
 * The Relative Explosive Force Table (p. 415), in the book's order.
 *
 * Black powder appears twice: the early, weaker powder at TL4 and the better
 * powder of the nineteenth century at TL5.
 */
export const RELATIVE_EXPLOSIVE_FORCE: readonly ExplosiveForce[] = [
  { id: "serpentinePowder", name: "Serpentine Powder", tl: 3, ref: 0.3 },
  { id: "ammoniumNitrate", name: "Ammonium Nitrate", tl: 4, ref: 0.4 },
  { id: "blackPowderEarly", name: "Black Powder (1600-1850)", tl: 4, ref: 0.4 },
  { id: "blackPowder", name: "Black Powder (1850-1890)", tl: 5, ref: 0.5 },
  { id: "fuelFertilizer", name: "Diesel Fuel/Nitrate Fertilizer", tl: 6, ref: 0.5 },
  { id: "dynamite", name: "Dynamite", tl: 6, ref: 0.8 },
  { id: "tnt", name: "TNT", tl: 6, ref: 1 },
  { id: "amatol", name: "Amatol", tl: 6, ref: 1.2 },
  { id: "nitroglycerine", name: "Nitroglycerine", tl: 6, ref: 1.5 },
  { id: "tetryl", name: "Tetryl", tl: 7, ref: 1.3 },
  { id: "compositionB", name: "Composition B", tl: 7, ref: 1.4 },
  { id: "c4", name: "C4 Plastic Explosive", tl: 7, ref: 1.4 },
  { id: "octanitrocubane", name: "Octanitrocubane", tl: 9, ref: 4 },
  { id: "metallicHydrogen", name: "Stabilized Metallic Hydrogen", tl: 10, ref: 6 },
];

/** A row of the table by its id, or null. */
export function explosiveForce(id: string): ExplosiveForce | null {
  return RELATIVE_EXPLOSIVE_FORCE.find((row) => row.id === id) ?? null;
}

/** A charge's six dice, before its multiplier. */
export const CHARGE_BASE_DICE = 6;

/**
 * The n in a charge's 6d×n (p. 415): the square root of weight in pounds × 4
 * × REF. One pound of TNT is 6d×2. Zero for no charge.
 */
export function chargeMultiplier(weightLbs: number, ref: number): number {
  const weight = Number(weightLbs);
  const force = Number(ref);
  if (!(weight > 0) || !(force > 0)) return 0;
  return Math.sqrt(weight * 4 * force);
}

/**
 * How much explosive a blast of 6d×n takes (p. 415): (n × n) / 4 pounds of
 * TNT, divided by the REF of anything else. 6d×8 of dynamite is 20 lbs.
 */
export function explosiveWeightFor(multiplier: number, ref: number): number {
  const n = Number(multiplier);
  const force = Number(ref);
  if (!(n > 0) || !(force > 0)) return 0;
  return (n * n) / (4 * force);
}

/** A charge's damage, as the book writes it and as it is rolled. */
export interface ChargeDamage {
  /** The n in 6d×n, unrounded. */
  multiplier: number;
  /** The book's notation, with n to two places where it isn't whole: "6d×2", "6d×1.41". */
  notation: string;
  /**
   * What is rolled. A whole multiplier stays one (6d×2); anything else is its
   * dice laid out -- 6 × n dice, the fraction of a die left over as adds at
   * 3.5 points to the die -- since a roll can only be multiplied by a whole
   * number.
   */
  dice: DiceAdds;
  /** The dice the blast counts for its reach: 6 × n, rounded down. */
  diceOfDamage: number;
}

/** A multiplier this close to a whole number is that number. */
const WHOLE = 0.005;

/**
 * A charge's damage from its weight in pounds and REF (p. 415), or null for
 * no charge. Crushing, with the Explosion modifier.
 */
export function chargeDamage(weightLbs: number, ref: number): ChargeDamage | null {
  const multiplier = chargeMultiplier(weightLbs, ref);
  if (multiplier <= 0) return null;
  const whole = Math.round(multiplier);
  if (whole >= 1 && Math.abs(multiplier - whole) < WHOLE) {
    return {
      multiplier,
      notation: `${CHARGE_BASE_DICE}d×${whole}`,
      dice: whole === 1 ? { dice: CHARGE_BASE_DICE, adds: 0 } : { dice: CHARGE_BASE_DICE, adds: 0, multiplier: whole },
      diceOfDamage: CHARGE_BASE_DICE * whole,
    };
  }
  const total = CHARGE_BASE_DICE * multiplier;
  let dice = Math.floor(total);
  let adds = Math.round((total - dice) * 3.5);
  // A charge too small for a whole die is one die less what it falls short.
  if (dice === 0) {
    dice = 1;
    adds = Math.round((total - 1) * 3.5);
  }
  const places = Math.round(multiplier * 100) / 100;
  return {
    multiplier,
    notation: `${CHARGE_BASE_DICE}d×${places}`,
    dice: { dice, adds },
    diceOfDamage: Math.floor(total),
  };
}

/** What one charge did to a structure. */
export interface StructureBlast {
  /** The damage that got through its DR -- all of it injury, a structure being Homogenous and the blast crushing. */
  injury: number;
  /** Its hit points after the blast. */
  hp: number;
  /** What that leaves it as, before any HT roll. */
  state: StructureState;
  /** True where it is at 0 HP or less and has yet to roll against being breached. */
  rollsToHold: boolean;
  /** True where it is at -1×HP or less and rolls HT or is blown apart. */
  rollsToStand: boolean;
}

/**
 * A blast against a door, a wall or any other structure (pp. 415, 484, 558).
 *
 * Structures are Homogenous, and crushing does no more or less to a
 * Homogenous target, so what gets through DR is what comes off its HP. The
 * damage is the caller's: the most the dice could do for a charge packed
 * against it, and the ordinary collateral figure for one merely nearby.
 */
export function blastAgainstStructure(options: {
  damage: number;
  dr: number;
  hp: number;
  /** What it had taken already. */
  damageTaken?: number | undefined;
  /** True once it has failed the roll zero hit points called for. */
  failedDisabling?: boolean | undefined;
}): StructureBlast {
  const maxHp = Math.max(1, Math.floor(Number(options.hp) || 0));
  const injury = Math.max(0, Math.floor(Number(options.damage) || 0) - Math.max(0, Math.floor(Number(options.dr) || 0)));
  const hp = maxHp - Math.max(0, Math.floor(Number(options.damageTaken) || 0)) - injury;
  const state = structureState({ hp, maxHp, failedDisabling: options.failedDisabling === true });
  return {
    injury,
    hp,
    state,
    rollsToHold: hp <= 0 && hp > -maxHp && !options.failedDisabling,
    rollsToStand: state === "failing",
  };
}
