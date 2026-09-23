/**
 * The Size and Speed/Range Table (Campaigns p. 550).
 */

/**
 * The table's rows from one yard up repeat the same six steps in every factor
 * of ten: 1, 1.5, 2, 3, 5 and 7 times a power of ten, each row one point more
 * than the last. The printed rows run to 200,000 yards; the progression carries
 * on past them, and a length between two rows uses the higher one.
 */
const DECADE_STEPS: readonly number[] = [1, 1.5, 2, 3, 5, 7];

/**
 * The rows below a yard, printed in inches and not on the same progression
 * (8" and 1 ft, for instance), as [inches, Size Modifier]. Speed/range is 0 on
 * every one of them.
 */
const SMALL_ROWS: ReadonlyArray<readonly [number, number]> = [
  [1 / 5, -15],
  [1 / 3, -14],
  [1 / 2, -13],
  [2 / 3, -12],
  [1, -11],
  [1.5, -10],
  [2, -9],
  [3, -8],
  [5, -7],
  [8, -6],
  [12, -5],
  [18, -4],
  [24, -3],
];

/**
 * Rows above the 1-yard row for a length of at least a yard: 1 yd is 0, 2 yd
 * is 2, 10 yd is 6, 1,000 yd is 18. Works in whole powers of ten so a printed
 * value such as 1,500 lands on its own row rather than a hair past it.
 */
function stepsAboveOneYard(yards: number): number {
  let scale = 1;
  let decades = 0;
  while (yards > 10 * scale) {
    scale *= 10;
    decades += 1;
  }
  const index = DECADE_STEPS.findIndex((step) => yards <= step * scale);
  return decades * 6 + (index === -1 ? 6 : index);
}

/**
 * Speed/range modifier for a total of range plus target speed, both in yards.
 *
 * Totals falling between two rows use the higher row, so 8 yards is treated as
 * 10 yards for -4, and 1,005 yards as 1,500 yards for -17 (Campaigns p. 550).
 * Nothing at 2 yards or less.
 */
export function speedRangeModifier(totalYards: number): number {
  if (!(totalYards > 2)) return 0;
  return 2 - stepsAboveOneYard(totalYards);
}

/**
 * Size Modifier for an object, from its longest dimension in yards.
 *
 * An object much smaller in two of three dimensions uses its smallest dimension
 * instead; callers are responsible for choosing which measurement to pass.
 * Anything smaller than the table's last row (1/5") loses another 6 per factor
 * of ten; a length of zero or less gets that last row.
 */
export function sizeModifier(longestDimensionYards: number): number {
  if (!(longestDimensionYards > 0)) return -15;
  if (longestDimensionYards > 2 / 3) return stepsAboveOneYard(longestDimensionYards) - 2;
  // Yards to inches can land a hair past a printed row (1/3 yd is 12").
  const inches = longestDimensionYards * 36 - 1e-9;
  if (inches < 1 / 5) return sizeModifier(longestDimensionYards * 10) - 6;
  for (const [upTo, size] of SMALL_ROWS) if (inches <= upTo) return size;
  return -3;
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

/**
 * The shots one attack fires, from what the shooter asked for: at least one
 * and at most the Rate of Fire, and -- where an option holds the weapon to
 * whole bursts, as a "!" weapon fires only on full auto (Characters p. 270)
 * -- at least `minShots` and a whole number of `step`s. A count between steps
 * comes down to the one below, never under the minimum. Null where no count
 * the Rate of Fire allows meets them: the attack can't be fired as asked.
 */
export function burstShots(options: {
  asked: number;
  rateOfFire: number;
  minShots?: number;
  step?: number;
}): number | null {
  const most = Math.max(1, Math.floor(Number(options.rateOfFire) || 1));
  const step = Math.max(1, Math.floor(Number(options.step) || 1));
  // The least count that is a whole number of steps and meets the minimum.
  const least = Math.ceil(Math.max(1, Math.floor(Number(options.minShots) || 1)) / step) * step;
  const top = Math.floor(most / step) * step;
  if (least > top) return null;
  const asked = Math.min(top, Math.max(least, Math.floor(Number(options.asked) || 1)));
  return Math.max(least, Math.floor(asked / step) * step);
}

/**
 * The fewest shots a weapon may fire in one attack for the mark after its
 * Rate of Fire: a weapon marked "!" fires only on full auto, at no less than
 * a quarter of its listed RoF, rounded up (Characters p. 270). One for any
 * other mark, or none.
 */
export function fullAutoMinimum(rateOfFire: number, mark: string): number {
  if (String(mark ?? "").trim() !== "!") return 1;
  return Math.max(1, Math.ceil(Math.max(1, Math.floor(Number(rateOfFire) || 1)) / 4));
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
