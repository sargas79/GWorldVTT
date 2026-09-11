import { describe, expect, it } from "vitest";

import {
  CLIMBS,
  LIFT_MULTIPLES,
  MAX_THROWABLE_MULTIPLE,
  broadJumpFeet,
  climb,
  climbingModifier,
  highJumpInches,
  jumpingMove,
  liftCapacities,
  liftCapacity,
  liftingSkillCapacity,
  maximumDrag,
  pacedMove,
  sprintMove,
  swimmingModifier,
  throwDistanceModifier,
  throwingDistance,
  thrownDamage,
  thrownDamagePerDie,
  waterMove,
} from "../physical.js";

describe("jumping (Campaigns p. 352)", () => {
  /** "a Basic Move of 6 lets you jump 26 inches straight up" */
  it("computes a standing high jump", () => {
    expect(highJumpInches({ move: 6 })).toBe(26);
  });

  /** "a Basic Move of 6 lets you jump 9 feet from a standing start" */
  it("computes a standing broad jump", () => {
    expect(broadJumpFeet({ move: 6 })).toBe(9);
  });

  it("adds the yards run to Move for a running jump", () => {
    // Move 6 plus one yard of run is Move 7: 32 inches, 11 feet.
    expect(highJumpInches({ move: 6, runningStartYards: 1 })).toBe(32);
    expect(broadJumpFeet({ move: 6, runningStartYards: 1 })).toBe(11);
  });

  /** "Maximum running high-jump height is twice standing high-jump height." */
  it("never lets a run more than double the jump", () => {
    expect(highJumpInches({ move: 6, runningStartYards: 100 })).toBe(52);
    expect(broadJumpFeet({ move: 6, runningStartYards: 100 })).toBe(18);
  });

  /** "Halve all distances if you jump without such preparation." */
  it("halves a jump taken without preparing", () => {
    expect(highJumpInches({ move: 6, prepared: false })).toBe(13);
    expect(broadJumpFeet({ move: 6, prepared: false })).toBe(4.5);
  });

  it("never reports a negative jump for someone who can barely move", () => {
    expect(highJumpInches({ move: 1 })).toBe(0);
    expect(broadJumpFeet({ move: 1 })).toBe(0);
  });

  /** "substitute half your skill level, rounded down, for Basic Move" */
  it("uses half the Jumping skill when that is better", () => {
    expect(jumpingMove(5, 14)).toBe(7);
    expect(jumpingMove(8, 14)).toBe(8);
    expect(jumpingMove(5, null)).toBe(5);
  });
});

describe("lifting (Campaigns p. 353)", () => {
  it("prices each lift as its multiple of Basic Lift", () => {
    expect(liftCapacity(20, "oneHanded")).toBe(40);
    expect(liftCapacity(20, "twoHanded")).toBe(160);
    expect(liftCapacity(20, "shove")).toBe(240);
    expect(liftCapacity(20, "runningShove")).toBe(480);
    expect(liftCapacity(20, "carryOnBack")).toBe(300);
    expect(liftCapacity(20, "shiftSlightly")).toBe(1000);
  });

  /** A running shove is "double this", so the two must stay in step. */
  it("keeps the running shove at twice the standing one", () => {
    expect(LIFT_MULTIPLES.runningShove).toBe(LIFT_MULTIPLES.shove * 2);
  });

  it("lists them all together", () => {
    const all = liftCapacities(10);
    expect(Object.keys(all).sort()).toEqual(Object.keys(LIFT_MULTIPLES).sort());
    expect(all.twoHanded).toBe(80);
  });

  /** "if you have Lifting at 14, a roll of 9 lets you lift an extra 25%" */
  it("adds 5% of Basic Lift per point of Lifting margin", () => {
    expect(liftingSkillCapacity(100, 5)).toBe(125);
    expect(liftingSkillCapacity(100, 0)).toBe(100);
    expect(liftingSkillCapacity(100, -3)).toBe(100);
  });

  it("caps a drag at what can be carried on the back", () => {
    expect(maximumDrag(20)).toBe(liftCapacity(20, "carryOnBack"));
  });
});

describe("running (Campaigns p. 354)", () => {
  /** "with a Move of 7, you could sprint at 8.4 ... you would have Move 8" */
  it("adds a fifth to Move, dropping fractions", () => {
    expect(sprintMove(7)).toBe(8);
    expect(sprintMove(10)).toBe(12);
  });

  /** "Assume that even the slowest sprinter gets +1 Move." */
  it("gives the slowest sprinter a whole point", () => {
    expect(sprintMove(1)).toBe(2);
    expect(sprintMove(4)).toBe(5);
  });

  /** "with a ground Move of 7, you would run at 4.2 yards/second" */
  it("paces at half the sprint, unrounded", () => {
    expect(pacedMove(7)).toBeCloseTo(4.2, 5);
  });
});

