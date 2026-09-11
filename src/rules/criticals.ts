/**
 * What a critical hit or miss actually does
 * (GURPS Basic Set: Campaigns p. 381; the four tables on pp. 556-557).
 *
 * A critical was being named and nothing more: the card said "critical
 * success" and left the table to decide what that meant.
 *
 * Each row is recorded as the mechanical effect it has -- a damage multiplier,
 * a halved DR, a dropped weapon -- rather than as the book's own words, and
 * the effects the tables leave to the GM are marked as such rather than
 * invented. The machine-readable part is what the system can apply on its own;
 * the rest is named so the table knows what to read.
 */

/** How a critical changes the damage it does. */
export interface CriticalDamage {
  /** Multiplier on basic damage, not on injury. */
  multiplier?: number;
  /** The blow does maximum normal damage instead of what was rolled. */
  maximum?: boolean;
  /** The target's DR is halved, after any armour divisor. */
  halfDr?: "roundDown" | "roundUp";
  /** DR does not apply at all. */
  ignoreDr?: boolean;
  /** Anything that penetrates counts as a major wound, however small. */
  majorWound?: boolean;
  /** Shock is multiplied, past the usual -4 floor. */
  shockMultiplier?: number;
}

/** One row of a critical table. */
export interface CriticalEntry {
  /** The 3d rolls this row covers. */
  rolls: readonly number[];
  /** Names the effect; localized as `GWORLD.Critical.<effect>`. */
  effect: string;
  damage?: CriticalDamage;
  /** True where the book leaves the detail to the GM or to a further roll. */
  gmDecides?: boolean;
}

/** The largest shock penalty a doubled critical shock can reach (p. 556). */
export const MAX_DOUBLED_SHOCK = -8;

/**
 * The Critical Hit Table (p. 556).
 *
 * "All doublings or triplings of damage refer to basic damage (not injury). In
 * all cases, the target gets no active defense against the attack."
 */
export const CRITICAL_HIT: readonly CriticalEntry[] = [
  { rolls: [3], effect: "tripleDamage", damage: { multiplier: 3 } },
  { rolls: [4], effect: "halfDrDown", damage: { halfDr: "roundDown" } },
  { rolls: [5], effect: "doubleDamage", damage: { multiplier: 2 } },
  { rolls: [6], effect: "maximumDamage", damage: { maximum: true } },
  { rolls: [7], effect: "majorWound", damage: { majorWound: true } },
  // Double shock to a maximum of -8, and a limb struck is crippled as well --
  // a funny-bone injury that wears off, which is the GM's to time.
  { rolls: [8], effect: "doubleShock", damage: { shockMultiplier: 2 }, gmDecides: true },
  { rolls: [9, 10, 11], effect: "normal" },
  { rolls: [12], effect: "dropsHeld" },
  { rolls: [13, 14], effect: "majorWound", damage: { majorWound: true } },
  { rolls: [15], effect: "maximumDamage", damage: { maximum: true } },
  { rolls: [16], effect: "doubleDamage", damage: { multiplier: 2 } },
  { rolls: [17], effect: "halfDrDown", damage: { halfDr: "roundDown" } },
  { rolls: [18], effect: "tripleDamage", damage: { multiplier: 3 } },
];

/**
 * The Critical Head Blow Table (p. 556), read instead of the above for a
 * critical hit to the face, skull or eye. No active defense against any of it
 * either.
 */
export const CRITICAL_HEAD_BLOW: readonly CriticalEntry[] = [
  { rolls: [3], effect: "maxAndIgnoreDr", damage: { maximum: true, ignoreDr: true } },
  { rolls: [4, 5], effect: "halfDrUpMajor", damage: { halfDr: "roundUp", majorWound: true } },
  // Treated as an eye hit even where the eye could not have been targeted --
  // and as a 4 where an eye hit is impossible, which needs the GM.
  { rolls: [6, 7], effect: "treatAsEye", gmDecides: true },
  { rolls: [8], effect: "offBalance" },
  { rolls: [9, 10, 11], effect: "normal" },
  { rolls: [12, 13], effect: "deafenedOrScarred", gmDecides: true },
  { rolls: [14], effect: "dropsWeapon" },
  { rolls: [15], effect: "maximumDamage", damage: { maximum: true } },
  { rolls: [16], effect: "doubleDamage", damage: { multiplier: 2 } },
  { rolls: [17], effect: "halfDrUp", damage: { halfDr: "roundUp" } },
  { rolls: [18], effect: "tripleDamage", damage: { multiplier: 3 } },
];

/**
 * The Critical Miss Table (p. 556), for an armed attack or parry.
 *
 * Several rows redirect to another row -- 12 is "as 8", 13 is "as 7", 17 and
 * 18 are "see 3" -- and are recorded as the effect they land on rather than as
 * a pointer, since the pointer is only how the book saves space.
 */
export const CRITICAL_MISS: readonly CriticalEntry[] = [
  // A resistant weapon rolls again, and only a second break really breaks it.
  { rolls: [3, 4], effect: "weaponBreaks", gmDecides: true },
  { rolls: [5], effect: "hitYourself", gmDecides: true },
  { rolls: [6], effect: "hitYourselfHalf", gmDecides: true },
  { rolls: [7], effect: "loseBalance" },
  { rolls: [8], effect: "weaponTurns" },
  { rolls: [9, 10, 11], effect: "dropWeapon" },
  { rolls: [12], effect: "weaponTurns" },
  { rolls: [13], effect: "loseBalance" },
  // Swinging, the weapon flies; thrusting, shooting or parrying, it is dropped.
  { rolls: [14], effect: "weaponFlies", gmDecides: true },
  { rolls: [15], effect: "strainShoulder" },
  { rolls: [16], effect: "fallDown" },
  { rolls: [17, 18], effect: "weaponBreaks", gmDecides: true },
];

