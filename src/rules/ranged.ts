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
