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


/**
 * Whether a target stands inside a weapon's minimum range, where the shot
 * cannot be made: a missile or a launched grenade that has not flown far
 * enough to arm or to come down on it (Characters p. 281, note 1, gives the
 * Basic Set's three). A minimum of zero is no minimum.
 */
export function insideMinimumRange(rangeYards: number, minRange: number): boolean {
  if (!(minRange > 0) || !Number.isFinite(rangeYards)) return false;
  return Math.max(0, rangeYards) < minRange;
}

/** The least Rate of Fire that can spray several targets or suppress an area (Campaigns p. 409). */
export const SPREAD_FIRE_MIN_RATE_OF_FIRE = 5;
/** The least Rate of Fire that can suppress more than one zone at once (Campaigns p. 409). */
export const MULTIPLE_ZONES_MIN_RATE_OF_FIRE = 10;
/** Shots each zone must take when several are suppressed at once (Campaigns p. 409). */
export const SHOTS_PER_EXTRA_ZONE = 5;

/**
 * A weapon's Rate of Fire and Recoil for one attack, once the options chosen
 * for it have had their say: a setting that fixes the Rate of Fire at another
 * figure (above the weapon's own, or below), one that multiplies it, one that
 * fixes Recoil, and one that adds to it. Never below one shot or Recoil 1 --
 * though a weapon recorded with Recoil 0 (muscle-powered) keeps its 0 unless
 * an option changes it.
 */
export function attackRateOfFire(options: {
  rateOfFire: number;
  recoil: number;
  /** A Rate of Fire the attack is fired at in place of the weapon's, or null. */
  setRateOfFire?: number | null;
  multiplier?: number;
  /** A Recoil in place of the weapon's, or null. */
  setRecoil?: number | null;
  recoilModifier?: number;
}): { rateOfFire: number; recoil: number } {
  const set = Number(options.setRateOfFire);
  const base = options.setRateOfFire !== null && options.setRateOfFire !== undefined && set >= 1 ? Math.floor(set) : Math.max(1, Math.floor(options.rateOfFire) || 1);
  const multiplier = Number(options.multiplier);
  const rateOfFire = Math.max(1, Math.floor(base * (multiplier > 0 && Number.isFinite(multiplier) ? multiplier : 1)));
  const setRecoil = Number(options.setRecoil);
  const recoilBase = options.setRecoil !== null && options.setRecoil !== undefined && setRecoil >= 1 ? Math.floor(setRecoil) : Math.max(0, Math.floor(options.recoil) || 0);
  const added = Math.floor(Number(options.recoilModifier) || 0);
  const recoil = added === 0 ? recoilBase : Math.max(1, recoilBase + added);
  return { rateOfFire, recoil };
}

/** One target of a spray of fire, in the order the burst sweeps across them. */
export interface SprayTarget {
  /** Shots aimed at this target. */
  shots: number;
  /** Yards from the target before it; ignored for the first. */
  yardsFromPrevious?: number | undefined;
}

/**
 * Spraying Fire (Campaigns p. 409): a burst at RoF 5+ split among several
 * targets in the same general direction, engaged one after another.
 *
 * Each target is its own rapid-fire attack at the shots aimed at it. Swinging
 * the weapon from one to the next wastes shots -- one a yard between targets
 * more than a yard apart, two a yard above RoF 16 -- and costs +1 Recoil for
 * the second target, +2 for the third, and so on. The shots aimed and wasted
 * together cannot come to more than the Rate of Fire.
 *
 * The book's own example: RoF 15, Rcl 2, 5 shots at the first, 4 at the
 * second 2 yards on (1 wasted) and 2 at the third 4 yards on (3 wasted) is
 * three attacks: RoF 5 at Rcl 2, RoF 4 at Rcl 3, RoF 2 at Rcl 4.
 */
export function sprayingFire(options: {
  rateOfFire: number;
  recoil: number;
  targets: readonly SprayTarget[];
}): {
  attacks: Array<{ shots: number; recoil: number; wasted: number }>;
  /** Every shot the burst uses, aimed and wasted. */
  shotsUsed: number;
  /** Why the spray can't be fired as given, or null. */
  problem: "rateOfFire" | "targets" | "tooManyShots" | "noShots" | null;
} {
  const rateOfFire = Math.max(1, Math.floor(options.rateOfFire) || 1);
  const perYard = rateOfFire > 16 ? 2 : 1;
  const recoil = Math.max(1, Math.floor(options.recoil) || 1);
  const attacks = options.targets.map((target, index) => {
    const yards = index === 0 ? 0 : Math.max(0, Math.round(Number(target.yardsFromPrevious) || 0));
    return {
      shots: Math.max(0, Math.floor(Number(target.shots) || 0)),
      recoil: recoil + index,
      wasted: yards > 1 ? (yards - 1) * perYard : 0,
    };
  });
  const shotsUsed = attacks.reduce((sum, a) => sum + a.shots + a.wasted, 0);
  const problem = rateOfFire < SPREAD_FIRE_MIN_RATE_OF_FIRE
    ? "rateOfFire"
    : attacks.length < 2
      ? "targets"
      : attacks.some((a) => a.shots < 1)
        ? "noShots"
        : shotsUsed > rateOfFire
          ? "tooManyShots"
          : null;
  return { attacks, shotsUsed, problem };
}

/**
 * Suppression Fire (Campaigns p. 409): the shots fired into each two-yard
 * zone. One zone takes them all; a weapon of RoF 10+ may suppress several
 * adjacent zones, at least five shots in each, the shots shared out as
 * evenly as they go (the first zones taking any left over).
 */
export function suppressionZones(options: {
  rateOfFire: number;
  shots: number;
  zones: number;
}): { shotsPerZone: number[]; problem: "rateOfFire" | "tooManyShots" | "tooManyZones" | null } {
  const rateOfFire = Math.max(1, Math.floor(options.rateOfFire) || 1);
  const shots = Math.max(1, Math.floor(options.shots) || 1);
  const zones = Math.max(1, Math.floor(options.zones) || 1);
  const share = Array.from({ length: zones }, (_, i) => Math.floor(shots / zones) + (i < shots % zones ? 1 : 0));
  if (rateOfFire < SPREAD_FIRE_MIN_RATE_OF_FIRE) return { shotsPerZone: share, problem: "rateOfFire" };
  if (shots > rateOfFire) return { shotsPerZone: share, problem: "tooManyShots" };
  if (zones > 1 && (rateOfFire < MULTIPLE_ZONES_MIN_RATE_OF_FIRE || shots < zones * SHOTS_PER_EXTRA_ZONE)) {
    return { shotsPerZone: share, problem: "tooManyZones" };
  }
  return { shotsPerZone: share, problem: null };
}

/**
 * The most a suppression attack's effective skill may be (Campaigns p. 409):
 * 6 plus the rapid-fire bonus for the shots in the zone, or 8 plus it for a
 * weapon on a vehicle or tripod mount.
 */
export function suppressionSkillCap(shotsInZone: number, mounted = false): number {
  return (mounted ? 8 : 6) + rapidFireBonus(shotsInZone);
}
