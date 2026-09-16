import { describe, expect, it } from "vitest";

import { attributeImprovement, isLevelled, itemImprovement, secondaryImprovement, traitImprovement } from "../sheet-v2/improvements.js";

describe("improving a skill", () => {
  const stealth = { type: "skill", system: { points: 4, difficulty: "A", derived: { level: 14, relativeLevel: 1 } } };

  it("prices the next level off the Skill Cost Table and carries every bonus over", () => {
    expect(itemImprovement(stealth, 10)).toEqual({ from: 4, to: 8, levelFrom: 14, levelTo: 15, cost: 4, overspends: false, overBy: 0 });
  });

  /** An upgrade is never refused for want of points: it is flagged. */
  it("flags a step that spends past the budget, with how far", () => {
    const step = itemImprovement(stealth, 1)!;
    expect(step.overspends).toBe(true);
    expect(step.overBy).toBe(3);
  });

  it("buys an untrained skill off its attribute", () => {
    const untrained = { type: "skill", system: { points: 0, difficulty: "A", derived: { level: 8, relativeLevel: null } } };
    expect(itemImprovement(untrained, 10, 13)).toMatchObject({ from: 0, to: 1, levelFrom: 8, levelTo: 12, cost: 1 });
  });

  it("moves a technique a level a point", () => {
    const technique = { type: "technique", system: { points: 2, difficulty: "A", derived: { level: 12 } } };
    expect(itemImprovement(technique, 5)).toMatchObject({ from: 2, to: 3, levelFrom: 12, levelTo: 13, cost: 1 });
  });

  it("prices a standard spell like a skill", () => {
    const spell = { type: "spell", system: { points: 1, difficulty: "H", derived: { level: 9, relativeLevel: -2, style: "standard" } } };
    expect(itemImprovement(spell, 5)).toMatchObject({ from: 1, to: 2, levelTo: 10, cost: 1 });
  });
});

describe("improving a trait", () => {
  it("prices the next level of a trait bought per level", () => {
    const nightVision = { system: { points: 0, levels: 1, pointsPerLevel: 1, maxLevels: 9 } };
    expect(traitImprovement(nightVision, 3)).toMatchObject({ from: 1, to: 2, cost: 1, overspends: false });
  });

  it("reads a cost table", () => {
    const wealth = { system: { points: 0, levels: 1, costTable: [10, 20, 30], pointsPerLevel: 0 } };
    expect(traitImprovement(wealth, 0)).toMatchObject({ from: 1, to: 2, cost: 10, overspends: true, overBy: 10 });
  });

  it("applies the trait's modifiers to the price", () => {
    const limited = { system: { points: 0, levels: 1, pointsPerLevel: 10, modifiers: [{ value: -50 }] } };
    expect(traitImprovement(limited, 20)!.cost).toBe(5);
  });

  it("gives points back for a further level of a disadvantage, and never overspends", () => {
    const bad = { system: { points: 0, levels: 1, pointsPerLevel: -5 } };
    expect(traitImprovement(bad, 0)).toMatchObject({ cost: -5, overspends: false });
  });

  it("has nothing to offer for a flat trait or one at its cap", () => {
    expect(isLevelled({ system: { points: 15 } })).toBe(false);
    expect(traitImprovement({ system: { points: 15 } }, 10)).toBeNull();
    expect(traitImprovement({ system: { levels: 3, maxLevels: 3, pointsPerLevel: 2 } }, 10)).toBeNull();
  });
});

describe("improving attributes and secondary characteristics", () => {
  it("charges 20 a point for DX and 10 for ST", () => {
    expect(attributeImprovement("DX", 13, 30)).toMatchObject({ from: 13, to: 14, cost: 20 });
    expect(attributeImprovement("ST", 10, 5)).toMatchObject({ cost: 10, overspends: true, overBy: 5 });
  });

  it("charges each secondary characteristic its own rate", () => {
    expect(secondaryImprovement("hp", 0, 10, 10)).toMatchObject({ from: 0, to: 1, levelFrom: 10, levelTo: 11, cost: 2 });
    expect(secondaryImprovement("basicSpeed", 0.25, 6.25, 10)).toMatchObject({ to: 0.5, levelTo: 6.5, cost: 5 });
  });
});
