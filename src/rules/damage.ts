/**
 * ST-based damage, wounding modifiers, and the damage-to-injury pipeline
 * (GURPS Lite pp. 6, 19, 29).
 */

import { addModifier, parseDiceAdds } from "./dice.js";
import {
  applyCrippling,
  locationDrAgainst,
  woundingModifierAt,
  type AttackQualifiers,
  type HitLocation,
} from "./hit-locations.js";
import type { DamageType, DiceAdds } from "./types.js";

/**
 * The Damage Table (GURPS Basic Set: Characters p. 16).
 *
 * Keyed by ST, as `[thrust, swing]`. Every ST from 1 to 40 is listed, then
 * every fifth point to 100 — a ST between two listed rows uses the lower one,
 * so ST 43 rolls as ST 40.
 *
 * This literal table is the source of truth. It cannot be generated: the swing
 * progression is linear to ST 26 and then flattens, so ST 27 and 28 both give
 * 5d+1 and ST 39 and 40 both give 7d-1.
 */
const DAMAGE_TABLE: ReadonlyMap<number, readonly [string, string]> = new Map([
  [1, ["1d-6", "1d-5"]], [2, ["1d-6", "1d-5"]],
  [3, ["1d-5", "1d-4"]], [4, ["1d-5", "1d-4"]],
  [5, ["1d-4", "1d-3"]], [6, ["1d-4", "1d-3"]],
  [7, ["1d-3", "1d-2"]], [8, ["1d-3", "1d-2"]],
  [9, ["1d-2", "1d-1"]], [10, ["1d-2", "1d"]],
  [11, ["1d-1", "1d+1"]], [12, ["1d-1", "1d+2"]],
  [13, ["1d", "2d-1"]], [14, ["1d", "2d"]],
  [15, ["1d+1", "2d+1"]], [16, ["1d+1", "2d+2"]],
  [17, ["1d+2", "3d-1"]], [18, ["1d+2", "3d"]],
  [19, ["2d-1", "3d+1"]], [20, ["2d-1", "3d+2"]],
  [21, ["2d", "4d-1"]], [22, ["2d", "4d"]],
  [23, ["2d+1", "4d+1"]], [24, ["2d+1", "4d+2"]],
  [25, ["2d+2", "5d-1"]], [26, ["2d+2", "5d"]],
  // The swing progression flattens from here.
  [27, ["3d-1", "5d+1"]], [28, ["3d-1", "5d+1"]],
  [29, ["3d", "5d+2"]], [30, ["3d", "5d+2"]],
  [31, ["3d+1", "6d-1"]], [32, ["3d+1", "6d-1"]],
  [33, ["3d+2", "6d"]], [34, ["3d+2", "6d"]],
  [35, ["4d-1", "6d+1"]], [36, ["4d-1", "6d+1"]],
  [37, ["4d", "6d+2"]], [38, ["4d", "6d+2"]],
  [39, ["4d+1", "7d-1"]], [40, ["4d+1", "7d-1"]],
  [45, ["5d", "7d+1"]], [50, ["5d+2", "8d-1"]],
  [55, ["6d", "8d+1"]], [60, ["7d-1", "9d"]],
  [65, ["7d+1", "9d+2"]], [70, ["8d", "10d"]],
  [75, ["8d+2", "10d+2"]], [80, ["9d", "11d"]],
  [85, ["9d+2", "11d+2"]], [90, ["10d", "12d"]],
  [95, ["10d+2", "12d+2"]], [100, ["11d", "13d"]],
]);

/** The highest ST the Damage Table prints. Above this, dice are added by rule. */
export const MAX_TABULATED_ST = 100;

/** Listed ST values, descending, for finding the row a given ST falls on. */
const TABULATED_ST = [...DAMAGE_TABLE.keys()].sort((a, b) => b - a);

/**
 * Looks up the Damage Table row that applies to a given ST.
 *
 * A ST between two listed rows uses the lower one; anything above 100 uses the
 * ST 100 row, with the extra dice applied separately by {@link diceAboveTable}.
 */
function damageRow(st: number): readonly [string, string] {
  const clamped = Math.max(1, Math.floor(st));
  const key = TABULATED_ST.find((candidate) => candidate <= clamped) ?? 1;
  return DAMAGE_TABLE.get(key)!;
}

/**
 * Extra dice for ST above 100: one added die to both thrust and swing per full
 * 10 points over 100 (GURPS Basic Set: Characters p. 15).
 */
