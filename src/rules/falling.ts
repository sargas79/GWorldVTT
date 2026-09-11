/**
 * Falling, and the blunt trauma that comes with it
 * (GURPS Basic Set: Campaigns pp. 379, 430-431).
 *
 * "A fall is a collision with an immovable object: the ground" -- so the damage
 * is collision damage, and this reuses the arithmetic a slam already does
 * rather than restating it. What falling adds is how fast you were going when
 * you arrived, and the fact that the ground does not move out of the way.
 *
 * Written down here because three rules already implemented point at it: a
 * critical miss that puts you on the ground, knockback that knocks you over,
 * and a failed Climbing roll.
 */

import { slamDamage, type SlamDamage } from "./attack-options.js";

/**
 * The Falling Velocity Table (p. 431), as [longest fall, velocity].
 *
 * The book prints this table and then offers a formula "alternatively" --
 * "the square root of (21.4 x g x distance fallen in yards)... round to the
 * nearest whole number". The two do not quite agree: at the first yard of each
 * band from 28 upwards the formula comes out one lower, so a 28-yard fall is
 * velocity 25 on the table and 24 by the formula.
 *
 * The table is what is implemented, because it is what a GM reads. The formula
 * is used only past the end of it, where the table stops answering.
 */
const VELOCITY_BANDS: ReadonlyArray<readonly [number, number]> = [
  [1, 5], [2, 7], [3, 8], [4, 9], [5, 10], [6, 11], [7, 12], [8, 13], [9, 14],
  [11, 15], [12, 16], [14, 17], [15, 18], [17, 19], [19, 20], [21, 21], [23, 22],
  [25, 23], [27, 24], [29, 25], [32, 26], [34, 27], [37, 28], [39, 29], [42, 30],
  [45, 31], [48, 32], [51, 33], [54, 34], [57, 35], [61, 36], [64, 37], [67, 38],
  [71, 39], [75, 40], [79, 41], [82, 42], [86, 43], [90, 44], [95, 45], [99, 46],
  [103, 47], [108, 48], [112, 49],
];

/** The longest fall the table covers. */
export const LONGEST_TABULATED_FALL = VELOCITY_BANDS[VELOCITY_BANDS.length - 1]![0];

/**
 * How fast you are going when you land, in yards per second (p. 431).
 *
 * Read off the table for the distances it covers at Earth gravity, and
 * computed from the book's own formula for anything longer or anywhere else --
 * the table assumes 1G and stops at 112 yards, and a fall from higher than that
 * still has to land.
 */
export function fallingVelocity(yardsFallen: number, gravity = 1): number {
  const distance = Math.max(0, yardsFallen);
  const g = Math.max(0, gravity);
  if (distance === 0 || g === 0) return 0;

  if (g === 1 && distance <= LONGEST_TABULATED_FALL) {
    const band = VELOCITY_BANDS.find(([longest]) => distance <= longest);
    if (band) return band[1];
  }

  return Math.round(Math.sqrt(21.4 * g * distance));
}

/**
 * Terminal velocity for a falling human, in yards per second (p. 431).
 *
 * "For human-shaped objects on Earth, it is 60-100 yards/second. Use the low
 * end for a spread-eagled fall, the high end for a swan dive." Nothing else
 * about a fall is a choice, so this one is offered rather than assumed.
 */
export const TERMINAL_VELOCITY = { spreadEagled: 60, swanDive: 100 } as const;

/**
 * Terminal velocity adjusted for the world you are falling on.
 *
 * "Multiply terminal velocity by the square root of gravity in Gs. Then divide
 * it by the square root of pressure in atm." In a vacuum nothing slows you at
 * all, which is why zero pressure has no answer.
 */
export function terminalVelocity(options: {
  base?: number;
  gravity?: number;
  pressure?: number;
}): number | null {
  const { base = TERMINAL_VELOCITY.spreadEagled, gravity = 1, pressure = 1 } = options;
  if (pressure <= 0) return null;
  return (base * Math.sqrt(Math.max(0, gravity))) / Math.sqrt(pressure);
}

/** How hard what you landed on is (p. 430). */
export type LandingSurface = "hard" | "soft";

export interface FallInput {
  /** The faller's Hit Points, which is what a collision measures. */
  hitPoints: number;
  yardsFallen: number;
  /**
   * "Clay, concrete, ordinary soil, and sand are all hard, as is a building,
   * mountain, or similar obstacle." Forest litter, hay, swamp and water are
   * soft.
   */
  surface?: LandingSurface;
  /** Local gravity in Gs, which changes how fast you arrive. */
  gravity?: number;
  /**
   * Acrobatics landed properly: "reduce falling distance by five yards when
   * calculating velocity".
   */
  controlled?: boolean;
  /**
   * The most the fall can accelerate you to. Left out for the distances the
   * table covers, where "air resistance is relatively negligible".
   */
  terminalVelocity?: number;
}

export interface FallResult {
  /** Distance actually used, after a controlled landing shortened it. */
  yardsFallen: number;
  velocity: number;
  /** Crushing damage, as dice and adds. */
  damage: SlamDamage;
}

/** The five yards an Acrobatics roll takes off a fall (p. 431). */
export const CONTROLLED_FALL_YARDS = 5;

/**
 * What a fall does (pp. 430-431).
 *
 * "Bill is pushed out a fifth-story window. He falls 17 yards... his velocity
 * is 19 yards/second. Bill has 10 HP, but he uses twice this because he hit a
 * hard surface. Damage is (2 x 10 x 19)/100 = 3.8d, which rounds up to 4d
 * crushing."
 */
export function fallingDamage(input: FallInput): FallResult {
  const controlled = input.controlled === true;
  const yards = Math.max(
    0,
    input.yardsFallen - (controlled ? CONTROLLED_FALL_YARDS : 0),
  );

  const reached = fallingVelocity(yards, input.gravity ?? 1);
  const velocity = input.terminalVelocity === undefined
    ? reached
    : Math.min(reached, Math.max(0, input.terminalVelocity));

  // "If the immovable object is hard, use twice the HP of the moving object to
  // calculate damage."
  const effectiveHp = (input.surface ?? "hard") === "hard"
    ? Math.max(0, input.hitPoints) * 2
    : Math.max(0, input.hitPoints);

  return { yardsFallen: yards, velocity, damage: slamDamage(effectiveHp, velocity) };
}

/**
 * Blunt trauma through flexible armour (p. 379).
 *
 * "For every full 10 points of cutting, impaling, or piercing damage or 5
 * points of crushing damage stopped by your DR, you suffer 1 HP of injury due
 * to blunt trauma... If even one point of damage penetrates your flexible DR,
 * however, you do not suffer blunt trauma."
 *
 * It is actual injury and not basic damage, so no wounding modifier applies to
 * it. Falling is where this is reached today, because "all armor, flexible or
 * not (but not innate DR), counts as flexible for the purpose of calculating
 * blunt trauma from falling damage" -- and so no armour record has to say
 * whether it is flexible for a fall to be right.
 */
export function bluntTrauma(options: {
  /** Basic damage the armour stopped. */
  stopped: number;
  /** Whether anything at all got through, which cancels it entirely. */
  penetrated: boolean;
  /** Crushing gives 1 HP per 5; everything it applies to gives 1 per 10. */
  crushing?: boolean;
}): number {
  if (options.penetrated || options.stopped <= 0) return 0;
  const per = options.crushing === false ? 10 : 5;
  return Math.floor(options.stopped / per);
}
