/**
 * The seven techniques the Revised edition adds (Basic Set Revised
 * pp. 333-334): Acrobatic Stand, Armed Grapple, Close Combat, Evade, Head Butt,
 * Stamp Kick and Wrench Arm/Leg.
 *
 * Pure figures only; the sheet, the roll and the damage card read them.
 */

import type { DiceAdds } from "./types.js";
import { addModifier } from "./dice.js";

// ── Acrobatic Stand ─────────────────────────────────────────────────────────

/** Where the fighter starts. */
export type StandFrom = "lying" | "sitting" | "crawling" | "kneeling";

/** What an Acrobatic Stand roll does. */
export type StandOutcome =
  | "standsAsStep"        // on your feet, and it cost no maneuver
  | "standsAsManeuver"    // on your feet as one Change Posture
  | "sits"                // a failed roll from lying: sitting up
  | "staysDown"           // a critical failure from lying: the turn wasted
  | "falls";              // a critical failure from sitting or crawling: down again

/**
 * What the roll gets (p. 333). From lying: success is one Change Posture,
 * critical success a step, failure sitting, critical failure staying down.
 * From crawling or sitting the success is a step; failure stands as a Change
 * Posture; a critical failure falls down.
 */
export function acrobaticStand(options: {
  from: StandFrom;
  success: boolean;
  critical: boolean;
}): StandOutcome {
  const { from, success, critical } = options;
  if (from === "lying") {
    if (success) return critical ? "standsAsStep" : "standsAsManeuver";
    return critical ? "staysDown" : "sits";
  }
  if (success) return "standsAsStep";
  return critical ? "falls" : "standsAsManeuver";
}

/** "A penalty equal to encumbrance level" (p. 333). */
export function acrobaticStandModifier(encumbranceLevel: number): number {
  return 0 - Math.max(0, Math.floor(Number(encumbranceLevel) || 0)) || 0;
}

// ── Armed Grapple ───────────────────────────────────────────────────────────

/** "Roll against weapon skill at -2" (p. 334); a cloak uses its skill unpenalized. */
export const ARMED_GRAPPLE_WEAPON_PENALTY = -2;

/** What an armed grapple asks and costs. */
export function armedGrapple(options: {
  cloak: boolean;
  /** True where the weapon is one-handed and not yet gripped in both hands. */
  oneHanded: boolean;
  bothHandsOnIt: boolean;
}): { penalty: number; needsReady: boolean; weaponBusy: true; followUps: readonly string[] } {
  return {
    penalty: options.cloak ? 0 : ARMED_GRAPPLE_WEAPON_PENALTY,
    // A one-handed weapon other than a cloak needs both hands first, by Ready.
    needsReady: !options.cloak && options.oneHanded && !options.bothHandsOnIt,
    // "you can neither attack nor defend with it" while it holds the foe.
    weaponBusy: true,
    followUps: ["takedown", "pin", "choke", "armLock"],
  };
}

// ── Close Combat (weapons without a C reach) ────────────────────────────────

/** The longest yard of reach a weapon lists, or 0 for a C-only weapon; "1,2*" is 2. */
export function longestReach(reach: string): number {
  const found = String(reach ?? "").match(/\d+/g);
  return found ? Math.max(...found.map((n) => Number(n))) : 0;
}

/**
 * The skill penalty for fighting in close combat with a weapon that lacks a C
 * reach (p. 334): -4 for reach 1, -8 for 2, -12 for 3 (its longest reach),
 * half of it bought off by the technique. `levels` are the levels bought.
 */
export function closeCombatPenalty(reach: string, levelsBought = 0): number {
  const yards = Math.min(3, longestReach(reach));
  if (yards <= 0) return 0;
  const full = 4 * yards;
  const boughtOff = Math.min(Math.max(0, Math.floor(levelsBought)), full / 2);
  return -(full - boughtOff);
}

/** Swing damage is -1 per yard of reach; thrusting attacks are normal (p. 334). */
export function closeCombatDamageModifier(reach: string, swung: boolean): number {
  return swung ? -longestReach(reach) : 0;
}

