/**
 * Optional rules for ranged combat (Basic Set Revised pp. 576-577, Addendum 4).
 *
 * Close-Contact Shots, Hitting 'Em Where It Hurts (partial coverage),
 * Non-Combat Bonuses, Restricted Dodge Against Firearms, the tricky shooting
 * options, Simplified Range and the large-target wounding table. Each is
 * pure: the system reads the switches and the dialog, these do the sums.
 */

import type { DamageType } from "./types.js";

// ---------------------------------------------------------------- Close-Contact Shots

export type ContactKind = "none" | "touching" | "pressed";

export interface CloseContactInput {
  contact: ContactKind;
  /** All-Out Attack (Determined): +4 to hit instead of +1 when touching. */
  allOutDetermined: boolean;
  /** The gun was held against the victim for a turn or more (treated as Evaluate). */
  braced: boolean;
  /** Standing behind a target who cannot resist: no Bulk penalty. */
  unresisting: boolean;
}

export interface CloseContactResult {
  /** To hit, over what All-Out Attack would already give (+1 is added by the maneuver itself). */
  toHit: number;
  /** The extra over the ordinary +1 of All-Out Attack (Determined): +3. */
  allOutExtra: number;
  pressed: number;
  braced: number;
  /** Acc, sights and aiming bonuses are all lost. */
  noAimBonuses: boolean;
  /** The target may parry a touching or pressed gun. */
  targetMayParry: boolean;
  /** The foe's bonus to dodge or parry a pressed gun. */
  targetDefenseBonus: number;
  /** A pressed gun cancels the -2 of a "runaround" attack: the foe defends at no penalty. */
  cancelsRunaround: boolean;
  bulkApplies: boolean;
}

/** Close-Contact Shots (p. 576). */
export function closeContactShot(input: CloseContactInput): CloseContactResult {
  const on = input.contact !== "none";
  const allOutExtra = on && input.allOutDetermined ? 3 : 0;
  const pressed = input.contact === "pressed" ? 4 : 0;
  const braced = on && input.braced ? 1 : 0;
  return {
    toHit: allOutExtra + pressed + braced,
    allOutExtra,
    pressed,
    braced,
    noAimBonuses: on,
    targetMayParry: on,
    targetDefenseBonus: input.contact === "pressed" ? 2 : 0,
    cancelsRunaround: input.contact === "pressed",
    bulkApplies: !(on && input.unresisting),
  };
}

// ---------------------------------------------------------------- Non-Combat Bonuses

export interface NonCombatInput {
  noRiskToSelf: boolean;
  noRiskToOthers: boolean;
  noStake: boolean;
  /** 0 to 4: +1 for a typical outdoor range, +4 for a perfectly lit indoor one. */
  environment: number;
  rangeAndSpeedKnown: boolean;
  /** Shots at people never get the psychological-pressure bonuses. */
  targetIsPerson: boolean;
}

export const NON_COMBAT_MAX = 10;

/** Non-Combat Bonuses (p. 576): at most +10 in all. */
export function nonCombatBonus(input: NonCombatInput): number {
  const pressure = input.targetIsPerson
    ? 0
    : (input.noRiskToSelf ? 1 : 0) + (input.noRiskToOthers ? 1 : 0) + (input.noStake ? 1 : 0);
  const environment = Math.max(0, Math.min(4, Math.trunc(input.environment) || 0));
  const known = input.rangeAndSpeedKnown ? 3 : 0;
  return Math.min(NON_COMBAT_MAX, pressure + environment + known);
}

// ---------------------------------------------------------------- Hitting 'Em Where It Hurts

/** Coverage is n in 6; several items add, to at most 6. */
export function combinedCoverage(values: readonly number[]): number {
  const sum = values.reduce((total, value) => total + Math.max(0, Math.trunc(Number(value) || 0)), 0);
  return Math.min(6, sum);
}

/** Whether DR protects: roll 1d, n or less. Full coverage (6) always does. */
export function coverageProtects(coverage: number, roll: number): boolean {
  return roll <= Math.min(6, Math.max(0, coverage));
}

/**
 * The penalty for striking around partial armour, over that for the location:
 * -1 for 1/6 or 2/6, -2 for 3/6, -3 for 4/6, -4 for 5/6. Full coverage uses
 * Targeting Chinks in Armor (p. 400) instead, so this is 0 for 6.
 */
export function strikeAroundPenalty(coverage: number): number {
  const n = Math.min(6, Math.max(0, Math.trunc(coverage) || 0));
  if (n <= 0 || n >= 6) return 0;
  if (n <= 2) return -1;
  return -(n - 1);
}

// ---------------------------------------------------------------- Restricted Dodge

/** Maneuvers on which evasive movement may be declared. */
export const EVASIVE_MANEUVERS: readonly string[] = [
  "allOutDefense", "attack", "changePosture", "defensiveAttack", "feint", "move", "moveAndAttack",
];

export interface EvasiveDeclaration {
  /** The shooter's actor id (or token id); null when none was declared. */
  shooter: string | null;
  maneuver: string;
  acrobaticRolledOnTurn: boolean;
  droppedProneAtEnd: boolean;
}

/** Whether evasive movement may be declared on this maneuver. */
export function evasiveManeuverAllowed(maneuver: string): boolean {
  return EVASIVE_MANEUVERS.includes(maneuver);
}

