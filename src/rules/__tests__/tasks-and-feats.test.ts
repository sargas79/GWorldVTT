import { describe, expect, it } from "vitest";
import {
  abstractNpcSkill,
  adjustedResistance,
  clampBad,
  collectiveScore,
  expandedInfluenceReaction,
  groupFraction,
  groupOutcome,
  hamClausePenalty,
  quickAndDirtyModifier,
  suggestedBad,
} from "../tasks-and-feats.js";

describe("Ham Clause (p. 570)", () => {
  it("is -1 per -5 points or fraction of them", () => {
    expect(hamClausePenalty(-15)).toBe(-3);
    expect(hamClausePenalty(-1)).toBe(-1);
    expect(hamClausePenalty(-5)).toBe(-1);
    expect(hamClausePenalty(-6)).toBe(-2);
    expect(hamClausePenalty(5)).toBe(0);
  });
  it("counts quick-and-dirty qualifiers", () => {
    expect(quickAndDirtyModifier({ complications: 3 })).toBe(-3);
    expect(quickAndDirtyModifier({ complications: 2, intensifiers: 1, favourable: 1 })).toBe(-2);
  });
});

describe("How Many People (p. 570)", () => {
  it("reads the table", () => {
    expect(groupFraction(3)).toEqual({ target: 3, of: "succeed", divisor: 200 });
    expect(groupFraction(10)).toEqual({ target: 10, of: "succeed", divisor: 2 });
    expect(groupFraction(11)).toEqual({ target: 11, of: "fail", divisor: 3 });
    expect(groupFraction(18).divisor).toBe(200);
    expect(groupFraction(1).target).toBe(3);
  });
  it("gives one quarter resisting at 8", () => {
    expect(groupOutcome(8, 40)).toEqual({ succeed: 10, fail: 30 });
  });
  it("makes everyone fail or succeed when the fraction is under 1", () => {
    expect(groupOutcome(16, 40)).toEqual({ succeed: 40, fail: 0 });
    expect(groupOutcome(4, 40)).toEqual({ succeed: 0, fail: 40 });
  });
  it("takes a Contest's margin off the resistance, never under 3", () => {
    expect(adjustedResistance(12, 6)).toBe(6);
    expect(adjustedResistance(5, 9)).toBe(3);
    expect(adjustedResistance(12, null)).toBeNull();
  });
});

describe("Collective Skill (p. 571)", () => {
  it("reads the table", () => {
    expect(collectiveScore(3, 5)).toBe(4);
    expect(collectiveScore(3, 500)).toBe(14);
    expect(collectiveScore(7, 5)).toBe(11);
    expect(collectiveScore(9, 10)).toBe(16);
    expect(collectiveScore(11, 5)).toBe(16);
    expect(collectiveScore(2, 50)).toBe(7);
  });
  it("uses the lower size, and 16 over 500", () => {
    expect(collectiveScore(7, 6)).toBe(11);
    expect(collectiveScore(4, 49)).toBe(8);
    expect(collectiveScore(3, 501)).toBe(16);
  });
});

describe("Expanded Influence Rolls (p. 571)", () => {
  it("maps the margin", () => {
    const cases: Array<[number, string]> = [
      [9, "excellent"], [8, "excellent"], [7, "veryGood"], [5, "veryGood"], [4, "good"], [1, "good"],
      [0, "neutral"], [-1, "poor"], [-2, "poor"], [-3, "bad"], [-4, "bad"], [-5, "veryBad"], [-7, "veryBad"],
      [-8, "disastrous"], [-15, "disastrous"],
    ];
    for (const [margin, reaction] of cases) expect(expandedInfluenceReaction(margin)).toBe(reaction);
  });
});

describe("Basic Abstract Difficulty (p. 578)", () => {
  it("clamps to 0 through -10", () => {
    expect(clampBad(-5)).toBe(-5);
    expect(clampBad(5)).toBe(-5);
    expect(clampBad(-14)).toBe(-10);
    expect(clampBad(Number.NaN)).toBe(0);
  });
  it("makes an unstatted NPC 10 + |BAD|", () => {
    expect(abstractNpcSkill(-1)).toBe(11);
    expect(abstractNpcSkill(-5)).toBe(15);
    expect(abstractNpcSkill(0)).toBe(10);
  });
  it("suggests the Enemy's points over 4, dropping fractions", () => {
    expect(suggestedBad(23)).toBe(-5);
    expect(suggestedBad(3)).toBe(0);
    expect(suggestedBad(100)).toBe(-10);
  });
});
