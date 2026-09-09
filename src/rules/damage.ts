/**
 * ST-based damage, wounding modifiers, and the damage-to-injury pipeline
 * (GURPS Lite pp. 6, 19, 29).
 */

import { addModifier } from "./dice.js";
import type { DamageType, DiceAdds } from "./types.js";

/**
 * The printed Damage Table (GURPS Lite p. 6) for ST 1-20, as `[thrust, swing]`
 * step indices into {@link stepToDiceAdds}. This literal table is the source of
 * truth; {@link thrustStep}/{@link swingStep} reproduce it and are verified
 * against it in the test suite.
 */
const DAMAGE_TABLE: ReadonlyArray<readonly [string, string]> = [
  ["1d-6", "1d-5"], // ST 1
  ["1d-6", "1d-5"], // ST 2
  ["1d-5", "1d-4"], // ST 3
  ["1d-5", "1d-4"], // ST 4
  ["1d-4", "1d-3"], // ST 5
  ["1d-4", "1d-3"], // ST 6
  ["1d-3", "1d-2"], // ST 7
  ["1d-3", "1d-2"], // ST 8
  ["1d-2", "1d-1"], // ST 9
  ["1d-2", "1d"], //   ST 10
  ["1d-1", "1d+1"], // ST 11
  ["1d-1", "1d+2"], // ST 12
  ["1d", "2d-1"], //   ST 13
  ["1d", "2d"], //     ST 14
  ["1d+1", "2d+1"], // ST 15
  ["1d+1", "2d+2"], // ST 16
  ["1d+2", "3d-1"], // ST 17
  ["1d+2", "3d"], //   ST 18
  ["2d-1", "3d+1"], // ST 19
  ["2d-1", "3d+2"], // ST 20
];

/** The highest ST covered by the printed GURPS Lite Damage Table. */
export const MAX_TABULATED_ST = DAMAGE_TABLE.length;

/**
 * Converts a damage "step" into dice+adds. Steps advance `1d-6, 1d-5, ... 1d+2,
 * 2d-1, 2d, 2d+1, 2d+2, 3d-1, ...`: adds run from -1 to +2 before rolling over
 * into an extra die.
 */
export function stepToDiceAdds(step: number): DiceAdds {
  if (step < 0) return { dice: 1, adds: -6 };
  if (step <= 8) return { dice: 1, adds: step - 6 };
  const beyond = step - 9;
  return { dice: 2 + Math.floor(beyond / 4), adds: (beyond % 4) - 1 };
}

/** Damage step for thrusting attacks: one step per two points of ST. */
export function thrustStep(st: number): number {
  return Math.floor((st - 1) / 2);
}

/** Damage step for swinging attacks: one step per point of ST from ST 8 up. */
export function swingStep(st: number): number {
  return st >= 8 ? st - 4 : Math.floor((st - 1) / 2) + 1;
}

/**
 * Basic thrusting damage for a given ST (GURPS Lite p. 6).
 *
 * ST above 20 is extrapolated from the table's progression. GURPS Lite stops at
 * ST 20; the full Basic Set table flattens out at very high ST, so these values
 * run hot for ST beyond roughly the high 20s.
 */
export function thrustDamage(st: number): DiceAdds {
  return stepToDiceAdds(thrustStep(Math.max(1, st)));
}

/** Basic swinging damage for a given ST (GURPS Lite p. 6). See {@link thrustDamage}. */
export function swingDamage(st: number): DiceAdds {
  return stepToDiceAdds(swingStep(Math.max(1, st)));
}

/** Returns the printed table entry for ST 1-20, or `null` outside that range. */
export function tabulatedDamage(st: number): { thrust: string; swing: string } | null {
  const row = DAMAGE_TABLE[st - 1];
  if (!row) return null;
  return { thrust: row[0], swing: row[1] };
}

/**
 * Effective ST for melee damage is capped at triple a weapon's minimum ST
 * (GURPS Lite p. 20). A large knife with minimum ST 6 caps damage at ST 18.
 */
export function effectiveStrengthForWeapon(st: number, weaponMinSt: number | null): number {
  if (weaponMinSt === null || weaponMinSt <= 0) return st;
  return Math.min(st, weaponMinSt * 3);
}

/** Resolves a weapon's `thr`/`sw` based damage into concrete dice+adds. */
export function weaponDamage(
  st: number,
  base: "thr" | "sw",
  modifier: number,
  weaponMinSt: number | null = null,
): DiceAdds {
  const effectiveSt = effectiveStrengthForWeapon(st, weaponMinSt);
  const raw = base === "thr" ? thrustDamage(effectiveSt) : swingDamage(effectiveSt);
  return addModifier(raw, modifier);
}

/** Wounding modifiers by damage type (GURPS Lite p. 29). */
export const WOUNDING_MODIFIERS: Record<DamageType, number> = {
  burn: 1,
  cr: 1,
  cut: 1.5,
  imp: 2,
  "pi-": 0.5,
  pi: 1,
  "pi+": 1.5,
};

/**
 * The floor a damage roll cannot fall below: 0 for crushing, 1 for every other
 * damage type (GURPS Lite p. 29).
 */
export function damageFloor(type: DamageType): number {
  return type === "cr" ? 0 : 1;
}

/** Applies the damage-type floor to a raw damage total. */
export function applyDamageFloor(total: number, type: DamageType): number {
  return Math.max(damageFloor(type), total);
}

/**
 * Halves basic damage for targets at or beyond a ranged weapon's 1/2D range,
 * rounding down (GURPS Lite p. 29). The damage-type floor is reapplied, so a
 * cutting attack still deals at least 1 point of basic damage.
 */
export function halveDamage(basicDamage: number, type: DamageType): number {
  return applyDamageFloor(Math.floor(basicDamage / 2), type);
}

export interface InjuryInput {
  /** Basic damage rolled, after any 1/2D halving. */
  basicDamage: number;
  /** The target's total Damage Resistance from armor, tough skin, cover, etc. */
  dr: number;
  type: DamageType;
  /** A weapon's armor divisor, e.g. 2 for `(2)`. Divides DR before subtraction. */
  armorDivisor?: number;
}

export interface InjuryResult {
  /** DR after the armor divisor is applied. */
  effectiveDr: number;
  /** Damage that got through DR, before the wounding modifier. */
  penetrating: number;
  /** The wounding modifier applied for this damage type. */
  woundingModifier: number;
  /** Hit points actually lost. */
  injury: number;
}

/**
 * Runs the full penetration pipeline: divide DR by any armor divisor, subtract
 * it from basic damage, then multiply the remainder by the damage type's
 * wounding modifier (GURPS Lite p. 29).
 *
 * Fractions round down, but any attack that penetrates DR at all inflicts a
 * minimum of 1 point of injury.
 */
export function computeInjury({
  basicDamage,
  dr,
  type,
  armorDivisor = 1,
}: InjuryInput): InjuryResult {
  const divisor = armorDivisor > 0 ? armorDivisor : 1;
  const effectiveDr = Math.floor(Math.max(0, dr) / divisor);
  const penetrating = Math.max(0, basicDamage - effectiveDr);
  const woundingModifier = WOUNDING_MODIFIERS[type];

  if (penetrating <= 0) {
    return { effectiveDr, penetrating: 0, woundingModifier, injury: 0 };
  }

  const injury = Math.max(1, Math.floor(penetrating * woundingModifier));
  return { effectiveDr, penetrating, woundingModifier, injury };
}
