/**
 * Fighting from the saddle, and fighting in the air
 * (GURPS Basic Set: Campaigns pp. 396-397, 394-395).
 *
 * Three rules that share a shape: your movement is no longer entirely yours.
 * A rider's defenses are capped by their Riding skill, a flyer's step is their
 * air Move, and anybody going faster than they can stop has to keep going
 * forwards. All three end the same way, in a fall.
 */

import { penalty } from "./modifiers.js";

// ── mounted combat (pp. 396-397) ────────────────────────────────────────────

/** The Riding skill at which a rider defends at full value (p. 397). */
export const CONFIDENT_RIDING = 12;

/**
 * What a rider's own defenses suffer (p. 397).
 *
 * "If he has Riding at 12+, all of these defenses are at normal levels. For a
 * less-skilled rider, reduce active defenses by the difference between 12 and
 * the rider's skill; e.g., someone with Riding-9 would have -3 to all active
 * defenses."
 */
export function mountedDefensePenalty(ridingSkill: number): number {
  return penalty(CONFIDENT_RIDING - ridingSkill);
}

/** The velocity at which a mounted blow starts to change (p. 396). */
export const CHARGE_VELOCITY = 7;

/** What a mounted attack is worth at speed (p. 396). */
export interface MountedAttack {
  toHit: number;
  damageBonus: number;
}

/**
 * A melee attack from a moving mount (p. 396).
 *
 * "A trained rider has no penalties to use melee weapons while mounted. If the
 * mount's velocity is 7 or more relative to the foe, the attack has -1 to hit
 * but +1 damage."
 */
export function mountedAttack(relativeVelocity: number): MountedAttack {
  if (relativeVelocity < CHARGE_VELOCITY) return { toHit: 0, damageBonus: 0 };
  return { toHit: penalty(1), damageBonus: 1 };
}

/**
 * The damage a couched lance does (p. 396).
 *
 * "Work out damage for a collision between the mount and the target -- (mount's
 * ST) x (distance moved last turn)/100 dice of damage, rounded down -- and add
 * the lance's thrust/impaling bonus of +3."
 *
 * The book's example: "a ST 25 warhorse charging at Move 8 inflicts 2d+3
 * impaling damage."
 */
export function lanceDamage(options: {
  mountStrength: number;
  yardsMoved: number;
  /** A blunted tournament lance, which crushes and breaks. */
  jousting?: boolean;
}): { dice: number; adds: number; type: "imp" | "cr"; maxDamage: number | null } {
  const dice = Math.floor((Math.max(0, options.mountStrength) * Math.max(0, options.yardsMoved)) / 100);

  return {
    dice,
    adds: 3,
    type: options.jousting ? "cr" : "imp",
    // "If the damage exceeds 15 points, the lance snaps, limiting damage to 15."
    maxDamage: options.jousting ? 15 : null,
  };
}

/** What it takes to stay on (p. 397). */
export interface StayingOn {
  /** The modifier to the Riding roll, or null where there is no roll at all. */
  modifier: number | null;
  /** True when the rider comes off with no roll allowed. */
  automaticFall: boolean;
}

/**
 * Whether a rider stays on after something went wrong (p. 397).
 *
 * "A rider who is stunned must make a Riding roll at -4 or fall off. A rider
 * who suffers any knockback is automatically knocked off unless he has a saddle
 * and stirrups, in which case he gets a Riding roll at -4 per yard of knockback
 * to stay on."
 */
export function stayingOn(options: {
  stunned?: boolean;
  knockbackYards?: number;
  saddleAndStirrups?: boolean;
}): StayingOn {
  const knockback = Math.max(0, Math.floor(options.knockbackYards ?? 0));

  if (knockback > 0) {
    if (!options.saddleAndStirrups) return { modifier: null, automaticFall: true };
    return { modifier: penalty(4 * knockback), automaticFall: false };
  }

  if (options.stunned) return { modifier: penalty(4), automaticFall: false };

  return { modifier: 0, automaticFall: false };
}

/**
 * What firing from the saddle costs (p. 396).
 *
 * "Roll against the lower of Riding or ranged weapon skill to hit", and the two
 * tricks are worth their own penalties to both rolls.
 */
export function mountedShooting(options: {
  ridingSkill: number;
  weaponSkill: number;
  /** Turning in the saddle to shoot behind you. */
  turnedAround?: boolean;
  /** Hanging off the far side of the mount. */
  hangingOff?: boolean;
}): { toHit: number; ridingModifier: number } {
  const base = Math.min(options.ridingSkill, options.weaponSkill);

  // "To turn in the saddle and fire at the foe behind you: -4 to weapon skill,
  // and -1 to any Riding roll made that turn. To hang on the far side of the
  // mount and shoot over it or underneath it: -6 to weapon skill, -3 to any
  // Riding roll."
  const trick = options.hangingOff ? { skill: 6, riding: 3 } : options.turnedAround ? { skill: 4, riding: 1 } : null;

  return {
    toHit: base + penalty(trick?.skill ?? 0),
    ridingModifier: penalty(trick?.riding ?? 0),
  };
}