/**
 * Whether an attack is a firearm's, which the restricted-dodge rule covers:
 * bullets and beams, the weapons "You cannot block" (Campaigns p. 375).
 */
export function firearmAttack(skill: string | undefined): boolean {
  const base = String(skill ?? "").replace(/\s*\(.*$/, "").trim().toLowerCase();
  return ["guns", "beam weapons", "gunner"].includes(base);
}

/** Whether a fighter may dodge an attack by this shooter: only the one declared. */
export function mayDodgeFirearm(declared: EvasiveDeclaration | null, shooter: string): boolean {
  return !!declared && declared.shooter === shooter && EVASIVE_MANEUVERS.includes(declared.maneuver);
}

/** Acrobatic Dodge and Dodge and Drop count only if done on the fighter's own turn. */
export function evasiveBonuses(declared: EvasiveDeclaration | null): { acrobatic: boolean; dodgeAndDrop: boolean } {
  return { acrobatic: !!declared?.acrobaticRolledOnTurn, dodgeAndDrop: !!declared?.droppedProneAtEnd };
}

// ---------------------------------------------------------------- Tricky Shooting

/** Ranged Rapid Strike: two targets at -6 with a RoF 2+ weapon; no Dual-Weapon Attack. */
export const RANGED_RAPID_STRIKE_PENALTY = -6;

export function rangedRapidStrikeAllowed(rateOfFire: number, dualWeapon: boolean): boolean {
  return rateOfFire >= 2 && !dualWeapon;
}

/**
 * The shots a Ranged Rapid Strike gives each of its two targets: the shooter
 * names this target's share, the other gets the rest, and neither may be
 * left with none. Null where the weapon's RoF cannot be split so.
 */
export function rapidStrikeShare(rateOfFire: number, here: number): { here: number; other: number } | null {
  const split = splitRateOfFire(rateOfFire, here);
  return split ? { here: split[0], other: split[1] } : null;
}

/** Splitting RoF between two targets: each gets at least 1 shot; the rest as chosen. */
export function splitRateOfFire(rateOfFire: number, first: number): [number, number] | null {
  if (rateOfFire < 2) return null;
  const a = Math.trunc(first);
  const b = rateOfFire - a;
  if (a < 1 || b < 1) return null;
  return [a, b];
}

// ---------------------------------------------------------------- Simplified Range

export type RangeBand = "close" | "short" | "medium" | "long" | "extreme";

export const RANGE_BANDS: readonly { band: RangeBand; penalty: number; max: number }[] = [
  { band: "close", penalty: 0, max: 5 },
  { band: "short", penalty: -3, max: 20 },
  { band: "medium", penalty: -7, max: 100 },
  { band: "long", penalty: -11, max: 500 },
  { band: "extreme", penalty: -15, max: Number.POSITIVE_INFINITY },
];

/** The band a range in yards falls in. */
export function bandForYards(yards: number): RangeBand {
  const y = Math.max(0, Number(yards) || 0);
  return RANGE_BANDS.find((row) => y <= row.max)?.band ?? "extreme";
}

export function bandPenalty(band: RangeBand): number {
  return RANGE_BANDS.find((row) => row.band === band)?.penalty ?? 0;
}

/** A Move or Move and Attack at Close or Short shifts a band; Medium and beyond stay put. */
export function shiftBand(band: RangeBand, direction: "closer" | "farther"): RangeBand {
  if (band !== "close" && band !== "short") return band;
  if (band === "close") return direction === "farther" ? "short" : "close";
  return direction === "closer" ? "close" : "short";
}

// ---------------------------------------------------------------- Large targets

/** Rows by SM: index 0 is "up to +4", then +5-6, +7-8, +9-10, +11-12, +13 or more. */
const LARGE_ROWS: readonly Partial<Record<DamageType, number>>[] = [
  { "pi-": 1 / 5, pi: 1 / 3, "pi+": 1 / 2, "pi++": 1, imp: 1 },
  { "pi-": 1 / 10, pi: 1 / 5, "pi+": 1 / 3, "pi++": 1 / 2, imp: 1 / 2 },
  { "pi-": 1 / 20, pi: 1 / 10, "pi+": 1 / 5, "pi++": 1 / 3, imp: 1 / 3 },
  { "pi-": 1 / 50, pi: 1 / 20, "pi+": 1 / 10, "pi++": 1 / 5, imp: 1 / 5 },
  { "pi-": 1 / 100, pi: 1 / 50, "pi+": 1 / 20, "pi++": 1 / 10, imp: 1 / 10 },
  { "pi-": 1 / 200, pi: 1 / 100, "pi+": 1 / 50, "pi++": 1 / 20, imp: 1 / 20 },
];

/** The row an SM reads: 0 up to +4, 1 for +5-6, ... 5 for +13 or more. */
export function largeTargetRow(sm: number): number {
  const s = Math.trunc(Number(sm) || 0);
  if (s <= 4) return 0;
  return Math.min(5, Math.floor((s - 5) / 2) + 1);
}

/**
 * The wounding modifier of a piercing or impaling type against an Unliving or
 * Homogenous target of this SM (p. 577); Homogenous shifts down a row. Null
 * for other damage types.
 */
export function largeTargetWounding(
  type: DamageType,
  sm: number,
  homogenous: boolean,
): number | null {
  const row = Math.min(5, largeTargetRow(sm) + (homogenous ? 1 : 0));
  return LARGE_ROWS[row]?.[type] ?? null;
}
