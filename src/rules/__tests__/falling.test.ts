import { describe, expect, it } from "vitest";

import {
  CONTROLLED_FALL_YARDS,
  LONGEST_TABULATED_FALL,
  TERMINAL_VELOCITY,
  bluntTrauma,
  fallingDamage,
  fallingVelocity,
  terminalVelocity,
} from "../falling.js";

/**
 * The Falling Velocity Table (Campaigns p. 431), which the book prints and then
 * gives the formula for. Every row is checked, because the formula is what is
 * implemented and the table is what a GM will read at the table.
 */
const TABLE: ReadonlyArray<readonly [number, number]> = [
  [1, 5], [2, 7], [3, 8], [4, 9], [5, 10], [6, 11], [7, 12], [8, 13], [9, 14],
  [10, 15], [11, 15], [12, 16], [13, 17], [14, 17], [15, 18], [16, 19], [17, 19],
  [18, 20], [19, 20], [20, 21], [21, 21], [22, 22], [23, 22], [24, 23], [25, 23],
  [26, 24], [27, 24], [28, 25], [29, 25], [30, 26], [32, 26], [33, 27], [34, 27],
  [35, 28], [37, 28], [38, 29], [39, 29], [40, 30], [42, 30], [43, 31], [45, 31],
  [46, 32], [48, 32], [49, 33], [51, 33], [52, 34], [54, 34], [55, 35], [57, 35],
  [58, 36], [61, 36], [62, 37], [64, 37], [65, 38], [67, 38], [68, 39], [71, 39],
  [72, 40], [75, 40], [76, 41], [79, 41], [80, 42], [82, 42], [83, 43], [86, 43],
  [87, 44], [90, 44], [91, 45], [95, 45], [96, 46], [99, 46], [100, 47], [103, 47],
  [104, 48], [108, 48], [109, 49], [112, 49],
];

describe("how fast you are going when you land (Campaigns p. 431)", () => {
  it.each(TABLE)("%i yards gives velocity %i", (yards, velocity) => {
    expect(fallingVelocity(yards)).toBe(velocity);
  });

  it("is nothing at all for a fall of no distance", () => {
    expect(fallingVelocity(0)).toBe(0);
    expect(fallingVelocity(-4)).toBe(0);
  });

  /**
   * The book's "alternatively, calculate velocity as the square root of
   * (21.4 x g x distance)" does not quite reproduce its own table: at the first
   * yard of each band from 28 upwards it comes out one lower. The table is what
   * a GM reads, so the table is what is implemented, and this pins the
   * difference so nobody quietly "fixes" it into the formula.
   */
  it("prefers the table to the formula where they disagree", () => {
    expect(fallingVelocity(28)).toBe(25);
    expect(Math.round(Math.sqrt(21.4 * 28))).toBe(24);
  });

  /** The table stops at 112 yards; a longer fall still has to land. */
  it("computes a fall past the end of the table", () => {
    expect(LONGEST_TABULATED_FALL).toBe(112);
    expect(fallingVelocity(200)).toBe(Math.round(Math.sqrt(21.4 * 200)));
  });

  /** "the square root of (21.4 x g x distance)", so a lighter world is gentler. */
  it("is slower where gravity is lower, which the table cannot say", () => {
    expect(fallingVelocity(17, 0.17)).toBeLessThan(fallingVelocity(17));
    expect(fallingVelocity(17, 0.38)).toBe(Math.round(Math.sqrt(21.4 * 0.38 * 17)));
  });
});

describe("terminal velocity", () => {
  it("is 60 spread-eagled and 100 in a dive", () => {
    expect(TERMINAL_VELOCITY.spreadEagled).toBe(60);
    expect(terminalVelocity({ base: TERMINAL_VELOCITY.swanDive })).toBe(100);
  });

  /** "Multiply by the square root of gravity ... divide by the square root of pressure." */
  it("rises with gravity and falls with pressure", () => {
    expect(terminalVelocity({ gravity: 4 })).toBe(120);
    expect(terminalVelocity({ pressure: 4 })).toBe(30);
  });

  it("has no answer in a vacuum, where nothing slows you", () => {
    expect(terminalVelocity({ pressure: 0 })).toBeNull();
  });
});

describe("what a fall does (Campaigns pp. 430-431)", () => {
  /**
   * "Bill is pushed out a fifth-story window. He falls 17 yards... his velocity
   * is 19 yards/second. Bill has 10 HP, but he uses twice this because he hit a
   * hard surface. Damage is (2 x 10 x 19)/100 = 3.8d, which rounds up to 4d."
   */
  it("follows the book's own example", () => {
    const fall = fallingDamage({ hitPoints: 10, yardsFallen: 17 });
    expect(fall.velocity).toBe(19);
    expect(fall.damage).toEqual({ dice: 4, modifier: 0 });
  });

  it("uses the faller's own HP on something soft", () => {
    const soft = fallingDamage({ hitPoints: 10, yardsFallen: 17, surface: "soft" });
    // Half of Bill's: 1.9d, which rounds down to 1d rather than up.
    expect(soft.damage).toEqual({ dice: 2, modifier: 0 });
  });

  /** "reduce falling distance by five yards when calculating velocity" */
  it("takes five yards off a controlled landing", () => {
    const fall = fallingDamage({ hitPoints: 10, yardsFallen: 17, controlled: true });
    expect(fall.yardsFallen).toBe(17 - CONTROLLED_FALL_YARDS);
    expect(fall.velocity).toBe(fallingVelocity(12));
  });

  it("cannot take a short fall below no fall at all", () => {
    const fall = fallingDamage({ hitPoints: 10, yardsFallen: 3, controlled: true });
    expect(fall.yardsFallen).toBe(0);
    expect(fall.velocity).toBe(0);
  });

  it("stops accelerating at terminal velocity", () => {
    const long = fallingDamage({ hitPoints: 10, yardsFallen: 5000, terminalVelocity: 60 });
    expect(long.velocity).toBe(60);
    expect(long.damage.dice).toBe(12);
  });

  /** A very short fall is fractions of a die, which still hurt. */
  it("gives a fraction of a die for a stumble", () => {
    expect(fallingDamage({ hitPoints: 1, yardsFallen: 1 }).damage).toEqual({
      dice: 1,
      modifier: -3,
    });
  });
});

describe("blunt trauma (Campaigns p. 379)", () => {
  /** "1 HP of injury for every full 5 points of crushing damage stopped" */
  it("gives a point per five of crushing stopped", () => {
    expect(bluntTrauma({ stopped: 4, penetrated: false })).toBe(0);
    expect(bluntTrauma({ stopped: 5, penetrated: false })).toBe(1);
    expect(bluntTrauma({ stopped: 14, penetrated: false })).toBe(2);
  });

  it("gives a point per ten of anything else", () => {
    expect(bluntTrauma({ stopped: 9, penetrated: false, crushing: false })).toBe(0);
    expect(bluntTrauma({ stopped: 20, penetrated: false, crushing: false })).toBe(2);
  });

  /** "If even one point of damage penetrates ... you do not suffer blunt trauma." */
  it("is cancelled entirely by a single point getting through", () => {
    expect(bluntTrauma({ stopped: 40, penetrated: true })).toBe(0);
  });

  it("is nothing when the armour stopped nothing", () => {
    expect(bluntTrauma({ stopped: 0, penetrated: false })).toBe(0);
    expect(bluntTrauma({ stopped: -3, penetrated: false })).toBe(0);
  });
});
