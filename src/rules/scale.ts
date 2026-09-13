/**
 * Scaling damage, and fighting from a vehicle (GURPS Basic Set: Campaigns
 * pp. 469-470).
 *
 * "Large vehicles such as tanks, warships, and starships can have huge DR and
 * HP scores, and their weapons can inflict massive amounts of damage. To avoid
 * excessive die rolling, it is best to adjust the damage scale."
 *
 * A hundred and fifty dice is not a roll anybody makes twice. The fix is to
 * divide everything by ten, or by a hundred, and fight the battle in the
 * smaller numbers -- which works only if the conversion is exact both ways,
 * which is what this is for.
 */

import type { DiceAdds } from "./types.js";

/** The two scales the book offers, beside the ordinary one. */
export type DamageScale = "normal" | "decade" | "century";

/** What each scale divides by. */
export function divisorOf(scale: DamageScale): number {
  return scale === "century" ? 100 : scale === "decade" ? 10 : 1;
}

/**
 * A DR or HP score at a given scale (p. 470).
 *
 * "Divide DR, HP, and damage dice by 10 before combat starts. Round fractions
 * of 0.5 or more up."
 */
export function scaleScore(value: number, scale: DamageScale): number {
  const divided = value / divisorOf(scale);
  // "Round fractions of 0.5 or more up", which is round-half-up rather than
  // JavaScript's round-half-toward-positive-infinity for negatives. Neither DR
  // nor HP is negative, so the two agree here; the wording is followed anyway.
  return Math.floor(divided + 0.5);
}

/**
 * Turns a damage multiplier into dice before anything is scaled (p. 470).
 *
 * "Convert damage multipliers to dice first; e.g., 6dx25 becomes 150d, which
 * scales to 15d."
 */
export function multipliedDice(dice: number, multiplier = 1): number {
  return Math.max(0, dice) * Math.max(1, multiplier);
}

/**
 * Damage at a given scale (p. 470).
 *
 * The whole of the exception is in the fractions: "If the converted damage is
 * under 1d, treat fractions up to 0.25 as 1d-3, fractions up to 0.5 as 1d-2,
 * and larger fractions as 1d-1." A tank's machine gun does not stop existing
 * because it is small next to the tank.
 *
 * The adds travel with the dice and are scaled the same way, since a die and
 * its adds are one figure; an armour divisor does not: "Do not divide armor
 * divisors."
 */
export function scaleDamage(options: {
  damage: DiceAdds;
  multiplier?: number;
  scale: DamageScale;
}): DiceAdds {
  const divisor = divisorOf(options.scale);
  const dice = multipliedDice(options.damage.dice, options.multiplier ?? 1) / divisor;

  if (dice >= 1) {
    return {
      dice: Math.floor(dice + 0.5),
      adds: Math.round((options.damage.adds ?? 0) / divisor),
    };
  }

  // Under a die, and the book substitutes a small one rather than nothing.
  if (dice <= 0) return { dice: 0, adds: 0 };
  if (dice <= 0.25) return { dice: 1, adds: -3 };
  if (dice <= 0.5) return { dice: 1, adds: -2 };
  return { dice: 1, adds: -1 };
}

/**
 * A score carried back out of the smaller numbers (p. 470).
 *
 * "After the battle, multiply remaining HP by 10 or 100, as appropriate, to
 * convert back."
 */
export function unscaleScore(value: number, scale: DamageScale): number {
  return value * divisorOf(scale);
}

// ── fighting from a vehicle (p. 469) ────────────────────────────────────────

/**
 * A vehicle's Dodge (p. 469).
 *
 * "A vehicle's Dodge score is (operator's control skill/2) + vehicle's
 * Handling, rounded down. For example, a biker with Driving (Motorcycle)-14 on
 * a motorcycle with Handling +1 has a Dodge of 14/2 + 1 = 8."
 *
 * A vehicle nobody is driving does not dodge, which is the same fact as its
 * plowing ahead on nobody's turn (p. 467).
 */
export function vehicleDodge(options: {
  /** The operator's level in the vehicle's control skill, or null for nobody. */
  controlSkill: number | null;
  handling: number;
}): number | null {
  if (options.controlSkill === null) return null;
  return Math.floor(options.controlSkill / 2) + options.handling;
}

/**
 * What firing a handheld weapon from the driver's seat costs (p. 469).
 *
 * "If the operator fires a handheld weapon, he must take a Move and Attack
 * maneuver. This gives him -2 to hit or a penalty equal to his weapon's Bulk,
 * whichever is worse - his attention is divided between driving and shooting.
 * Do not apply this penalty to mounted weapon attacks, ramming attempts, or
 * vehicular melee attacks."
 */
export type VehicleAttackKind = "handheld" | "mounted" | "ramming" | "vehicularMelee";

export function drivingAttackPenalty(options: {
  kind: VehicleAttackKind;
  /** The weapon's Bulk, which is already a negative number. */
  bulk: number;
}): number {
  if (options.kind !== "handheld") return 0;
  // "-2 to hit or a penalty equal to his weapon's Bulk, whichever is worse."
  return Math.min(-2, options.bulk);
}

/**
 * Whether an occupant may defend against this (p. 469).
 *
 * "Occupants who are free to move (not strapped in, etc.) may dodge attacks
 * specifically targeted on them, but they get no defense against stray shots
 * or attacks that penetrate the vehicle and go on to strike them."
 */
export function occupantMayDodge(options: {
  strappedIn: boolean;
  /** True when the shot was aimed at this person rather than at the vehicle. */
  targeted: boolean;
}): boolean {
  return options.targeted && !options.strappedIn;
}
