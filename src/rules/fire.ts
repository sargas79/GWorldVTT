/**
 * Flame (GURPS Basic Set: Campaigns pp. 433-434).
 *
 * "If you spend part of a turn in a fire ... you take 1d-3 burning damage. If
 * you spend all of a turn in a fire of ordinary intensity -- or if you are
 * on fire -- you take 1d-1 damage per second." A blow of 3 points of burning
 * sets part of the clothing alight, one of 10 all of it, and each burns and
 * distracts until put out. Materials catch by their flammability class.
 */

import type { DiceAdds } from "./types.js";

export type FireExposure = "partTurn" | "fullTurn" | "intense";

/** What a second in the flames does (p. 433). Large-Area Injury applies. */
export const FIRE_DAMAGE: Readonly<Record<FireExposure, DiceAdds>> = {
  partTurn: { dice: 1, adds: -3 },
  fullTurn: { dice: 1, adds: -1 },
  intense: { dice: 3, adds: 0 }, // "molten metal or a furnace would inflict 3d per second"
};

export type Alight = "part" | "all";

export interface Burning {
  /** How much of the clothing is alight. */
  alight: Alight;
  /** Burning damage each second until put out. */
  damage: DiceAdds;
  /** The distraction: -2 DX, or -3 "except when rolling to put out the fire". */
  dxPenalty: number;
  /** Ready maneuvers each attempt to put it out takes: beating with the hands, or rolling on the ground. */
  readiesToPutOut: number;
}

/** "A single hit that inflicts at least 3 points of basic burning damage ignites part of the victim's clothing." */
export const CLOTHING_CATCHES_AT = 3;
/** "A single hit that inflicts 10 or more points of basic burning damage ignites all of the victim's clothes." */
export const ALL_CLOTHES_CATCH_AT = 10;

/**
 * Whether a blow of burning damage sets the victim alight, and what that
 * means (p. 434). Null when it does not. Tight-beam burning attacks are
 * divided by 10 first, which is the caller's to do.
 */
export function catchingFire(basicBurningDamage: number): Burning | null {
  if (basicBurningDamage >= ALL_CLOTHES_CATCH_AT) {
    return { alight: "all", damage: { dice: 1, adds: -1 }, dxPenalty: -3, readiesToPutOut: 3 };
  }
  if (basicBurningDamage >= CLOTHING_CATCHES_AT) {
    return { alight: "part", damage: { dice: 1, adds: -4 }, dxPenalty: -2, readiesToPutOut: 1 };
  }
  return null;
}

/** "Jumping into water takes only one second, and automatically extinguishes the fire." */
export const WATER_PUTS_OUT = true;

export type Flammability =
  | "superFlammable"
  | "highlyFlammable"
  | "flammable"
  | "resistant"
  | "highlyResistant"
  | "nonflammable";

/**
 * "The amount of burning or incendiary damage needed to set them aflame"
 * in a single roll (p. 433); null for what never burns.
 */
export const IGNITION_DAMAGE: Readonly<Record<Flammability, number | null>> = {
  superFlammable: 0, // black powder, ether: a candle flame
  highlyFlammable: 1, // alcohol, paper, tinder
  flammable: 3, // dry wood, kindling, oil
  resistant: 10, // seasoned wood, clothing, rope, leather
  highlyResistant: 30, // green wood, flesh
  nonflammable: null, // brick, metal, rock
};

/** Whether one roll of burning damage lights a material at once (p. 433). */
export function ignites(material: Flammability, burningDamage: number): boolean {
  const needed = IGNITION_DAMAGE[material];
  return needed !== null && burningDamage >= needed;
}

/**
 * The 3d target for prolonged contact by a flame too weak to light the
 * material outright (p. 433), rolled "for every 10 seconds of contact":
 * "materials one category up ... catch fire on a 16 or less; those two
 * categories up ... on a 6 or less." Null when the flame is up to it, or
 * hopelessly short.
 */
export function prolongedContactTarget(material: Flammability, flameDamagePerSecond: number): number | null {
  const order: Flammability[] = [
    "superFlammable", "highlyFlammable", "flammable", "resistant", "highlyResistant", "nonflammable",
  ];
  const needed = IGNITION_DAMAGE[material];
  if (needed === null) return null;
  const strong = order.findIndex((m) => (IGNITION_DAMAGE[m] ?? Infinity) > flameDamagePerSecond) - 1;
  const gap = order.indexOf(material) - Math.max(0, strong);
  if (gap <= 0) return null;
  if (gap === 1) return 16;
  if (gap === 2) return 6;
  return null;
}