describe("swimming (Campaigns p. 354)", () => {
  it("swims at a fifth of Basic Move, and never below one", () => {
    expect(waterMove(10)).toBe(2);
    expect(waterMove(7)).toBe(1);
    expect(waterMove(3)).toBe(1);
  });

  it("lets anything aquatic swim at its full Move", () => {
    expect(waterMove(10, true)).toBe(10);
  });

  it("adds the situation up", () => {
    expect(swimmingModifier({ intentional: true })).toBe(3);
    // "a penalty equal to twice your encumbrance level (e.g., Heavy gives -6)"
    expect(swimmingModifier({ encumbranceLevel: 3 })).toBe(-6);
    expect(swimmingModifier({ intentional: true, build: "fat" })).toBe(6);
    expect(swimmingModifier({ intentional: true, encumbranceLevel: 2, build: "veryFat" })).toBe(4);
  });

  it("is nothing at all for someone unencumbered who fell in", () => {
    expect(swimmingModifier({})).toBe(0);
  });
});

describe("climbing (Campaigns p. 349)", () => {
  it("knows what each climb costs", () => {
    expect(climb("mountain")?.modifier).toBe(0);
    expect(climb("stoneWall")?.modifier).toBe(-3);
    expect(climb("tree")?.modifier).toBe(5);
  });

  /** A ladder needs no roll at all, which is not the same as a modifier of 0. */
  it("distinguishes a climb needing no roll from an easy one", () => {
    expect(climb("ladderUp")?.modifier).toBeNull();
    expect(climb("mountain")?.modifier).toBe(0);
  });

  it("subtracts encumbrance from every climb", () => {
    expect(climbingModifier("stoneWall", 2)).toBe(-5);
    expect(climbingModifier("tree", 1)).toBe(4);
  });

  it("gives every climb a speed both in a hurry and at leisure", () => {
    for (const row of CLIMBS) {
      expect(row.combat, row.key).toBeTruthy();
      expect(row.regular, row.key).toBeTruthy();
    }
  });

  it("knows nothing about a climb nobody listed", () => {
    expect(climb("beanstalk")).toBeNull();
    expect(climbingModifier("beanstalk", 2)).toBe(-2);
  });
});

describe("throwing (Campaigns p. 355)", () => {
  /**
   * The book's worked example: ST 12, BL 29, a 120-lb. body. The ratio is 4.1,
   * which is priced at the 5.0 row, so the modifier is 0.12 and the throw goes
   * 1.4 yards -- into the pit.
   */
  it("follows the book's own example", () => {
    const distance = throwingDistance({ strength: 12, basicLift: 29, weight: 120 });
    expect(distance).toBeCloseTo(1.44, 2);
  });

  it("prices a ratio between two rows at the harder one", () => {
    expect(throwDistanceModifier(4.1)).toBe(0.12);
    expect(throwDistanceModifier(4.0)).toBe(0.15);
  });

  it("prices anything lighter than the table at its lightest row", () => {
    expect(throwDistanceModifier(0.01)).toBe(3.5);
    expect(throwDistanceModifier(0)).toBe(3.5);
  });

  it("refuses what cannot be thrown at all", () => {
    // Anything past a two-handed lift, which is 8 x BL.
    expect(throwingDistance({ strength: 10, basicLift: 20, weight: 161 })).toBeNull();
    expect(throwingDistance({ strength: 10, basicLift: 20, weight: 160 })).not.toBeNull();
    expect(MAX_THROWABLE_MULTIPLE).toBe(8);
  });

  it("has nothing to say without a Basic Lift", () => {
    expect(throwingDistance({ strength: 10, basicLift: 0, weight: 1 })).toBeNull();
    expect(thrownDamagePerDie(5, 0)).toBeNull();
  });

  /**
   * "You have ST 28 ... a thrust damage of 3d-1. You hit a foe with a hurled
   * 50-lb. bag of cement... it does straight thrust damage, or 3d-1."
   */
  it("follows the book's damage example", () => {
    expect(thrownDamagePerDie(50, 157)).toBe(0);
    expect(thrownDamage({ dice: 3, adds: -1 }, 50, 157)).toEqual({ dice: 3, adds: -1 });
  });

  /** The table is not monotonic, and that is the book's doing, not a slip. */
  it("makes an object up to BL hit harder than a heavier one", () => {
    expect(thrownDamagePerDie(100, 100)).toBe(1);
    expect(thrownDamagePerDie(150, 100)).toBe(0);
  });

  it("scales the per-die modifier by the dice", () => {
    // A tenth of Basic Lift is the lightest band, at -2 a die.
    expect(thrownDamage({ dice: 3, adds: 0 }, 10, 100)).toEqual({ dice: 3, adds: -6 });
    // A fifth of it is the next band up, at -1 a die.
    expect(thrownDamage({ dice: 3, adds: 0 }, 20, 100)).toEqual({ dice: 3, adds: -3 });
    expect(thrownDamage({ dice: 2, adds: 1 }, 100, 100)).toEqual({ dice: 2, adds: 3 });
  });

  /** "-1/2 per die (round down)": three dice lose two, not one and a half. */
  it("rounds the half-die band down", () => {
    expect(thrownDamagePerDie(300, 100)).toBe(-0.5);
    expect(thrownDamage({ dice: 3, adds: 0 }, 300, 100)).toEqual({ dice: 3, adds: -2 });
  });

  it("has no damage for something too heavy to throw", () => {
    expect(thrownDamage({ dice: 3, adds: 0 }, 900, 100)).toBeNull();
  });
});