/**
 * A ranged weapon's Bulk in close combat with the technique: the levels bought
 * buy off the penalty, the entire Bulk at most (p. 334).
 */
export function closeCombatBulk(bulk: number, levelsBought: number): number {
  const rating = Math.min(0, bulk);
  return Math.min(0, rating + Math.max(0, Math.floor(levelsBought)));
}

// ── Evade ───────────────────────────────────────────────────────────────────

/** "Cannot exceed prerequisite skill+5" (p. 334). */
export const EVADE_MAX_OVER_PREREQUISITE = 5;

/**
 * What the evader rolls against in the contest: the technique replaces DX
 * (p. 334); a fighter whose technique is the worse of the two keeps DX.
 */
export function evadeBase(dx: number, techniqueLevel: number | null): number {
  return techniqueLevel === null ? dx : Math.max(dx, techniqueLevel);
}

// ── Head Butt ───────────────────────────────────────────────────────────────

/** The hit locations a head butt is aimed at, with their penalties (p. 334). */
export const HEAD_BUTT_TARGETS: Readonly<Record<string, number>> = { face: -5, skull: -7 };

/** Damage is thrust-1 crushing; without Brawling or Karate it is thrust-2, at DX-2. */
export function headButtDamage(thrust: DiceAdds, options: { trained: boolean; helm: boolean; skillBonus?: number }): DiceAdds {
  const base = options.trained ? -1 : -2;
  return addModifier(thrust, base + (options.helm ? 1 : 0) + (options.trained ? options.skillBonus ?? 0 : 0));
}

/** The skill of an untrained head butt: DX-2 (p. 334). */
export const HEAD_BUTT_UNTRAINED_PENALTY = -2;

/**
 * Where a head butt's self-inflicted injury lands (p. 334): the face when the
 * victim parried; the skull against DR 3+ (the skull's own DR 2 protects, and
 * a rigid helm adds its DR).
 */
export function headButtSelfInjury(options: {
  parried: boolean;
  targetDr: number;
  damage: number;
  skullDr: number;
  faceDr: number;
  rigidHelmDr?: number;
}): { location: "face" | "skull" | null; injury: number } {
  const helm = Math.max(0, options.rigidHelmDr ?? 0);
  if (options.parried) {
    return { location: "face", injury: Math.max(0, options.damage - Math.max(0, options.faceDr)) };
  }
  if (options.targetDr >= 3) {
    return { location: "skull", injury: Math.max(0, options.damage - Math.max(0, options.skullDr) - helm) };
  }
  return { location: null, injury: 0 };
}

// ── Stamp Kick ──────────────────────────────────────────────────────────────

/** "Thrust+1, plus your Brawling or Karate bonus" (p. 334). */
export function stampKickDamage(thrust: DiceAdds, skillBonus: number): DiceAdds {
  return addModifier(thrust, 1 + Math.max(0, skillBonus));
}

/** A stamp kick goes only at a lying foe, or a standing foe's foot or leg (p. 334). */
export function stampKickTarget(options: { foePosture: string; location?: string }): boolean {
  if (options.foePosture === "lying") return true;
  const where = String(options.location ?? "").toLowerCase();
  return ["foot", "leg", "hand-foot"].includes(where) || /foot|leg/.test(where);
}

/** A missed stamp kick stomps the ground: a DX roll or no retreat next turn (p. 334). */
export function stampKickMiss(dxRollSucceeded: boolean): { cannotRetreat: boolean } {
  return { cannotRetreat: !dxRollSucceeded };
}

// ── Wrench Arm / Wrench Leg ─────────────────────────────────────────────────

/** "Default: ST-4; cannot exceed ST+3" (p. 334). */
export const WRENCH_DEFAULT = -4;
export const WRENCH_MAX_OVER_ST = 3;

/** The ST a wrench technique is bought up to, capped at ST+3. */
export function wrenchLevel(st: number, levelsBought: number): number {
  return st + Math.min(WRENCH_MAX_OVER_ST, WRENCH_DEFAULT + Math.max(0, Math.floor(levelsBought)));
}