function diceAboveTable(st: number): number {
  if (st <= MAX_TABULATED_ST) return 0;
  return Math.floor((st - MAX_TABULATED_ST) / 10);
}

function damageForColumn(st: number, column: 0 | 1): DiceAdds {
  const parsed = parseDiceAdds(damageRow(st)[column])!;
  return { dice: parsed.dice + diceAboveTable(st), adds: parsed.adds };
}

/** Basic thrusting damage for a given ST (GURPS Basic Set: Characters p. 16). */
export function thrustDamage(st: number): DiceAdds {
  return damageForColumn(st, 0);
}

/** Basic swinging damage for a given ST (GURPS Basic Set: Characters p. 16). */
export function swingDamage(st: number): DiceAdds {
  return damageForColumn(st, 1);
}

/** The printed table entry for a ST, or `null` when that ST has no listed row. */
export function tabulatedDamage(st: number): { thrust: string; swing: string } | null {
  const row = DAMAGE_TABLE.get(st);
  return row ? { thrust: row[0], swing: row[1] } : null;
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

/** Wounding modifiers by damage type (GURPS Basic Set: Campaigns p. 379). */
export const WOUNDING_MODIFIERS: Record<DamageType, number> = {
  "pi-": 0.5,
  burn: 1,
  cor: 1,
  cr: 1,
  fat: 1,
  pi: 1,
  tox: 1,
  cut: 1.5,
  "pi+": 1.5,
  imp: 2,
  "pi++": 2,
};

/**
 * The floor a damage roll cannot fall below: 0 for crushing, 1 for every other
 * damage type (GURPS Lite p. 29).
 */
export function damageFloor(type: DamageType): number {
  return type === "cr" ? 0 : 1;
}

/**
 * Fatigue damage costs FP rather than HP and always ignores hit location
 * (GURPS Basic Set: Campaigns p. 398).
 */
export function costsFatigue(type: DamageType): boolean {
  return type === "fat";
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
  /**
   * Where the blow landed. Changes the wounding modifier and, on the skull,
   * adds DR. Omit for a location-agnostic calculation.
   */
  hitLocation?: HitLocation;
  /** Maximum HP, needed only to cap injury to a crippled limb. */
  maxHp?: number;
  /** Tight-beam burning and similar qualifiers that change targeting rules. */
  qualifiers?: AttackQualifiers;
}

export interface InjuryResult {
  /** DR after the armor divisor is applied, including any location DR. */
  effectiveDr: number;
  /** Damage that got through DR, before the wounding modifier. */
  penetrating: number;
  /** The wounding modifier applied, after any per-location override. */
  woundingModifier: number;
  /** Hit points actually lost. */
  injury: number;
  /** Injury discarded because it exceeded a limb's crippling threshold. */
  excessLost: number;
  /** Whether this blow crippled the limb or extremity it struck. */
  crippled: boolean;
  /**
   * True when the loss is Fatigue Points rather than Hit Points. Fatigue
   * damage never uses hit location.
   */
  costsFatigue: boolean;
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
  hitLocation,
  maxHp,
  qualifiers = {},
}: InjuryInput): InjuryResult {
  const divisor = armorDivisor > 0 ? armorDivisor : 1;

  // Fatigue damage costs FP and always ignores hit location, so it skips the
  // location DR, the wounding overrides, and the crippling cap entirely.
  const fatigue = costsFatigue(type);
  const location = fatigue ? undefined : hitLocation;

  // The skull's extra DR is natural armor, so the divisor applies to it too —
  // and toxic damage is exempt from it, as it is from the skull multiplier.
  const locationDr = location ? locationDrAgainst(location, type) : 0;
  const effectiveDr = Math.floor((Math.max(0, dr) + locationDr) / divisor);
  const penetrating = Math.max(0, basicDamage - effectiveDr);
  const woundingModifier = location
    ? woundingModifierAt(type, location, qualifiers)
    : WOUNDING_MODIFIERS[type];

  const base = { effectiveDr, penetrating, woundingModifier, costsFatigue: fatigue };

  if (penetrating <= 0) {
    return { ...base, penetrating: 0, injury: 0, excessLost: 0, crippled: false };
  }

  const raw = Math.max(1, Math.floor(penetrating * woundingModifier));

  // Injury past what cripples a limb is lost rather than carried to the body.
  if (location && maxHp !== undefined) {
    const { injury, excessLost, crippled } = applyCrippling(raw, location, maxHp);
    return { ...base, injury, excessLost, crippled };
  }

  return { ...base, injury: raw, excessLost: 0, crippled: false };
}
