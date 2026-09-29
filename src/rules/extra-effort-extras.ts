/**
 * Extra Effort Extras (Basic Set Revised pp. 571-572).
 *
 * The combat options and the cap of one offensive and one defensive a turn,
 * extra effort with powers, Godlike Extra Effort, Trading Fatigue for Skill
 * and for Resistance, Combining ST, and the marching figures of Humping,
 * Tramping, and Yomping. Pure functions; the wiring is in
 * `system/extra-effort.ts`.
 */

/** The combat options, each an "offensive" or a "defensive" one; every one costs 1 FP. */
export const COMBAT_EXTRAS = Object.freeze({
  flurry: "offensive",
  giantStep: "offensive",
  greatLunge: "offensive",
  heroicCharge: "offensive",
  mightyBlows: "offensive",
  feverishDefense: "defensive",
  rapidRecovery: "defensive",
} as const);

export type CombatExtra = keyof typeof COMBAT_EXTRAS;

/** What each combat option costs, in FP. */
export const COMBAT_EXTRA_FP = 1;

/**
 * Whether a set of options chosen in one turn keeps to the cap: no more than
 * one offensive and one defensive (p. 571). Returns the ones over the cap, in
 * the order given; empty when it holds.
 */
export function extrasOverCap(chosen: readonly CombatExtra[]): CombatExtra[] {
  const seen: Record<"offensive" | "defensive", boolean> = { offensive: false, defensive: false };
  const over: CombatExtra[] = [];
  for (const extra of chosen) {
    const kind = COMBAT_EXTRAS[extra];
    if (seen[kind]) over.push(extra);
    else seen[kind] = true;
  }
  return over;
}

/**
 * Giant Step's maneuvers (p. 571): an Attack or Defensive Attack, "but not an
 * All-Out Attack, Committed Attack, or Move and Attack, which already allow
 * extra movement". The old wording (p. 357) stays where the switch is off.
 */
export function giantStepAllowed(maneuver: string): boolean {
  return maneuver === "attack" || maneuver === "defensiveAttack";
}

/** Great Lunge's: Attack, Committed Attack or Move and Attack, in melee. */
export function greatLungeAllowed(maneuver: string): boolean {
  return maneuver === "attack" || maneuver === "committedAttack" || maneuver === "moveAndAttack";
}

/** Heroic Charge: Move and Attack only. */
export function heroicChargeAllowed(maneuver: string): boolean {
  return maneuver === "moveAndAttack";
}

/** Rapid Recovery: an unbalanced weapon that attacked, or any weapon after Move and Attack. */
export function rapidRecoveryAllowed(options: { unbalanced: boolean; maneuver: string }): boolean {
  return options.maneuver === "moveAndAttack" || (options.unbalanced && options.maneuver === "attack");
}

/** Great Lunge adds this much to the attack's reach, in yards (p. 571). */
export const GREAT_LUNGE_REACH = 1;

/** Giant Step buys this many extra steps (p. 571). */
export const GIANT_STEP_STEPS = 1;

/** Heroic Charge takes back the Move and Attack skill penalty (p. 571). */
export const HEROIC_CHARGE_TO_HIT = 4;

/**
 * Where a Giant Step's critical failure lands: "1 HP of injury to the leg,
 * not the arm" (p. 571).
 */
export const GIANT_STEP_CRITICAL_LIMB = "leg";

/** A Heroic Charge's defensive drawbacks still apply: -2 to rolls to avoid falling or tripping (p. 571). */
export const HEROIC_CHARGE_FALL_PENALTY = -2;

/**
 * The extras used so far in a round, kept as the round they were used in and
 * their keys. A record from another round is over and counts for nothing.
 */
export interface ExtrasRecord {
  round: string;
  extras: CombatExtra[];
}

/** The extras a record still holds in this round. */
export function extrasHeld(record: ExtrasRecord | null | undefined, round: string | null): CombatExtra[] {
  if (!record || round === null || record.round !== round || !Array.isArray(record.extras)) return [];
  return record.extras.filter((extra) => extra in COMBAT_EXTRAS);
}

/** The record once these extras are added to what the round already held. */
export function extrasAdded(record: ExtrasRecord | null | undefined, round: string, added: readonly CombatExtra[]): ExtrasRecord {
  const held = extrasHeld(record, round);
  return { round, extras: [...held, ...added.filter((extra) => !held.includes(extra))] };
}

