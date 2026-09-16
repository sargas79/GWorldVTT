import { describe, expect, it } from "vitest";

import { steppedLevels, steppedPoints } from "../advancement.js";

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
