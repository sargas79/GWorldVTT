/**
 * ST-based damage, wounding modifiers, and the damage-to-injury pipeline
 * (GURPS Lite pp. 6, 19, 29).
 */

import { criticalDr, type CriticalDamage } from "./criticals.js";
import { addModifier, parseDiceAdds } from "./dice.js";
import {
  diffuseInjuryCap,
  toleratedLocation,
  toleratedWoundingModifier,
  type InjuryTolerance,
} from "./injury-tolerance.js";
import {
  applyCrippling,
  locationDrAgainst,
  woundingModifierAt,
  type AttackQualifiers,
  type HitLocation,
  type LimbCounts,
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

/**
 * The adds a bonus "per die" of basic thrust or swing damage comes to: the
 * bonus times the dice of the weapon's thrust or swing at that ST, capped by
 * its minimum ST as the damage is. Damage that is not thrust or swing -- a
 * grenade's fixed dice -- gets nothing.
 */
export function perDieOfBasicDamage(
  bonus: number,
  base: string,
  st: number,
  weaponMinSt: number | null = null,
): number {
  if (!bonus || (base !== "thr" && base !== "sw")) return 0;
  const effectiveSt = effectiveStrengthForWeapon(st, weaponMinSt);
  return bonus * (base === "thr" ? thrustDamage(effectiveSt) : swingDamage(effectiveSt)).dice;
}

/**
 * Resolves a weapon's `thr`/`sw` based damage into concrete dice+adds.
 *
 * A few powered weapons add whole dice to the swing rather than points -- a
 * chainsaw is "sw+1d cut" (GURPS Basic Set: Characters p. 274) -- so the
 * extra dice ride on top of the modifier.
 */
export function weaponDamage(
  st: number,
  base: "thr" | "sw",
  modifier: number,
  weaponMinSt: number | null = null,
  extraDice = 0,
): DiceAdds {
  const effectiveSt = effectiveStrengthForWeapon(st, weaponMinSt);
  const raw = base === "thr" ? thrustDamage(effectiveSt) : swingDamage(effectiveSt);
  const withDice = extraDice > 0 ? { ...raw, dice: raw.dice + Math.floor(extraDice) } : raw;
  return addModifier(withDice, modifier);
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
  /**
   * A Vulnerability multiplier (Characters p. 161), applied to "damage that
   * penetrates your DR" before the ordinary wounding modifier, which "further
   * multiplies the damage". One for a target with none that applies.
   */
  vulnerability?: number;
  /**
   * How the target's body takes injury, where it is not flesh (Characters
   * pp. 60-61): where a blow to a part it lacks actually lands, what piercing
   * and impaling are worth against it, and the cap on a Diffuse body.
   */
  tolerance?: InjuryTolerance;
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
  /**
   * The target's arms and legs, where it has more than two: each then
   * cripples on less (Campaigns p. 421). Omitted, a body has two of each.
   */
  limbs?: LimbCounts;
  /** Tight-beam burning and similar qualifiers that change targeting rules. */
  qualifiers?: AttackQualifiers;
  /**
   * A critical hit's effect on the target's DR. The tables halve or ignore DR
   * "after applying any armor divisors", so it is applied here rather than by
   * the caller adjusting the DR it passes in.
   */
  critical?: CriticalDamage;
  /**
   * A wounding modifier to use in place of the location's, for a location a
   * module defines on top of one of the Basic Set's. A body whose Injury
   * Tolerance sets the figure still has the last word.
   */
  woundingOverride?: number;
  /**
   * The injury above which the struck part is crippled, in place of the
   * location's: a number, or null for a part that can't be crippled. Left
   * out, the location decides.
   */
  cripplingThreshold?: number | null;
  /**
   * True where `basicDamage` is already what got past DR, the location's own
   * (the skull's bone) included, so nothing more comes off it (since API
   * 1.148.0).
   */
  ignoreLocationDr?: boolean;
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
  limbs,
  qualifiers = {},
  critical,
  tolerance,
  vulnerability = 1,
  woundingOverride,
  cripplingThreshold,
  ignoreLocationDr = false,
}: InjuryInput): InjuryResult {
  const divisor = armorDivisor > 0 ? armorDivisor : 1;

  // Fatigue damage costs FP and always ignores hit location, so it skips the
  // location DR, the wounding overrides, and the crippling cap entirely.
  const fatigue = costsFatigue(type);
  // A body missing the part struck takes the blow on the part that is there:
  // a skull with no brain in it is a face, a missing neck is a torso.
  const location = fatigue
    ? undefined
    : hitLocation && tolerance
      ? toleratedLocation(hitLocation, tolerance)
      : hitLocation;

  // The skull's extra DR is natural armor, so the divisor applies to it too —
  // and toxic damage is exempt from it, as it is from the skull multiplier.
  const locationDr = location && !ignoreLocationDr ? locationDrAgainst(location, type) : 0;
  const effectiveDr = criticalDr(Math.floor((Math.max(0, dr) + locationDr) / divisor), critical);
  const penetrating = Math.max(0, basicDamage - effectiveDr);
  // A machine or a stone takes piercing and impaling as its substance allows,
  // wherever it was struck: the tolerance's figure replaces the location's.
  const tolerated = tolerance ? toleratedWoundingModifier(type, tolerance) : null;
  const woundingModifier =
    tolerated !== null
      ? tolerated
      : !fatigue && typeof woundingOverride === "number" && Number.isFinite(woundingOverride)
        ? woundingOverride
        : location
          ? woundingModifierAt(type, location, qualifiers)
          : WOUNDING_MODIFIERS[type];

  const base = { effectiveDr, penetrating, woundingModifier, costsFatigue: fatigue };

  if (penetrating <= 0) {
    return { ...base, penetrating: 0, injury: 0, excessLost: 0, crippled: false };
  }

  // A Diffuse body is barely there to hurt: a point from anything that
  // pierces, two from anything else, however hard it was hit.
  const cap = tolerance ? diffuseInjuryCap(type, tolerance) : null;
  const raw = Math.min(
    cap ?? Number.POSITIVE_INFINITY,
    Math.max(1, Math.floor(penetrating * Math.max(1, vulnerability) * woundingModifier)),
  );

  // A threshold given in place of the location's: none at all, or a figure
  // past which the excess is lost as it is for a limb.
  if (location && cripplingThreshold !== undefined) {
    if (cripplingThreshold === null || raw <= cripplingThreshold) {
      return { ...base, injury: raw, excessLost: 0, crippled: false };
    }
    // The least whole injury over it, as for a limb (Campaigns p. 421).
    const capped = Math.floor(cripplingThreshold) + 1;
    return { ...base, injury: capped, excessLost: raw - capped, crippled: true };
  }

  // Injury past what cripples a limb is lost rather than carried to the body.
  if (location && maxHp !== undefined) {
    const { injury, excessLost, crippled } = applyCrippling(raw, location, maxHp, limbs);
    return { ...base, injury, excessLost, crippled };
  }

  return { ...base, injury: raw, excessLost: 0, crippled: false };
}

