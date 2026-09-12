/**
 * Things hitting things (GURPS Basic Set: Campaigns pp. 430-432).
 *
 * "An object in a collision inflicts dice of crushing damage equal to (HP x
 * velocity)/100", which a slam already works out; this is the rest of the
 * page. A hard immovable object doubles the HP it is figured on; a
 * bullet-shaped, sharp or spiked object does half damage of its own type; a
 * head-on collision adds the velocities and a rear-end one subtracts them;
 * and something two Size Modifiers larger overruns what it hits, for thrust
 * damage at half its HP as ST.
 */

import { slamDamage, type SlamDamage } from "./attack-options.js";
import { thrustDamage } from "./damage.js";
import type { DamageType, DiceAdds } from "./types.js";

export type CollisionAngle = "headOn" | "rearEnd" | "side";

/**
 * The velocity a collision is figured at (p. 432): the sum for head-on, the
 * difference for a faster object overtaking a slower one, the mover's own
 * against something stationary or struck side-on.
 */
export function collisionVelocity(options: {
  angle: CollisionAngle;
  velocity: number;
  otherVelocity?: number;
}): number {
  const mine = Math.max(0, options.velocity);
  const theirs = Math.max(0, options.otherVelocity ?? 0);
  switch (options.angle) {
    case "headOn":
      return mine + theirs;
    case "rearEnd":
      return Math.max(0, mine - theirs);
    default:
      return mine;
  }
}

export interface CollisionDamage extends SlamDamage {
  type: DamageType;
}

/**
 * What one party to a collision inflicts on the other (pp. 430-431).
 *
 * `hard` is for "an immovable object that is too big to push aside" that is
 * also hard -- "clay, concrete, ordinary soil, and sand ... a building,
 * mountain, or similar obstacle" -- which uses "twice the HP of the moving
 * object". `sharp` is "bullet-shaped, sharp, or spiked", which "does half
 * damage, but this damage is piercing, cutting, or impaling".
 */
export function collisionDamage(options: {
  hitPoints: number;
  velocity: number;
  hard?: boolean;
  sharp?: DamageType | null;
}): CollisionDamage {
  const hp = Math.max(0, options.hitPoints) * (options.hard ? 2 : 1);
  const dice = slamDamage(hp, options.velocity);
  if (options.sharp) {
    return { ...halveDice(dice), type: options.sharp };
  }
  return { ...dice, type: "cr" };
}

/** Half a damage roll of dice and adds, keeping at least a 1d-3. */
function halveDice(dice: SlamDamage): SlamDamage {
  if (dice.dice <= 1) return { dice: 1, modifier: Math.min(-3, dice.modifier - 1) };
  const half = dice.dice / 2;
  const whole = Math.floor(half);
  return { dice: Math.max(1, whole), modifier: half > whole ? 2 : 0 };
}

/**
 * The extra of an overrun (p. 432): when "the Size Modifier of the striking
 * object ... exceeds that of the struck object by two or more", it "inflicts
 * additional crushing damage: roll thrust damage for ST equal to half the
 * striking object's HP".
 */
export function overrunDamage(options: { strikerSm: number; struckSm: number; strikerHp: number }): DiceAdds | null {
  if (options.strikerSm - options.struckSm < 2) return null;
  return thrustDamage(Math.floor(Math.max(0, options.strikerHp) / 2));
}

/** What a seatbelt or an airbag stops of the whiplash (p. 432). */
export const RESTRAINT_DR = { seatbelt: 5, airbag: 10 } as const;
