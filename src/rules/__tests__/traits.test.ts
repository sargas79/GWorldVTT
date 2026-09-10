import { describe, expect, it } from "vitest";

import { traitCostLabel, traitLevelName, traitPoints, type TraitCost } from "../traits.js";

const flat = (points: number): TraitCost => ({
  points,
  levels: 0,
  pointsPerLevel: 0,
  costTable: [],
});

const perLevel = (pointsPerLevel: number, levels: number): TraitCost => ({
  points: 0,
  levels,
  pointsPerLevel,
  costTable: [],
});

const tabled = (costTable: number[], levels: number): TraitCost => ({
  points: 0,
  levels,
  pointsPerLevel: 0,
  costTable,
});

/** Wealth, p. 25: Comfortable through Multimillionaire. */
const WEALTH = [10, 20, 30, 50, 75];
/** Appearance, p. 21: Attractive, Beautiful, Handsome, Very Beautiful, Very Handsome, Transcendent. */
const APPEARANCE = [4, 12, 12, 16, 16, 20];

describe("traitPoints", () => {
  it("charges a flat trait its own cost", () => {
    expect(traitPoints(flat(15))).toBe(15);
  });

  it("multiplies an evenly priced trait by its levels", () => {
    expect(traitPoints(perLevel(2, 3))).toBe(6);
    expect(traitPoints(perLevel(-5, 2))).toBe(-10);
  });

  it("reads a tabled trait's cost off the table", () => {
    expect(traitPoints(tabled(WEALTH, 1))).toBe(10);
    expect(traitPoints(tabled(WEALTH, 4))).toBe(50);
  });

  /**
   * The step that makes a per-level figure impossible: Beautiful and Handsome
   * both cost 12, so the table's third step is no more than its second.
   */
  it("keeps a table's uneven steps", () => {
    expect(traitPoints(tabled(APPEARANCE, 2))).toBe(12);
    expect(traitPoints(tabled(APPEARANCE, 3))).toBe(12);
    expect(traitPoints(tabled(APPEARANCE, 6))).toBe(20);
  });

  it("treats a tabled trait with no level set as its first step", () => {
    expect(traitPoints(tabled(WEALTH, 0))).toBe(10);
  });

  it("holds at the last step rather than extrapolating past the table", () => {
    expect(traitPoints(tabled(WEALTH, 9))).toBe(75);
  });

  it("prefers the table over a per-level figure, if both are somehow set", () => {
    expect(traitPoints({ points: 99, levels: 2, pointsPerLevel: 7, costTable: WEALTH })).toBe(20);
  });
});

describe("traitLevelName", () => {
  const wealth = ["Comfortable", "Wealthy", "Very Wealthy", "Filthy Rich", "Multimillionaire 1"];

  it("names the level a player would name", () => {
    expect(traitLevelName(wealth, 4)).toBe("Filthy Rich");
  });

  it("returns null past the end", () => {
    expect(traitLevelName(wealth, 12)).toBeNull();
  });

  /** Combat Reflexes names its second step and not its first. */
  it("returns null for a level left unnamed", () => {
    expect(traitLevelName(["", "Enhanced Time Sense"], 1)).toBeNull();
    expect(traitLevelName(["", "Enhanced Time Sense"], 2)).toBe("Enhanced Time Sense");
  });
});

describe("traitCostLabel", () => {
  it("says what a player would say", () => {
    expect(traitCostLabel(flat(15))).toBe("15");
    expect(traitCostLabel(perLevel(2, 0))).toBe("2/level");
    expect(traitCostLabel(tabled(WEALTH, 0))).toBe("10/20/30/50/75");
  });
});