/** The extra penalty a second rider costs the one steering (p. 397). */
export const PASSENGER_PENALTY = penalty(1);

/** What a passenger rolls at to stay aboard (p. 397). */
export const PASSENGER_HOLD_PENALTY = penalty(3);

// ── flying combat (p. 397) ──────────────────────────────────────────────────

/**
 * What a yard of movement costs a flyer (p. 397).
 *
 * "Vertical movement costs the same as horizontal movement. Moving a yard
 * vertically and a yard horizontally simultaneously (diagonal movement at 45
 * degrees) costs the same as 1.5 horizontal yards."
 */
export function flightMoveCost(options: { horizontal: number; vertical: number }): number {
  const across = Math.max(0, options.horizontal);
  const up = Math.max(0, options.vertical);
  const diagonal = Math.min(across, up);

  return 1.5 * diagonal + (across - diagonal) + (up - diagonal);
}

/** What a diving flyer gains on a turn spent doing nothing else (p. 397). */
export const DIVE_MOVE_BONUS = 10;

/**
 * A dive's air Move and top speed (p. 397).
 *
 * "A diving flyer can accelerate faster: add +10 to basic air Move and double
 * top airspeed on any turn spent diving and doing nothing else."
 */
export function diving(options: { airMove: number; topAirspeed: number }): {
  airMove: number;
  topAirspeed: number;
} {
  return {
    airMove: options.airMove + DIVE_MOVE_BONUS,
    topAirspeed: 2 * options.topAirspeed,
  };
}

/**
 * The airspeed below which a flyer who cannot hover stalls (p. 397).
 *
 * "You must take a Move or Move and Attack maneuver and move at least 1/4 your
 * top airspeed each turn, or you'll stall and start to fall."
 */
export function stallSpeed(topAirspeed: number): number {
  return Math.max(0, topAirspeed) / 4;
}

/** The roll to pull out of a stall by diving (p. 397). */
export const STALL_RECOVERY_MODIFIER = penalty(4);

// ── high-speed movement (pp. 394-395) ───────────────────────────────────────

/** Whether this velocity counts as high-speed movement (p. 394). */
export function atHighSpeed(options: { velocity: number; basicMove: number }): boolean {
  return options.velocity > options.basicMove;
}

/**
 * The top speed somebody can reach on the turn they break into a run (p. 394).
 *
 * "You may start the next turn with a velocity up to 20% greater than your Move
 * (at minimum, +1 Move). If you have the Enhanced Move advantage, or are a
 * vehicle with a top speed greater than your Move, you may start your next turn
 * with a velocity up to 100% greater than Basic Move."
 */
export function sprintTopSpeed(options: { basicMove: number; enhancedMove?: boolean }): number {
  const move = Math.max(0, options.basicMove);
  if (options.enhancedMove) return 2 * move;
  return Math.max(move + 1, move * 1.2);
}

/**
 * How far you must run straight before you can turn (p. 394).
 *
 * "A major change of direction (up to 60 degrees) is only possible after you've
 * moved straight ahead for a distance equal to at least (current velocity/Basic
 * Move) yards, rounded down."
 *
 * The book's example: velocity 13 at Basic Move 5 is a turning radius of 2.
 */
export function turningRadius(options: { velocity: number; basicMove: number }): number {
  if (options.basicMove <= 0) return Number.POSITIVE_INFINITY;
  return Math.floor(options.velocity / options.basicMove);
}

/**
 * The penalty for cutting speed harder than is safe (p. 395).
 *
 * "Hasty deceleration requires a roll at -1 per two full yards/second beyond
 * Basic Move by which you cut your speed." The book's example: Basic Move 5,
 * decelerating by 9, is -2.
 */
export function hastyDecelerationModifier(options: {
  basicMove: number;
  deceleration: number;
}): number {
  const beyond = Math.max(0, options.deceleration - options.basicMove);
  return penalty(Math.floor(beyond / 2));
}

/**
 * The penalty for turning sooner or harder than is safe (p. 395).
 *
 * "An earlier turn (or a tighter turn) calls for a roll at -1 per full
 * increment of Basic Move by which your velocity exceeds your Basic Move." The
 * book's example: velocity 23 at Basic Move 3 is -6.
 */
export function tightTurnModifier(options: { velocity: number; basicMove: number }): number {
  if (options.basicMove <= 0) return penalty(0);
  const excess = Math.max(0, options.velocity - options.basicMove);
  return penalty(Math.floor(excess / options.basicMove));
}

/** The base roll for pushing the envelope, before those penalties (p. 395). */
export const PUSHING_THE_ENVELOPE = 3;

/** The most you can safely slow by in a turn: your Basic Move (p. 395). */
export function safeDeceleration(basicMove: number): number {
  return Math.max(0, basicMove);
}

/** The most you can slow by at all, with a roll (p. 395). */
export function maximumDeceleration(basicMove: number): number {
  return 2 * Math.max(0, basicMove);
}
