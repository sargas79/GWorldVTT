import { describe, expect, it } from "vitest";

import { quickContest, type SuccessRollResult } from "../success.js";

/** A roll, as far as a contest is concerned. */
const roll = (success: boolean, margin: number): SuccessRollResult => ({
  dice: [3, 3, 3],
  roll: 9,
  effectiveSkill: 12,
  success,
  criticalSuccess: false,
  criticalFailure: false,
  margin,
});

describe("quickContest (GURPS Lite p. 3, Campaigns p. 348)", () => {
  it("gives it to the only one who succeeded", () => {
    expect(quickContest(roll(true, 2), roll(false, 3))).toEqual({ outcome: "first", marginOfVictory: 5 });
    expect(quickContest(roll(false, 3), roll(true, 2))).toEqual({ outcome: "second", marginOfVictory: 5 });
  });

  it("gives it to the larger margin when both succeeded", () => {
    expect(quickContest(roll(true, 5), roll(true, 2))).toEqual({ outcome: "first", marginOfVictory: 3 });
    expect(quickContest(roll(true, 1), roll(true, 4))).toEqual({ outcome: "second", marginOfVictory: 3 });
  });

  it("gives it to the smaller margin of failure when both failed", () => {
    expect(quickContest(roll(false, 1), roll(false, 6))).toEqual({ outcome: "first", marginOfVictory: 5 });
    expect(quickContest(roll(false, 7), roll(false, 2))).toEqual({ outcome: "second", marginOfVictory: 5 });
  });

  it("is a tie when neither did better", () => {
    expect(quickContest(roll(true, 3), roll(true, 3))).toEqual({ outcome: "tie", marginOfVictory: 0 });
    expect(quickContest(roll(false, 3), roll(false, 3))).toEqual({ outcome: "tie", marginOfVictory: 0 });
  });

  /**
   * "success by 5 vs. failure by 5 generally means more than success by 2 vs.
   * success by 1" -- the margin of victory is what says so, and it spans the
   * gap between the two rather than reporting the winner's own margin.
   */
  it("measures how decisively, not just who", () => {
    const decisive = quickContest(roll(true, 5), roll(false, 5));
    const narrow = quickContest(roll(true, 2), roll(true, 1));
    expect(decisive.marginOfVictory).toBe(10);
    expect(narrow.marginOfVictory).toBe(1);
    expect(decisive.marginOfVictory).toBeGreaterThan(narrow.marginOfVictory);
  });

  it("counts a bare success against a bare failure as the smallest of wins", () => {
    expect(quickContest(roll(true, 0), roll(false, 0))).toEqual({ outcome: "first", marginOfVictory: 0 });
  });
});
