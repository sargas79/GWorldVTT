/**
 * A day on the road (GURPS Basic Set: Campaigns pp. 351, 426).
 *
 * "The distance in miles you can march in one day, under ideal conditions,
 * equals 10 x Move", with Move after encumbrance; then the terrain and the
 * weather take their share, Enhanced Move (Ground) multiplies, and "a
 * successful roll against Hiking skill increases marching distance by 20%".
 * What it costs is the fatigue of a battle, "per hour of road travel".
 */

export type Terrain = "veryBad" | "bad" | "average" | "good";

/** What the ground does to the day's mileage (p. 351). */
export const TERRAIN_MULTIPLIER: Readonly<Record<Terrain, number>> = {
  veryBad: 0.2, // deep snow, dense forest, jungle, mountains, soft sand, swamp
  bad: 0.5, // broken ground, forest, steep hills
  average: 1, // light forest, rolling hills, most roads
  good: 1.25, // hard-packed desert, level plains, the best roads
};

export type TravelWeather = "fair" | "rain" | "snow" | "deepSnow" | "ice";

/** What the sky does to it (p. 351): rain, ankle-deep snow and ice halve, deeper snow quarters. */
export const WEATHER_MULTIPLIER: Readonly<Record<TravelWeather, number>> = {
  fair: 1,
  rain: 0.5,
  snow: 0.5,
  deepSnow: 0.25,
  ice: 0.5,
};

/** "A successful roll against Hiking skill increases marching distance by 20%." */
export const HIKING_ROLL_BONUS = 1.2;

/** Miles a day for one Move, "under ideal conditions". */
export const MILES_PER_MOVE = 10;

/** The day's march (p. 351). */
export function dailyMiles(options: {
  /** Move after encumbrance, injury and exhaustion. */
  move: number;
  terrain?: Terrain;
  weather?: TravelWeather;
  /** The Enhanced Move (Ground) multiplier, 1 for anybody without it. */
  enhancedMove?: number;
  /** Whether the Hiking roll was made. */
  hikingSuccess?: boolean;
}): number {
  const base = MILES_PER_MOVE * Math.max(0, options.move) * Math.max(1, options.enhancedMove ?? 1);
  const ground = TERRAIN_MULTIPLIER[options.terrain ?? "average"];
  const sky = WEATHER_MULTIPLIER[options.weather ?? "fair"];
  const skill = options.hikingSuccess ? HIKING_ROLL_BONUS : 1;
  return Math.round(base * ground * sky * skill * 10) / 10;
}

/**
 * What an hour of marching costs (p. 426): the fatigue of a battle, by
 * encumbrance -- 1 FP at none, one more a level -- "and 1 FP on a hot day".
 */
export function marchingFatiguePerHour(options: { encumbranceLevel: number; hot?: boolean }): number {
  return 1 + Math.max(0, Math.min(4, Math.floor(options.encumbranceLevel))) + (options.hot ? 1 : 0);
}
