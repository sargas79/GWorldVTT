/**
 * The dice on the damage card (sargas79/GWorldVTT#813).
 *
 * The card used to give only basic damage, which is the number that matters
 * but not the one a player checks: at the table they read the dice, add the
 * adds, and see whether the total agrees. So the card shows each die as it came
 * up, then the adds and whatever multiplied them, then the total -- and the
 * same dice are kept on the message's flag, so what the card says can be read
 * back without parsing its HTML.
 *
 * Nothing here decides damage. The roll, the damage type's floor and the
 * halving past 1/2D are worked out where they always were; this only says how
 * they got to the figure.
 */

import { applyDamageFloor, damageFloor } from "../rules/damage.js";
import type { CriticalDamage } from "../rules/criticals.js";
import type { DamageType, DiceAdds } from "../rules/types.js";

/**
 * The dice a damage roll came up with, as the damage flag keeps them (since
 * API 1.151.0).
 */
export interface DamageDice {
  /** Each set of dice thrown, each face as it came up. One set for an ordinary roll. */
  sets: number[][];
  /** The adds rolled with them, every modifier summed in, after Modifying Dice + Adds (p. 269). */
  adds: number;
  /** What the whole roll was multiplied by, as 6dx10 is; 1 for none. */
  multiplier: number;
  /** Pellets striking as one mass (Campaigns p. 409); 1 for none. */
  mass: number;
  /** What the dice and adds came to, multiplied, before the damage type's floor and any halving. */
  total: number;
}

/** The faces of every set of dice in an evaluated Roll, one array per set; a die a modifier discarded is left out. */
export function diceSetsOf(roll: any): number[][] {
  const terms = Array.isArray(roll?.dice) ? roll.dice : [];
  return terms
    .map((term: any) => (Array.isArray(term?.results) ? term.results : [])
      .filter((r: any) => r?.active !== false && Number.isFinite(Number(r?.result)))
      .map((r: any) => Number(r.result)))
    .filter((faces: number[]) => faces.length > 0);
}

/** The dice to keep on the flag for a roll of `rolled`, which `mass` pellets striking as one multiply. */
export function damageDice(options: { roll: any; rolled: DiceAdds; mass: number }): DamageDice {
  const { roll, rolled } = options;
  const mass = Math.max(1, Math.floor(Number(options.mass) || 1));
  return {
    sets: diceSetsOf(roll),
    adds: rolled.adds,
    multiplier: rolled.multiplier && rolled.multiplier > 0 ? rolled.multiplier : 1,
    mass,
    total: (Number(roll?.total) || 0) * mass,
  };
}

/** A flag's dice, or null where the card was rolled before they were kept or they are malformed. */
export function storedDamageDice(value: unknown): DamageDice | null {
  const dice = value as Partial<DamageDice> | null | undefined;
  if (!dice || !Array.isArray(dice.sets)) return null;
  const sets = dice.sets.filter((set): set is number[] => Array.isArray(set) && set.every((face) => Number.isFinite(face)));
  return {
    sets,
    adds: Number(dice.adds) || 0,
    multiplier: Number(dice.multiplier) > 0 ? Number(dice.multiplier) : 1,
    mass: Number(dice.mass) > 0 ? Number(dice.mass) : 1,
    total: Number(dice.total) || 0,
  };
}

/** What the card's dice row shows: the dice, then each figure applied to them, in order. */
export interface DiceRow {
  sets: number[][];
  /** A figure the multipliers apply to in place of dice, as a critical's doubled basic damage has; null for none. */
  from: number | null;
  /** The adds, signed, or "" for none. */
  adds: string;
  /** Each multiplier on the roll, as "×N": the formula's, then a mass of pellets', then a critical's. */
  times: string[];
  /**
   * What the row came to, where the headline shows something else -- halved
   * past 1/2D, or raised to the damage type's minimum -- and null where the
   * headline already is its total.
   */
  total: string | null;
  /** The damage type's minimum, where it raised the dice's total to it; null otherwise. */
  floor: number | null;
}

function signedAdds(adds: number): string {
  if (!adds) return "";
  return adds > 0 ? `+${adds}` : `−${Math.abs(adds)}`;
}

function signedTotal(total: number): string {
  return total < 0 ? `−${Math.abs(total)}` : String(total);
}

function timesOf(...factors: number[]): string[] {
  return factors.filter((factor) => factor > 1).map((factor) => `×${factor}`);
}

/**
 * The damage card's dice row: the dice rolled, the adds, the multipliers, and
 * -- where the minimum or 1/2D changed it -- what they came to before.
 */
export function damageDiceRow(dice: DamageDice, basicDamage: number, damageType: DamageType): DiceRow {
  const floored = applyDamageFloor(dice.total, damageType) !== dice.total;
  return {
    sets: dice.sets,
    from: null,
    adds: signedAdds(dice.adds),
    times: timesOf(dice.multiplier, dice.mass),
    total: dice.total === basicDamage ? null : signedTotal(dice.total),
    floor: floored ? damageFloor(damageType) : null,
  };
}

/**
 * The dice a critical's damage came from, for the card that applies it: every
 * die at 6 where it takes maximum damage (Campaigns p. 556), then the adds and
 * multipliers, and the critical's own multiplier; or the rolled basic damage
 * times that multiplier where it only doubles or triples. Null where the
 * critical left the damage as rolled.
 */
export function criticalDiceRow(dice: DamageDice | null, basicDamage: number, critical: CriticalDamage | undefined): DiceRow | null {
  if (!critical) return null;
  const times = critical.multiplier && critical.multiplier > 1 ? critical.multiplier : 1;
  if (critical.maximum && dice && dice.sets.length > 0) {
    return {
      sets: dice.sets.map((set) => set.map(() => 6)),
      from: null,
      adds: signedAdds(dice.adds),
      times: timesOf(dice.multiplier, dice.mass, times),
      total: null,
      floor: null,
    };
  }
  if (times > 1) return { sets: [], from: basicDamage, adds: "", times: timesOf(times), total: null, floor: null };
  return null;
}
