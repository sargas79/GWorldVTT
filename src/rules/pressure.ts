/**
 * Pressure, and the bends (GURPS Basic Set: Campaigns p. 435).
 *
 * "Adventurers are most likely to encounter extreme pressure in super-dense
 * atmospheres or deep underwater (where pressure increases by about 1
 * atmosphere per 33' of depth). Pressures in excess of your native pressure -
 * 1 atm., for a human - are not always immediately lethal, but present serious
 * risks."
 *
 * Two risks, and they arrive from opposite directions: pressure crushes you
 * while you are down there, and coming back up too fast is what gives you the
 * bends.
 */

import type { DiceAdds } from "./types.js";

/** "pressure increases by about 1 atmosphere per 33' of depth." */
export const FEET_PER_ATMOSPHERE = 33;

/** What a human breathes at sea level, and what "native pressure" means for one. */
export const NATIVE_PRESSURE = 1;

/** Levels of the Pressure Support advantage, which move both thresholds. */
export type PressureSupport = 0 | 1 | 2 | 3;

/** The pressure at a depth of water, in atmospheres, counting the air above it. */
export function pressureAtDepth(feet: number): number {
  return NATIVE_PRESSURE + Math.max(0, feet) / FEET_PER_ATMOSPHERE;
}

/**
 * The multiple of native pressure past which somebody may be crushed (p. 435).
 *
 * "Over 10 x native pressure: You may be crushed!... With Pressure Support 2,
 * read this as 'Over 100 x native pressure'. With Pressure Support 3, you are
 * immune to pressure." Null where nothing can crush them.
 */
export function crushingThreshold(support: PressureSupport): number | null {
  if (support >= 3) return null;
  return support === 2 ? 100 : 10;
}

/**
 * The roll against being crushed (p. 435).
 *
 * "On initial exposure and every minute thereafter, roll vs. HT at a basic +3,
 * but -1 per 10 x native pressure." Pressure Support 2 reads that as -1 per
 * 100 x instead.
 */
export function crushingTarget(options: {
  health: number;
  /** Pressure as a multiple of the victim's native pressure. */
  multiple: number;
  support?: PressureSupport;
}): number {
  const support = options.support ?? 0;
  const step = support === 2 ? 100 : 10;
  const per = Math.floor(Math.max(0, options.multiple) / step);
  return options.health + 3 - per;
}

/**
 * What failing that roll costs (p. 435).
 *
 * "If you fail, you suffer HP of injury equal to your margin of failure. If
 * your Size Modifier is +2 or more, multiply injury by SM."
 */
export function crushingInjury(options: { margin: number; sizeModifier?: number }): number {
  const hurt = Math.max(0, Math.abs(options.margin));
  const sm = options.sizeModifier ?? 0;
  return sm >= 2 ? hurt * sm : hurt;
}

/** "roll vs. HT at a basic +3", and again every minute down there. */
export const CRUSHING_INTERVAL_SECONDS = 60;

// ── the bends (p. 435) ──────────────────────────────────────────────────────

/**
 * The multiple of native pressure past which coming back up risks the bends
 * (p. 435).
 *
 * "You risk the bends if you return to normal pressure after experiencing
 * pressure greater than twice your native pressure (or 10 times native
 * pressure, with Pressure Support 1)." Two or three levels are immune.
 */
export function bendsThreshold(support: PressureSupport): number | null {
  if (support >= 2) return null;
  return support === 1 ? 10 : 2;
}

/**
 * How long a diver may stay at a pressure and still surface freely (p. 435).
 *
 * "at up to 2 atm. (about 33' underwater), a human can operate for any amount
 * of time... At up to 2.5 atm. (50' depth), a human can safely operate for up
 * to 80 minutes... at 4 atm. (100' depth), it's about 22 minutes; at 5.5+ atm.
 * (150' depth), there is no safe period."
 *
 * Infinity where the depth never needs decompressing, and zero where no amount
 * of time is safe.
 */
export function safeMinutesAt(atmospheres: number): number {
  if (atmospheres <= 2) return Infinity;
  if (atmospheres <= 2.5) return 80;
  if (atmospheres <= 4) return 22;
  if (atmospheres < 5.5) return 22;
  return 0;
}

/** Whether surfacing from here, after this long, risks the bends at all. */
export function risksBends(options: {
  atmospheres: number;
  minutes: number;
  support?: PressureSupport;
}): boolean {
  const threshold = bendsThreshold(options.support ?? 0);
  if (threshold === null) return false;
  if (options.atmospheres <= threshold) return false;
  return options.minutes > safeMinutesAt(options.atmospheres);
}

/** What surfacing too fast came to. */
export type BendsOutcome =
  /** "Critical success means no ill effects." */
  | "clear"
  /** "Success means severe joint pain, causing agony." */
  | "agony"
  /** "Failure means unconsciousness or painful paralysis." */
  | "collapse"
  /** "Critical failure results in painful death." */
  | "death";

/**
 * The roll for having decompressed too fast (p. 435).
 *
 * Note which way round this reads: a success still hurts. "Critical success
 * means no ill effects. Success means severe joint pain, causing agony... roll
 * vs. HT hourly to recover. Failure means unconsciousness or painful
 * paralysis... each failure causing 1d of injury."
 */
export function bendsOutcome(roll: {
  success: boolean;
  criticalSuccess: boolean;
  criticalFailure: boolean;
}): BendsOutcome {
  if (roll.criticalSuccess) return "clear";
  if (roll.criticalFailure) return "death";
  return roll.success ? "agony" : "collapse";
}

/** "roll vs. HT hourly to recover", and each failed one costs a die. */
export const BENDS_RECOVERY_HOURS = 1;
export const BENDS_FAILED_RECOVERY_INJURY: DiceAdds = { dice: 1, adds: 0 };

/**
 * What recompression buys (p. 435).
 *
 * "Recompression to the highest pressure experienced lets you roll at HT+4
 * every five minutes to recover from all effects short of death."
 */
export const RECOMPRESSION_BONUS = 4;
export const RECOMPRESSION_MINUTES = 5;
