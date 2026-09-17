import { describe, expect, it } from "vitest";

import { clampedLevels, steppedLevels, steppedPoints } from "../advancement.js";
import { levelCeiling } from "../picker-merge.js";

/**
 * A figure typed into the levels box is held to the same limits the buttons
 * respect: Intolerance stops at 2 (Characters p. 140), a tabled trait at its
 * last priced row, and nothing goes below none.
 */
describe("a typed level", () => {
  const intolerance = { type: "trait", name: "Intolerance", system: { levels: 1, maxLevels: 2, costTable: [] } };
  const wealth = { type: "trait", name: "Wealth", system: { levels: 2, maxLevels: 0, costTable: [10, 20, 30, 50, 75] } };
  const charisma = { type: "trait", name: "Charisma", system: { levels: 3, maxLevels: 0, costTable: [] } };

  it("is brought back to the printed cap", () => {
    expect(clampedLevels(intolerance, "7")).toBe(2);
    expect(clampedLevels(intolerance, 2)).toBe(2);
    expect(clampedLevels(intolerance, "1")).toBe(1);
  });

  it("stops at the last row a cost table prices", () => {
    expect(clampedLevels(wealth, 9)).toBe(5);
    expect(levelCeiling(wealth)).toBe(5);
  });

  it("steps freely where the book sets no limit", () => {
    expect(clampedLevels(charisma, 12)).toBe(12);
    expect(levelCeiling(charisma)).toBeNull();
  });

  it("goes no lower than none, and rounds to whole levels", () => {
    expect(clampedLevels(intolerance, -3)).toBe(0);
    expect(clampedLevels(charisma, 2.6)).toBe(3);
  });

  it("keeps what is held when the box is blank or nonsense", () => {
    expect(clampedLevels(intolerance, "")).toBe(1);
    expect(clampedLevels(intolerance, "two")).toBe(1);
  });
});

describe("stepping a skill, technique or spell", () => {
  it("walks the Skill Cost Table for a skill", () => {
    const skill = (points: number) => ({ type: "skill", system: { points, difficulty: "A" } });
    expect(steppedPoints(skill(0), "up")).toBe(1);
    expect(steppedPoints(skill(1), "up")).toBe(2);
    expect(steppedPoints(skill(2), "up")).toBe(4);
    expect(steppedPoints(skill(8), "up")).toBe(12);
    expect(steppedPoints(skill(4), "down")).toBe(2);
    expect(steppedPoints(skill(0), "down")).toBe(0);
  });

  it("charges a wildcard three times each figure", () => {
    expect(steppedPoints({ type: "skill", system: { points: 0, difficulty: "W" } }, "up")).toBe(3);
  });

  it("buys a technique a level at a time", () => {
    expect(steppedPoints({ type: "technique", system: { points: 0, difficulty: "A" } }, "up")).toBe(1);
    expect(steppedPoints({ type: "technique", system: { points: 3, difficulty: "A" } }, "up")).toBe(4);
    expect(steppedPoints({ type: "technique", system: { points: 0, difficulty: "H" } }, "up")).toBe(2);
  });

  it("walks the table a spell's style says", () => {
    const spell = (style: string) => ({ type: "spell", system: { points: 2, difficulty: "H", derived: { style } } });
    expect(steppedPoints(spell("standard"), "up")).toBe(4);
    expect(steppedPoints(spell("ritual"), "up")).toBe(3);
  });
});

describe("stepping a levelled trait", () => {
  it("moves a level at a time and never below none", () => {
    expect(steppedLevels({ system: { levels: 2 } }, "up")).toBe(3);
    expect(steppedLevels({ system: { levels: 2 } }, "down")).toBe(1);
    expect(steppedLevels({ system: { levels: 0 } }, "down")).toBe(0);
  });

  it("stops at the printed cap", () => {
    expect(steppedLevels({ system: { levels: 3, maxLevels: 3 } }, "up")).toBe(3);
  });
});
