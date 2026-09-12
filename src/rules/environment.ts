/**
 * The world wearing you down (GURPS Basic Set: Campaigns pp. 426-435).
 *
 * Heat, cold, hunger and thirst all work the same way and all cost the same
 * thing: fatigue, a point at a time, on a clock. None of it kills anybody
 * quickly, which is exactly why it needs writing down -- a party three days
 * into a desert has lost track of it, and the GM is the one holding four
 * separate counters.
 *
 * The book opens the food section by saying the GM should feel free to ignore
 * the whole thing. That is what makes these optional rules rather than missing
 * ones.
 */

import { penalty, totalPenalty } from "./modifiers.js";

/** Meals a human needs in a day (p. 426). */
export const MEALS_PER_DAY = 3;

/** Fatigue lost per missed meal (p. 426). */
export function starvationFatigue(mealsMissed: number): number {
  return Math.max(0, Math.floor(mealsMissed));
}

/**
 * Meals made up by a day of rest (p. 426).
 *
 * "You can only recover 'starvation' fatigue with a day of rest: no fighting or
 * travel, and three full meals. Each day of rest makes up for three skipped
 * meals."
 */
export function mealsRecoveredByRest(days = 1): number {
  return MEALS_PER_DAY * Math.max(0, Math.floor(days));
}

/** How thirsty the climate makes you (p. 426). */
export type Climate = "temperate" | "hot" | "desert";

/** Quarts of water a day the climate demands (p. 426). */
export function waterNeeded(climate: Climate): number {
  return climate === "desert" ? 5 : climate === "hot" ? 3 : 2;
}

/** Hours between the fatigue losses of going short of water. */
export const DEHYDRATION_HOURS = 8;

export interface Dehydration {
  /** Fatigue lost over the day. */
  fpLost: number;
  /** Hit points lost, which only happens below a quart a day. */
  hpLost: number;
}

/**
 * A day of drinking too little (p. 426).
 *
 * "If you get less than you need, you lose 1 FP every eight hours. If you drink
 * less than a quart a day, you lose an extra 1 FP and 1 HP per day."
 */
export function dehydrationForDay(options: {
  climate: Climate;
  /** Quarts actually drunk that day. */
  quartsDrunk: number;
}): Dehydration {
  const needed = waterNeeded(options.climate);
  const drunk = Math.max(0, options.quartsDrunk);
  if (drunk >= needed) return { fpLost: 0, hpLost: 0 };

  const perDay = 24 / DEHYDRATION_HOURS;
  const parched = drunk < 1;

  return { fpLost: perDay + (parched ? 1 : 0), hpLost: parched ? 1 : 0 };
}

// ── cold (p. 430) ───────────────────────────────────────────────────────────

/** What somebody is wearing against the cold (p. 430). */
export type ColdClothing = "light" | "winter" | "arctic" | "heatedSuit";

const COLD_CLOTHING: Record<ColdClothing, number> = {
  light: -5,
  winter: 0,
  arctic: 5,
  heatedSuit: 10,
};

/** The temperature below which an ordinary human starts rolling (p. 430). */
export const FREEZING_F = 35;

/**
 * How often the cold asks for a roll, in minutes (p. 430).
 *
 * "every 30 minutes in normal freezing weather... In light wind (10+ mph), roll
 * every 15 minutes. In strong wind (30+ mph), roll every 10 minutes."
 */
export function coldInterval(windMph: number): number {
  const wind = Math.max(0, windMph);
  if (wind >= 30) return 10;
  if (wind >= 10) return 15;
  return 30;
}

/**
 * The modifier to the roll against the cold (p. 430).
 *
 * The roll itself is "a HT or HT-based Survival (Arctic) roll, whichever is
 * better", which is the caller's to pick.
 */
export function coldModifier(options: {
  clothing: ColdClothing;
  wetClothes?: boolean;
  /** Effective temperature in Fahrenheit, wind chill included. */
  temperatureF: number;
  /**
   * Temperature Tolerance on the cold side (Characters p. 93): degrees the
   * comfort zone reaches below where a human's does, which the weather has to
   * get through before it counts.
   */
  toleranceF?: number;
}): number {
  // Clothing can be a bonus, so this half is a plain sum rather than a penalty.
  let modifier = COLD_CLOTHING[options.clothing];
  if (options.wetClothes) modifier -= 5;

  // "-1 per every 10 degrees below 0F effective temperature" -- measured from
  // the bottom of the comfort zone, which Temperature Tolerance lowers.
  const felt = options.temperatureF + Math.max(0, options.toleranceF ?? 0);
  const belowZero = felt < 0 ? Math.floor(-felt / 10) : 0;

  return modifier + penalty(belowZero);
}

// ── heat (p. 434) ───────────────────────────────────────────────────────────

/** The temperature above which an active human starts rolling (p. 434). */
export const SWELTERING_F = 80;

/**
 * The modifier to the roll against the heat (p. 434).
 *
 * "A penalty equal to your encumbrance level (-1 for Light, -2 for Medium, and
 * so on); -1 per extra 10 degrees heat."
 */
export function heatModifier(options: {
  /** 0 for None through 4 for Extra-Heavy. */
  encumbranceLevel?: number;
  temperatureF: number;
  /** Temperature Tolerance on the hot side (Characters p. 93), in degrees. */
  toleranceF?: number;
}): number {
  const encumbrance = Math.max(0, options.encumbranceLevel ?? 0);
  const over = Math.max(0, options.temperatureF - Math.max(0, options.toleranceF ?? 0) - SWELTERING_F);
  return totalPenalty(encumbrance, Math.floor(over / 10));
}

/**
 * The extra fatigue the heat adds to any other exertion (p. 434).
 *
 * "at temperatures up to 30 degrees over your comfort zone (91-120 for humans),
 * you lose an extra 1 FP whenever you lose FP to exertion or dehydration. At
 * temperatures up to 60 degrees over (121-150), this becomes an extra 2 FP."
 */
export function heatSurcharge(temperatureF: number): number {
  if (temperatureF > 150) return 2;
  if (temperatureF > 120) return 2;
  if (temperatureF > 90) return 1;
  return 0;
}

/** How often the heat asks for a roll, in minutes (p. 434). */
export const HEAT_INTERVAL_MINUTES = 30;

/** What a roll against heat or cold cost. */
export interface ExposureResult {
  fpLost: number;
  /** True for the critical failure that is heat stroke. */
  heatStroke: boolean;
}

/**
 * What one failed roll against the weather costs (pp. 430, 434).
 *
 * Both cost a point. Only heat has a worse case: "on a critical failure, you
 * suffer heat stroke: lose 1d FP", which is the caller's die to roll.
 */
export function exposureResult(options: {
  success: boolean;
  criticalFailure?: boolean;
  /** The 1d rolled for heat stroke, when there was one. */
  strokeRoll?: number;
  heat?: boolean;
}): ExposureResult {
  if (options.success) return { fpLost: 0, heatStroke: false };

  if (options.heat && options.criticalFailure) {
    return { fpLost: Math.max(1, options.strokeRoll ?? 1), heatStroke: true };
  }

  return { fpLost: 1, heatStroke: false };
}
