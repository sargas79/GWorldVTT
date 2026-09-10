import { describe, expect, it } from "vitest";

import { summarise } from "../item-summary.js";

/**
 * The summary is what makes one row tellable from another. There are 630
 * skills, and a list of 630 bare names is not a list anyone can pick from.
 */
describe("summarise", () => {
  it("gives a skill its attribute and difficulty", () => {
    expect(summarise("skill", { attribute: "DX", difficulty: "A" })).toBe("DX/A");
  });

  it("gives a technique its prerequisite and default penalty", () => {
    expect(summarise("technique", { prerequisite: "Karate", defaultModifier: -4 })).toBe("Karate -4");
  });

  it("names a technique with no penalty by its prerequisite alone", () => {
    expect(summarise("technique", { prerequisite: "Judo", defaultModifier: 0 })).toBe("Judo");
  });

  it("prices a flat trait, signed so an advantage reads as one", () => {
    expect(summarise("trait", { points: 15 })).toBe("+15");
    expect(summarise("trait", { points: -10 })).toBe("-10");
  });

  it("prices a levelled trait per level", () => {
    expect(summarise("trait", { points: 0, pointsPerLevel: 2 })).toBe("+2/level");
  });

  /** A tabled trait is not priced by any single figure, so it shows the table. */
  it("shows a tabled trait's steps", () => {
    expect(summarise("trait", { costTable: [10, 20, 30, 50, 75] })).toBe("10/20/30/50/75");
  });

  it("prefers the table over a per-level figure, as totalPoints does", () => {
    expect(summarise("trait", { pointsPerLevel: 5, costTable: [4, 12, 12] })).toBe("4/12/12");
  });

  it("gives armour its DR and a shield its DB", () => {
    expect(summarise("armor", { dr: 4 })).toBe("DR 4");
    expect(summarise("shield", { db: 2 })).toBe("DB 2");
  });

  it("gives gear its cost and weight", () => {
    expect(summarise("equipment", { cost: 500, weight: 3 })).toBe("$500, 3 lb");
  });

  it("says nothing rather than something wrong when there is nothing to say", () => {
    expect(summarise("equipment", {})).toBe("");
    expect(summarise("skill", {})).toBe("?/?");
  });
});
