import { describe, expect, it } from "vitest";

import {
  WILDCARD_COST_MULTIPLIER,
  nextSkillPoints,
  pointsForRelativeLevel,
  previousSkillPoints,
  relativeLevelForPoints,
  skillLevel,
} from "../skills.js";

/**
 * Wildcard skills (GURPS Basic Set: Characters p. 175): "a wildcard skill is
 * Very Hard and costs triple the normal cost". Gun! stands in for every Guns
 * specialty, Sword! for every blade -- and every step of the Skill Cost Table
 * is three times the figure printed.
 */
describe("wildcard skills", () => {
  it("cost triple what a Very Hard skill costs", () => {
    expect(WILDCARD_COST_MULTIPLIER).toBe(3);
    // Attribute-3 is the first step of a Very Hard skill, at 1 point; Gun!
    // gets there for 3.
    expect(pointsForRelativeLevel(-3, "VH")).toBe(1);
    expect(pointsForRelativeLevel(-3, "W")).toBe(3);
    expect(pointsForRelativeLevel(0, "W")).toBe(24);
    expect(pointsForRelativeLevel(1, "W")).toBe(36);
  });

  it("are not known for less than the first step", () => {
    expect(relativeLevelForPoints(2, "W")).toBeNull();
    expect(relativeLevelForPoints(3, "W")).toBe(-3);
    expect(relativeLevelForPoints(6, "W")).toBe(-2);
    expect(relativeLevelForPoints(12, "W")).toBe(-1);
    expect(relativeLevelForPoints(24, "W")).toBe(0);
    expect(relativeLevelForPoints(36, "W")).toBe(1);
  });

  it("resolve to an absolute level like any other skill", () => {
    // DX 12, twelve points in Gun!: attribute-1.
    expect(skillLevel(12, 12, "W")).toBe(11);
    expect(skillLevel(12, 2, "W")).toBeNull();
  });

  it("step along the tripled table on the sheet", () => {
    let points = 0;
    for (const expected of [3, 6, 12, 24, 36, 48]) {
      points = nextSkillPoints(points, "W");
      expect(points).toBe(expected);
    }
    expect(previousSkillPoints(36, "W")).toBe(24);
    expect(previousSkillPoints(3, "W")).toBe(0);
    // An odd total comes back onto the tripled table, not the printed one.
    expect(nextSkillPoints(7, "W")).toBe(12);
    expect(previousSkillPoints(7, "W")).toBe(6);
  });

  it("leave every other difficulty on the printed table", () => {
    expect(nextSkillPoints(0)).toBe(1);
    expect(nextSkillPoints(0, "VH")).toBe(1);
    expect(relativeLevelForPoints(1, "VH")).toBe(-3);
  });
});
