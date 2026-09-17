/**
 * Damage to Shields (GURPS Basic Set: Campaigns p. 484).
 *
 * An optional rule, and the book says why: "Do not use this rule unless you
 * are willing to tolerate some bookkeeping in the name of more realistic
 * combat!" A shield that turns a blow by the width of its Defense Bonus
 * took that blow squarely, and a shield can only take so many.
 */

import { hardenedAgainst } from "./armor.js";
import { objectState, type ObjectState } from "./objects.js";

/**
 * Whether the shield is what saved the defender: "If your shield's DB makes
 * the difference between success and failure on any active defense (not just
 * a block), the blow struck the shield squarely, and may damage it."
 *
 * A defense that succeeded by less than the DB would have failed without it.
 */
export function shieldTookTheBlow(options: {
  succeeded: boolean;
  /** By how much the roll came in under the number needed. */
  margin: number;
  defenseBonus: number;
}): boolean {
  const { succeeded, margin, defenseBonus } = options;
  if (!succeeded || defenseBonus <= 0) return false;
  return margin < defenseBonus;
}

/**
 * "The shield acts as cover, with 'cover DR' equal to its DR + (HP/4).
 * Damage in excess of cover DR penetrates the shield and possibly injures
 * you."
 */
export function shieldCoverDr(dr: number, hp: number | null): number {
  return Math.max(0, dr) + Math.floor(Math.max(0, hp ?? 0) / 4);
}

/** What a blow did to a shield, and what came through it. */
export interface ShieldHit {
  /** Damage the shield's own DR stopped. */
  stopped: number;
  /** HP marked off the shield. */
  shieldInjury: number;
  /** Damage that punched through the shield and reaches the defender. */
  overpenetration: number;
  /** "If no damage penetrates the shield, there is no effect... but you experience full knockback!" */
  fullKnockback: boolean;
}

/**
 * A blow against a shield (p. 484): its DR comes off, the rest is marked
 * against its HP, and anything past its cover DR comes through at the
 * defender.
 *
 * Shields are Homogenous, so there is no wounding modifier to apply -- the
 * damage that gets past the DR is the HP it costs.
 */
export function strikeShield(options: {
  basicDamage: number;
  dr: number;
  hp: number | null;
}): ShieldHit {
  const damage = Math.max(0, options.basicDamage);
  const penetrating = Math.max(0, damage - Math.max(0, options.dr));
  const cover = shieldCoverDr(options.dr, options.hp);
  return {
    stopped: damage - penetrating,
    shieldInjury: penetrating,
    overpenetration: Math.max(0, damage - cover),
    fullKnockback: penetrating === 0,
  };
}

/** Typical HT for a shield: "ordinary shields are Homogenous, with HT 12". */
export const SHIELD_HEALTH = 12;

/** "If it is completely destroyed (-10xHP), it falls off." */
export const SHIELD_FALLS_OFF_MULTIPLE = 10;

/** What state a shield is in after the HP it has lost. */
export function shieldState(hpLost: number, hp: number): ObjectState {
  return objectState(hp - Math.max(0, hpLost), hp);
}

/**
 * "If the shield is disabled or destroyed, it no longer provides its DB, but
 * it still encumbers you until dropped."
 */
export function shieldGivesDb(state: ObjectState): boolean {
  return state === "sound" || state === "damaged";
}

/** Whether the shield has fallen off the arm: -10xHP. */
export function shieldFallsOff(hpLost: number, hp: number): boolean {
  return hp > 0 && hp - hpLost <= -SHIELD_FALLS_OFF_MULTIPLE * hp;
}

/**
 * Where a blow that punched through the shield lands (p. 484): "roll 1d: on
 * 1-2, apply damage to your shield arm; on 3-6, apply it to the location
 * targeted by the attacker."
 */
export function overpenetrationLocation(die: number, aimedAt: string): string {
  return die <= 2 ? "arm" : aimedAt;
}

/**
 * The DR a shield offers a blow (p. 484): its own DR at the blow's armour
 * divisor, after the shield's levels of Hardened (Characters p. 47) have
 * stepped that divisor down. A blow that ignores DR meets none, unless
 * Hardened brings it back onto the ladder.
 */
export function shieldDrAgainst(options: { dr: number; armorDivisor: number; ignoresDr?: boolean; hardened?: number }): number {
  const dr = Math.max(0, options.dr);
  const hardened = hardenedAgainst(options.armorDivisor > 0 ? options.armorDivisor : 1, options.ignoresDr === true, options.hardened ?? 0);
  if (hardened.ignoresDr) return 0;
  const divisor = hardened.divisor > 0 ? hardened.divisor : 1;
  return divisor >= 1 ? Math.floor(dr / divisor) : Math.round(dr / divisor);
}
