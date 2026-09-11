import { describe, expect, it } from "vitest";

import { RAPID_STRIKE_PENALTY } from "../attack-options.js";
import {
  EXTRA_EFFORT_STEP,
  FEVERISH_DEFENSE_BONUS,
  extraEffortModifier,
  extraEffortTarget,
  flurryOfBlowsPenalty,
  mightyBlowsBonus,
} from "../extra-effort.js";
import { strongAttackDamageBonus } from "../maneuvers.js";

describe("what extra effort costs to attempt (Campaigns p. 356)", () => {
  /** "to add 10% to ST, roll at -2" */
  it("charges one point of skill per 5% asked", () => {
    expect(extraEffortModifier(5)).toBe(-1);
    expect(extraEffortModifier(10)).toBe(-2);
    expect(extraEffortModifier(50)).toBe(-10);
  });

  it("asks nothing for nothing", () => {
    expect(extraEffortModifier(0)).toBe(0);
    expect(extraEffortModifier(-20)).toBe(0);
  });

  /** Rounding the other way would make the first 4% free. */
  it("charges a part step as a whole one", () => {
    expect(extraEffortModifier(1)).toBe(-1);
    expect(extraEffortModifier(EXTRA_EFFORT_STEP + 1)).toBe(-2);
  });
});

describe("the Will roll behind an extra-effort attempt", () => {
  it("is Will, less what the effort costs", () => {
    expect(extraEffortTarget({ will: 12, percentIncrease: 10 })).toBe(10);
  });

  /** "If you are fatigued, apply a penalty equal to the missing FP." */
  it("is worse for every point of fatigue already spent", () => {
    expect(extraEffortTarget({ will: 12, percentIncrease: 10, missingFp: 3 })).toBe(7);
    expect(extraEffortTarget({ will: 12, percentIncrease: 10, missingFp: -3 })).toBe(10);
  });

  it("is better by five for someone frightened, angry or protecting a loved one", () => {
    expect(extraEffortTarget({ will: 12, percentIncrease: 10, motivated: true })).toBe(15);
  });
});

describe("extra effort in combat (Campaigns p. 357)", () => {
  it("adds two to one defense roll", () => {
    expect(FEVERISH_DEFENSE_BONUS).toBe(2);
  });

  /** "halve the penalty for Rapid Strike" -- -6 becomes -3. */
  it("halves the Rapid Strike penalty", () => {
    expect(flurryOfBlowsPenalty()).toBe(-3);
    expect(flurryOfBlowsPenalty(RAPID_STRIKE_PENALTY)).toBe(RAPID_STRIKE_PENALTY / 2);
  });

  /** An odd penalty is rounded towards zero, in the fighter's favour. */
  it("rounds an odd penalty the fighter's way", () => {
    expect(flurryOfBlowsPenalty(-5)).toBe(-2);
    expect(flurryOfBlowsPenalty(0)).toBe(0);
  });

  /**
   * "+2 to damage -- or +1 damage per die, if that would be better": two for a
   * knife, three for a maul.
   */
  it("buys the All-Out Attack (Strong) damage bonus", () => {
    expect(mightyBlowsBonus(1)).toBe(2);
    expect(mightyBlowsBonus(2)).toBe(2);
    expect(mightyBlowsBonus(3)).toBe(3);
    expect(mightyBlowsBonus(6)).toBe(6);
  });

  it("is the same bonus the maneuver gives", () => {
    for (const dice of [1, 2, 3, 4, 5]) {
      expect(mightyBlowsBonus(dice)).toBe(strongAttackDamageBonus(dice));
    }
  });

  it("never subtracts damage from a weapon with no dice at all", () => {
    expect(strongAttackDamageBonus(0)).toBe(2);
    expect(strongAttackDamageBonus(-4)).toBe(2);
  });
});