/**
 * The options wanted that the cap of one offensive and one defensive a turn
 * would refuse, given what the round already holds (p. 571). Choosing again
 * an option already used this round is no second use of the cap.
 */
export function extrasRefused(held: readonly CombatExtra[], wanted: readonly CombatExtra[]): CombatExtra[] {
  const fresh = wanted.filter((extra) => !held.includes(extra));
  return extrasOverCap([...held, ...fresh]).filter((extra) => fresh.includes(extra));
}

/** The combat option an attack option's key stands for, or null: `gworld.giantStep` and the like. */
export function combatExtraOfKey(key: string): CombatExtra | null {
  const short = key.startsWith("gworld.") ? key.slice("gworld.".length) : key;
  return short in COMBAT_EXTRAS ? (short as CombatExtra) : null;
}

/** The most a powers' extra effort may add, as a percentage (p. 571). */
export const POWER_EFFORT_MAX_PERCENT = 100;

/**
 * The Will roll for extra effort with a power: -1 per 5% of increase or
 * fraction of it, at most 100%, +5 for strong emotion, plus the power's Talent,
 * and no penalty for missing FP (p. 571). Godlike Extra Effort ignores the cap.
 */
export function powerEffortTarget(options: {
  will: number;
  percentIncrease: number;
  motivated?: boolean;
  talent?: number;
  /** Godlike Extra Effort: the ceiling of 100% does not apply. */
  uncapped?: boolean;
}): number {
  const asked = Math.max(0, options.percentIncrease);
  const percent = options.uncapped ? asked : Math.min(POWER_EFFORT_MAX_PERCENT, asked);
  const penalty = percent === 0 ? 0 : Math.ceil(percent / 5);
  return options.will - penalty + (options.motivated ? 5 : 0) + Math.max(0, options.talent ?? 0);
}

/**
 * What one attempt costs (p. 572): a critical success is free, an instantaneous
 * ability is a flat 1 FP a use, and a maintained one 1 FP per roll, once a
 * minute. `fpSpent` is the Godlike multiple.
 */
export function powerEffortCost(options: { criticalSuccess: boolean; fpSpent?: number }): number {
  if (options.criticalSuccess) return 0;
  return Math.max(1, Math.floor(options.fpSpent ?? 1));
}

/** How many minutes a maintained ability's extra effort lasts between rolls. */
export const POWER_EFFORT_MINUTES = 1;

/**
 * Godlike Extra Effort (p. 572): the bonus effect multiplied by the FP spent,
 * with no maximum. A hero at Will-3 gets +15% for 1 FP and +150% for 10.
 */
export function godlikeEffect(bonusPercent: number, fpSpent: number): number {
  return Math.max(0, bonusPercent) * Math.max(1, Math.floor(fpSpent));
}

/** The most Trading Fatigue for Skill, or for Resistance, gives (p. 572). */
export const FATIGUE_TRADE_MAX = 4;

/** The bonus for FP traded for skill, 1 FP per +1 up to +4; the FP is the same number. */
export function fatigueForSkillBonus(fp: number): number {
  return Math.max(0, Math.min(FATIGUE_TRADE_MAX, Math.floor(fp)));
}

/** A group's Basic Lift is the sum of its members' (p. 572). */
export function combinedBasicLift(basicLifts: readonly number[]): number {
  return basicLifts.reduce((sum, bl) => sum + Math.max(0, bl), 0);
}

/** A group's effective ST: the square root of 5 x total BL, rounded up (p. 572). */
export function combinedStrength(basicLifts: readonly number[]): number {
  return Math.ceil(Math.sqrt(5 * combinedBasicLift(basicLifts)) - 1e-9);
}

/** Hours a day a group can march (p. 572): 8 unskilled, 12 if anybody has a suitable skill. */
export function marchingHours(skilled: boolean): number {
  return skilled ? 12 : 8;
}

/** A sustainable marching speed: half the encumbered Move, in miles an hour (p. 572). */
export function marchingSpeed(move: number): number {
  return Math.max(0, move) / 2;
}

/** Miles a day in ideal conditions per point of Move: 4 unskilled, 6 skilled (p. 572). */
export function marchingMilesPerMove(skilled: boolean): number {
  return marchingHours(skilled) / 2;
}

/** Skills that make a group "skilled" for marching, by name, as the book lists them. */
export const MARCHING_SKILLS: readonly string[] = ["Hiking", "Soldier", "Survival", "Professional Skill (Trail Guide)"];
