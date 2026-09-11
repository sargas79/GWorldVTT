/**
 * The Size and Speed/Range Table (GURPS Lite p. 27).
 */

interface RangeRow {
  /** Distance in yards this row covers, as an inclusive upper bound. */
  yards: number;
  /** Modifier to hit at this speed/range. */
  speedRange: number;
  /** Size Modifier for an object of this longest dimension. */
  size: number;
}

/**
 * The printed table, extended past 100 yards using its own repeating
 * progression (2, 3, 5, 7, 10, 15, 20, 30, 50, 70, 100 - a factor of ten every
 * six steps). GURPS Lite prints rows only up to 100 yards.
 */
const RANGE_TABLE: readonly RangeRow[] = [
  { yards: 1 / 3, speedRange: 0, size: -5 }, // 1 foot
  { yards: 1, speedRange: 0, size: -2 },
  { yards: 2, speedRange: 0, size: 0 },
  { yards: 3, speedRange: -1, size: 1 },
  { yards: 5, speedRange: -2, size: 2 },
  { yards: 7, speedRange: -3, size: 3 },
  { yards: 10, speedRange: -4, size: 4 },
  { yards: 15, speedRange: -5, size: 5 },
  { yards: 20, speedRange: -6, size: 6 },
  { yards: 30, speedRange: -7, size: 7 },
  { yards: 50, speedRange: -8, size: 8 },
  { yards: 70, speedRange: -9, size: 9 },
  { yards: 100, speedRange: -10, size: 10 },
  { yards: 150, speedRange: -11, size: 11 },
  { yards: 200, speedRange: -12, size: 12 },
  { yards: 300, speedRange: -13, size: 13 },
  { yards: 500, speedRange: -14, size: 14 },
  { yards: 700, speedRange: -15, size: 15 },
  { yards: 1000, speedRange: -16, size: 16 },
];

/**
 * Speed/range modifier for a total of range plus target speed, both in yards.
 *
 * Totals falling between two rows use the higher row, so 8 yards is treated as
 * 10 yards for -4 (GURPS Lite p. 27).
 */
export function speedRangeModifier(totalYards: number): number {
  if (totalYards <= 0) return 0;
  for (const row of RANGE_TABLE) {
    if (totalYards <= row.yards) return row.speedRange;
  }
  // Beyond the table, each further factor of ten costs another 6 points.
  const decadesBeyond = Math.ceil(Math.log10(totalYards / 1000));
  return -16 - 6 * decadesBeyond;
}

/**
 * Size Modifier for an object, from its longest dimension in yards.
 *
 * An object much smaller in two of three dimensions uses its smallest dimension
 * instead; callers are responsible for choosing which measurement to pass.
 */
export function sizeModifier(longestDimensionYards: number): number {
  if (longestDimensionYards <= 0) return -5;
  for (const row of RANGE_TABLE) {
    if (longestDimensionYards <= row.yards) return row.size;
  }
  const decadesBeyond = Math.ceil(Math.log10(longestDimensionYards / 1000));
  return 16 + 6 * decadesBeyond;
}

/**
 * The combined to-hit modifier for a ranged attack: the target's Size Modifier
 * plus the speed/range penalty for range plus target speed.
 */
export function rangedToHitModifier(options: {
  rangeYards: number;
  targetSpeedYardsPerSecond?: number;
  targetSizeModifier?: number;
}): { speedRange: number; size: number; total: number } {
  const speedRange = speedRangeModifier(
    options.rangeYards + (options.targetSpeedYardsPerSecond ?? 0),
  );
  const size = options.targetSizeModifier ?? 0;
  return { speedRange, size, total: speedRange + size };
}

/**
 * Half-damage and maximum range for a muscle-powered weapon whose ranges are
 * listed as multiples of ST, such as x10/x15 (GURPS Lite p. 19).
 */
export function musclePoweredRange(
  st: number,
  halfDamageMultiplier: number,
  maxMultiplier: number,
): { halfDamage: number; max: number } {
  return { halfDamage: st * halfDamageMultiplier, max: st * maxMultiplier };
}

/**
 * Bonus to hit for firing many shots at once (GURPS Basic Set: Campaigns
 * p. 373).
 *
 * Keyed on the number of shots actually fired, which is chosen before the
 * attack roll and may be anything up to the weapon's Rate of Fire -- not on
 * RoF itself. A revolver with RoF 3 firing one shot gets nothing.
 */
const RAPID_FIRE_BONUS: ReadonlyArray<{ upTo: number; bonus: number }> = [
  { upTo: 4, bonus: 0 },
  { upTo: 8, bonus: 1 },
  { upTo: 12, bonus: 2 },
  { upTo: 16, bonus: 3 },
  { upTo: 24, bonus: 4 },
  { upTo: 49, bonus: 5 },
  { upTo: 99, bonus: 6 },
];

export function rapidFireBonus(shotsFired: number): number {
  if (shotsFired < 2) return 0;
  for (const row of RAPID_FIRE_BONUS) {
    if (shotsFired <= row.upTo) return row.bonus;
  }
  // "each x2 +1 to hit": 100-199 is +7, 200-399 is +8, and so on.
  return 6 + Math.floor(Math.log2(shotsFired / 50));
}

/**
 * How many shots hit (GURPS Basic Set: Campaigns p. 373).
 *
 * "An attack scores one extra hit for every full multiple of Recoil by which
 * you make your attack roll. The total number of hits cannot exceed shots
 * fired." So a weapon at Rcl 2 that succeeds by 0-1 scores one hit, by 2-3 two,
 * by 4-5 three.
 *
 * Recoil below 1 is read as 1. The table prints 1 for a recoilless weapon, and
 * a weapon recorded with none would otherwise divide by zero and score every
 * shot as a hit.
 */
export function rapidFireHits(options: {
  /** Margin of success, zero or positive. A failed attack scores no hits. */
  margin: number;
  shotsFired: number;
  recoil: number;
}): number {
  const shots = Math.max(1, Math.floor(options.shotsFired));
  const recoil = Math.max(1, Math.floor(options.recoil));
  const extra = Math.floor(Math.max(0, options.margin) / recoil);
  return Math.min(shots, 1 + extra);
}

/**
 * The distance a shot up or down a slope actually covers (Campaigns p. 408).
 *
 * "Firing Downward: for every two yards of elevation you have over your target,
 * subtract one yard from the effective distance, to a minimum of half the real
 * ground distance. Firing Upward: for every yard of elevation your target has
 * over you, add one yard to the effective distance."
 *
 * The two halves are deliberately lopsided -- a yard of height helps half as
 * much as it hurts -- and only the downward one has a floor.
 *
 * "Ignore it entirely for beam weapons like lasers!"
 */
export function elevationRange(options: {
  /** Ground distance in yards, which is what a map measures. */
  groundYards: number;
  /** Yards the shooter is above the target; negative when below. */
  elevationYards: number;
  /** True for a laser or anything else that does not arc. */
  beamWeapon?: boolean;
}): number {
  const ground = Math.max(0, options.groundYards);
  if (options.beamWeapon) return ground;

  if (options.elevationYards >= 0) {
    const shortened = ground - Math.floor(options.elevationYards / 2);
    return Math.max(ground / 2, shortened);
  }

  return ground + Math.abs(options.elevationYards);
}