/**
 * The Unarmed Critical Miss Table (p. 557), for unarmed attacks and parries --
 * bites, claws, grapples, head butts, kicks, punches and slams.
 */
export const CRITICAL_MISS_UNARMED: readonly CriticalEntry[] = [
  { rolls: [3], effect: "knockYourselfOut", gmDecides: true },
  { rolls: [4], effect: "strainLimb" },
  { rolls: [5], effect: "hitSolidObject", gmDecides: true },
  { rolls: [6], effect: "hitSolidObjectHalf", gmDecides: true },
  { rolls: [7], effect: "stumble" },
  { rolls: [8], effect: "fallDown" },
  { rolls: [9, 10, 11], effect: "loseBalance" },
  { rolls: [12], effect: "trip" },
  { rolls: [13], effect: "dropGuard" },
  { rolls: [14], effect: "stumble" },
  { rolls: [15], effect: "tearMuscle" },
  { rolls: [16], effect: "hitSolidObject", gmDecides: true },
  { rolls: [17], effect: "strainLimb" },
  { rolls: [18], effect: "knockYourselfOut", gmDecides: true },
];

/** Which table a critical is read on. */
export type CriticalTable = "hit" | "headBlow" | "miss" | "missUnarmed";

const TABLES: Record<CriticalTable, readonly CriticalEntry[]> = {
  hit: CRITICAL_HIT,
  headBlow: CRITICAL_HEAD_BLOW,
  miss: CRITICAL_MISS,
  missUnarmed: CRITICAL_MISS_UNARMED,
};

/** Every row of one table, for showing it. */
export function criticalTable(table: CriticalTable): readonly CriticalEntry[] {
  return TABLES[table];
}

/**
 * The row a 3d roll lands on.
 *
 * Every table covers 3 to 18 with no gaps, so a roll in range always has one;
 * anything outside is clamped, because a critical that produced no result at
 * all would be harder to notice than a wrong one.
 */
export function criticalEntry(table: CriticalTable, roll: number): CriticalEntry {
  const rows = TABLES[table];
  const clamped = Math.min(18, Math.max(3, Math.round(roll)));
  return rows.find((row) => row.rolls.includes(clamped)) ?? rows[rows.length - 1]!;
}

/** The head locations that send a critical hit to the head blow table. */
const HEAD_LOCATIONS = new Set(["skull", "face", "eye"]);

/** Which table a critical hit is read on, given where it landed. */
export function criticalHitTableFor(hitLocation: string | undefined): CriticalTable {
  return hitLocation !== undefined && HEAD_LOCATIONS.has(hitLocation) ? "headBlow" : "hit";
}

/** Which miss table applies: unarmed attacks and parries read their own. */
export function criticalMissTableFor(unarmed: boolean): CriticalTable {
  return unarmed ? "missUnarmed" : "miss";
}

/**
 * Basic damage after a critical's multiplier or maximum.
 *
 * "All doublings or triplings of damage refer to basic damage (not injury)",
 * so this happens to the roll and the wounding modifier is applied after, as
 * it always is.
 */
export function criticalBasicDamage(options: {
  rolled: number;
  /** The most the dice could have come up, for the rows that take it. */
  maximum: number;
  damage?: CriticalDamage;
}): number {
  const { rolled, maximum, damage } = options;
  const base = damage?.maximum ? maximum : rolled;
  return Math.max(0, Math.floor(base * (damage?.multiplier ?? 1)));
}

/**
 * A target's DR after a critical halves or ignores it. The book halves what is
 * left "after applying any armor divisors", so this comes last.
 */
export function criticalDr(dr: number, damage?: CriticalDamage): number {
  if (damage?.ignoreDr) return 0;
  if (!damage?.halfDr) return dr;
  return damage.halfDr === "roundUp" ? Math.ceil(dr / 2) : Math.floor(dr / 2);
}

/**
 * Shock after a critical multiplies it (p. 556).
 *
 * Ordinary shock stops at -4; the doubled shock a critical inflicts stops at
 * -8 instead, so the usual cap cannot simply be applied twice.
 */
export function criticalShock(shock: number, damage?: CriticalDamage): number {
  const multiplier = damage?.shockMultiplier ?? 1;
  if (multiplier <= 1 || shock >= 0) return shock;
  return Math.max(MAX_DOUBLED_SHOCK, shock * multiplier);
}

/**
 * The skills that mean an attack was made with the body rather than a weapon
 * (GURPS Basic Set: Characters pp. 182-228).
 *
 * The unarmed critical miss table covers "bites, claws, grapples, head butts,
 * kicks, punches, slams, etc.", which is not a property a weapon record
 * carries -- but the skill it is used with says the same thing.
 */
const UNARMED_COMBAT_SKILLS = new Set([
  "boxing",
  "brawling",
  "judo",
  "karate",
  "sumo wrestling",
  "wrestling",
]);

/** Whether an attack made with this skill reads the unarmed miss table. */
export function isUnarmedSkill(skill: string | undefined): boolean {
  if (!skill) return false;
  // A technique is written "Kicking (Karate)", and is as unarmed as its skill.
  const base = skill.replace(/\s*\(.*$/, "").trim().toLowerCase();
  return UNARMED_COMBAT_SKILLS.has(base);
}