/**
 * A blow's injury held to a cap a module set (since API 1.73.0).
 *
 * The Basic Set caps a limb or extremity at what cripples it (Campaigns
 * p. 421), which {@link computeInjury} already does; this is the same kind of
 * limit set per blow, from outside. What was lost to it is kept apart, so the
 * uncapped figure is still there for whatever reads the wound rather than the
 * hit points it cost -- bleeding, say. No cap, or one that is not a number,
 * leaves the injury alone; a negative one is none at all.
 */
export function capInjury(injury: number, cap: number | null | undefined): { injury: number; lost: number } {
  const whole = Math.max(0, Math.floor(injury));
  if (cap === null || cap === undefined || !Number.isFinite(Number(cap))) return { injury: whole, lost: 0 };
  const limit = Math.max(0, Math.floor(Number(cap)));
  const kept = Math.min(whole, limit);
  return { injury: kept, lost: whole - kept };
}

/** Injury taken at a hit location outside a blow's pipeline. */
export interface LocatedInjuryInput {
  /**
   * With `type`, damage that already got past DR; without it, injury. A
   * whole number above zero.
   */
  amount: number;
  location: HitLocation;
  /** Given, the location's wounding modifier for it multiplies `amount`. */
  type?: DamageType;
  maxHp: number;
  limbs?: LimbCounts;
  tolerance?: InjuryTolerance;
  /** A registered location's wounding modifier, in place of its parent's. */
  woundingOverride?: number;
  /** A registered location's crippling threshold, in place of its parent's; null for none. */
  cripplingThreshold?: number | null;
}

export interface LocatedInjuryResult {
  /** HP (or FP, where the type costs fatigue) actually lost. */
  injury: number;
  /** The wounding modifier applied, or null where `amount` was injury already. */
  woundingModifier: number | null;
  /** Injury lost past what cripples a limb or extremity (Campaigns p. 421). */
  excessLost: number;
  crippled: boolean;
  costsFatigue: boolean;
}

/**
 * Injury at a hit location that no blow's pipeline worked out -- a burn that
 * goes on second by second, a module's effect (since API 1.148.0).
 *
 * Given a damage type, `amount` is damage past DR, and the location's wounding
 * modifier for that type multiplies it (Campaigns pp. 398-399): nothing more
 * comes off for the location's own DR. Without one, `amount` is injury as it
 * stands. Either way a limb or extremity keeps no more than cripples it, the
 * excess lost, and a wound over the threshold cripples the part it struck
 * (Campaigns pp. 420-421).
 */
export function injuryAtLocation(input: LocatedInjuryInput): LocatedInjuryResult {
  const amount = Math.max(0, Math.floor(Number(input.amount) || 0));
  if (input.type) {
    const result = computeInjury({
      basicDamage: amount,
      dr: 0,
      type: input.type,
      hitLocation: input.location,
      maxHp: input.maxHp,
      ...(input.limbs ? { limbs: input.limbs } : {}),
      ...(input.tolerance ? { tolerance: input.tolerance } : {}),
      ...(input.woundingOverride !== undefined ? { woundingOverride: input.woundingOverride } : {}),
      ...(input.cripplingThreshold !== undefined ? { cripplingThreshold: input.cripplingThreshold } : {}),
      ignoreLocationDr: true,
    });
    return {
      injury: result.injury,
      woundingModifier: result.woundingModifier,
      excessLost: result.excessLost,
      crippled: result.crippled,
      costsFatigue: result.costsFatigue,
    };
  }
  // Injury as given: only the part's threshold is left to apply.
  if (input.cripplingThreshold !== undefined) {
    const threshold = input.cripplingThreshold;
    if (threshold === null || amount <= threshold) {
      return { injury: amount, woundingModifier: null, excessLost: 0, crippled: false, costsFatigue: false };
    }
    const capped = Math.floor(threshold) + 1;
    return { injury: capped, woundingModifier: null, excessLost: amount - capped, crippled: true, costsFatigue: false };
  }
  const crippling = applyCrippling(amount, input.location, input.maxHp, input.limbs ?? {});
  return { ...crippling, woundingModifier: null, costsFatigue: false };
}
