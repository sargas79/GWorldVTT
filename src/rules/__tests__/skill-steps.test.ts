import { describe, expect, it } from "vitest";

import {
  nextSkillPoints,
  previousSkillPoints,
  relativeLevelForPoints,
  skillStepCost,
} from "../skills.js";

/** The Skill Cost Table: 1, 2, 4, then four at a time. */
const TABLE = [1, 2, 4, 8, 12, 16, 20, 24];

describe("stepping skill points", () => {
  it("walks up the cost table", () => {
    let points = 0;
    for (const expected of TABLE) {
      points = nextSkillPoints(points);
      expect(points).toBe(expected);
    }
  });

  it("walks back down it, ending unlearned", () => {
    let points = 24;
    for (const expected of [...TABLE].reverse().slice(1)) {
      points = previousSkillPoints(points);
      expect(points).toBe(expected);
    }
    expect(previousSkillPoints(1)).toBe(0);
    expect(previousSkillPoints(0)).toBe(0);
  });

  /**
   * The reason this exists rather than a plain +1. Three of every four
   * totals between 4 and 8 buy nothing, so a stepper that added one would
   * spend a character point for no change to the level.
   */
  it("never stops on a total that buys nothing", () => {
    for (const difficulty of ["E", "A", "H", "VH"] as const) {
      let points = 0;
      for (let i = 0; i < 8; i++) {
        const before = relativeLevelForPoints(points, difficulty);
        points = nextSkillPoints(points);
        const after = relativeLevelForPoints(points, difficulty);
        expect(after).not.toBe(before);
      }
    }
  });

  it("brings an odd total back onto the table", () => {
    expect(nextSkillPoints(5)).toBe(8);
    expect(previousSkillPoints(5)).toBe(4);
    expect(nextSkillPoints(3)).toBe(4);
    expect(previousSkillPoints(3)).toBe(2);
  });

  it("is the inverse of itself across a step", () => {
    for (const points of TABLE) {
      expect(previousSkillPoints(nextSkillPoints(points))).toBe(points);
    }
  });

  it("agrees with the cost table it is walking", () => {
    expect(TABLE.map((_, step) => skillStepCost(step))).toEqual(TABLE);
  });

  it("survives a nonsense total rather than looping", () => {
    expect(nextSkillPoints(-5)).toBe(1);
    expect(previousSkillPoints(-5)).toBe(0);
  });
});
