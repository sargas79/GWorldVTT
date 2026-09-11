/**
 * Beating somebody without killing them (GURPS Basic Set: Campaigns p. 401).
 *
 * "Knockout gas, high-tech stunners, magic, and similar tricks are the best
 * ways to take prisoners -- most weapons are entirely too final!" These are
 * what you do when you have not got any of those and still want the prisoner
 * alive at the end of it.
 *
 * Grappling, pinning and choking are elsewhere; so is disarming. What is here
 * is the two ways of hitting somebody more gently than you could.
 */

import { addModifier } from "./dice.js";
import type { DamageType, DiceAdds } from "./types.js";
import { weaponDamage } from "./damage.js";


/**
 * Damage at less than your full strength (p. 401).
 *
 * "You can choose to use any ST value less than your own when you strike with
 * bare hands or a melee weapon, thrown weapon, bow, or sling (but not with a
 * crossbow or a firearm)."
 *
 * A crossbow or a firearm does what it does: the strength that matters was
 * spent winding or manufacturing it, not swinging it.
 */
export function canPullPunches(weapon: "muscle" | "mechanical"): boolean {
  return weapon === "muscle";
}

/** The strength actually used, which cannot exceed your own or fall below 1. */
export function pulledStrength(strength: number, chosen: number): number {
  return Math.max(1, Math.min(Math.floor(strength), Math.floor(chosen)));
}

/** Damage for a blow struck at less than full strength. */
export function pulledDamage(options: {
  strength: number;
  chosen: number;
  base: "thr" | "sw";
  modifier: number;
  weaponMinSt?: number | null;
}): DiceAdds {
  return weaponDamage(
    pulledStrength(options.strength, options.chosen),
    options.base,
    options.modifier,
    options.weaponMinSt ?? null,
  );
}

/** What hitting somebody with the wrong part of the weapon does. */
export interface TurnedBlade {
  type: DamageType;
  /** Damage after the change, which for a reversed spear is a point less. */
  damage: DiceAdds;
  /** True when reversing it first costs a Ready maneuver. */
  needsReadying: boolean;
}

/**
 * Striking with the flat or the butt (p. 401).
 *
 * "You can strike with the flat side of any swing/cutting weapon; this turns
 * its usual cutting damage into crushing damage. You can also poke with the
 * blunt end of a thrust/impaling weapon; this reduces damage by 1 point and
 * makes damage crushing. Reversing a reach 2+ impaling weapon to attack with
 * its blunt end requires a Ready maneuver."
 *
 * Anything already crushing has nothing to turn, and anything else -- a
 * burning sword, a toxic sting -- is not a blade with a flat side.
 */
export function turnedBlade(options: {
  type: DamageType;
  damage: DiceAdds;
  /** The weapon's longest reach, which decides whether reversing takes a turn. */
  reach?: number;
}): TurnedBlade | null {
  if (options.type === "cut") {
    return { type: "cr", damage: options.damage, needsReadying: false };
  }

  if (options.type === "imp") {
    return {
      type: "cr",
      damage: addModifier(options.damage, -1),
      needsReadying: (options.reach ?? 1) >= 2,
    };
  }

  return null;
}
