import { describe, expect, it } from "vitest";
import {
  combinedStrength,
  extrasOverCap,
  fatigueForSkillBonus,
  giantStepAllowed,
  godlikeEffect,
  greatLungeAllowed,
  marchingHours,
  marchingMilesPerMove,
  marchingSpeed,
  powerEffortCost,
  powerEffortTarget,
  rapidRecoveryAllowed,
} from "../extra-effort-extras.js";

describe("combat extras (Basic Set Revised p. 571)", () => {
  it("allows one offensive and one defensive a turn", () => {
    expect(extrasOverCap(["giantStep", "feverishDefense"])).toEqual([]);
    expect(extrasOverCap(["giantStep", "greatLunge", "rapidRecovery", "feverishDefense"])).toEqual(["greatLunge", "feverishDefense"]);
  });
  it("narrows Giant Step and gates the others by maneuver", () => {
    expect(giantStepAllowed("attack")).toBe(true);
    expect(giantStepAllowed("committedAttack")).toBe(false);
    expect(giantStepAllowed("moveAndAttack")).toBe(false);
    expect(greatLungeAllowed("allOutAttack")).toBe(false);
    expect(greatLungeAllowed("moveAndAttack")).toBe(true);
    expect(rapidRecoveryAllowed({ unbalanced: true, maneuver: "attack" })).toBe(true);
    expect(rapidRecoveryAllowed({ unbalanced: false, maneuver: "attack" })).toBe(false);
    expect(rapidRecoveryAllowed({ unbalanced: false, maneuver: "moveAndAttack" })).toBe(true);
  });
});

describe("extra effort with powers (pp. 571-572)", () => {
  it("rolls Will at -1 per 5%, capped at 100%, plus Talent and emotion, ignoring missing FP", () => {
    expect(powerEffortTarget({ will: 12, percentIncrease: 10 })).toBe(10);
    expect(powerEffortTarget({ will: 12, percentIncrease: 11, talent: 2, motivated: true })).toBe(12 - 3 + 7);
    expect(powerEffortTarget({ will: 12, percentIncrease: 300 })).toBe(12 - 20);
    expect(powerEffortTarget({ will: 12, percentIncrease: 300, uncapped: true })).toBe(12 - 60);
  });
  it("costs 1 FP a roll and nothing on a critical success", () => {
    expect(powerEffortCost({ criticalSuccess: false })).toBe(1);
    expect(powerEffortCost({ criticalSuccess: true })).toBe(0);
    expect(powerEffortCost({ criticalSuccess: false, fpSpent: 10 })).toBe(10);
  });
  it("multiplies the effect by the FP for Godlike Extra Effort", () => {
    expect(godlikeEffect(15, 1)).toBe(15);
    expect(godlikeEffect(15, 10)).toBe(150);
  });
});

describe("trading fatigue (p. 572)", () => {
  it("gives +1 per FP up to +4", () => {
    expect([0, 1, 4, 7].map(fatigueForSkillBonus)).toEqual([0, 1, 4, 4]);
  });
});

describe("Combining ST (p. 572)", () => {
  it("takes the square root of 5 x the summed Basic Lift, rounded up", () => {
    expect(combinedStrength(Array(10).fill(20))).toBe(32);
    expect(combinedStrength([20])).toBe(10);
  });
});

describe("Humping, Tramping, and Yomping (p. 572)", () => {
  it("gives 8 or 12 hours, half the Move an hour, 4 or 6 x Move a day", () => {
    expect(marchingHours(false)).toBe(8);
    expect(marchingHours(true)).toBe(12);
    expect(marchingSpeed(5)).toBe(2.5);
    expect(marchingMilesPerMove(false)).toBe(4);
    expect(marchingMilesPerMove(true)).toBe(6);
  });
});

describe("marching in the day's miles", () => {
  it("replaces 10 x Move with 4 or 6 x Move", async () => {
    const { dailyMiles } = await import("../hiking.js");
    expect(dailyMiles({ move: 6 })).toBe(60);
    expect(dailyMiles({ move: 6, milesPerMove: 4 })).toBe(24);
    expect(dailyMiles({ move: 6, milesPerMove: 6 })).toBe(36);
  });
});
