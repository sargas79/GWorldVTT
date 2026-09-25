import { describe, expect, it } from "vitest";

import { HOLDOUT_SIZES, holdoutClothingModifier, holdoutLevel, holdoutMovingModifier, holdoutSizeModifier, searchLevel } from "../holdout.js";

/** Holdout (Characters p. 200). */
describe("Holdout's size table", () => {
  it("runs from +4 to -6, a point a row", () => {
    expect(HOLDOUT_SIZES.map((row) => row.modifier)).toEqual([4, 3, 2, 1, 0, -1, -2, -3, -4, -5, -6]);
  });

  it("takes a row's key or a number, and nothing else", () => {
    expect(holdoutSizeModifier("handgun")).toBe(-2);
    expect(holdoutSizeModifier("crossbow")).toBe(-6);
    expect(holdoutSizeModifier(-3)).toBe(-3);
    expect(holdoutSizeModifier("-1")).toBe(-1);
    expect(holdoutSizeModifier(2.7)).toBe(2);
    expect(holdoutSizeModifier("bazooka")).toBeNull();
    expect(holdoutSizeModifier("")).toBeNull();
    expect(holdoutSizeModifier(undefined)).toBeNull();
    expect(holdoutSizeModifier(Number.NaN)).toBeNull();
  });
});

describe("a thing that moves or makes noise", () => {
  it("is -1, or worse where the caller says so", () => {
    expect(holdoutMovingModifier(true)).toBe(-1);
    expect(holdoutMovingModifier(-3)).toBe(-3);
    expect(holdoutMovingModifier(-0.5)).toBe(-1);
    expect(holdoutMovingModifier(false)).toBe(0);
    expect(holdoutMovingModifier(2)).toBe(0);
  });
});

describe("what Holdout and Search are rolled at", () => {
  it("uses the skill, or the better of IQ-5 and Sleight of Hand-3", () => {
    expect(holdoutLevel({ holdout: 13, iq: 12, sleightOfHand: null })).toEqual({ level: 13, from: "Holdout" });
    expect(holdoutLevel({ holdout: null, iq: 12, sleightOfHand: null })).toEqual({ level: 7, from: "IQ" });
    expect(holdoutLevel({ holdout: null, iq: 12, sleightOfHand: 14 })).toEqual({ level: 11, from: "Sleight of Hand" });
    // A skill bought lower than a default is rolled at the default.
    expect(holdoutLevel({ holdout: 8, iq: 12, sleightOfHand: 14 })).toEqual({ level: 11, from: "Sleight of Hand" });
  });

  it("rolls Search, or Perception-5", () => {
    expect(searchLevel({ search: 12, per: 12 })).toEqual({ level: 12, from: "Search" });
    expect(searchLevel({ search: null, per: 12 })).toEqual({ level: 7, from: "Per" });
    expect(searchLevel({ search: 5, per: 12 })).toEqual({ level: 7, from: "Per" });
  });

  it("takes Criminology-5 where it is the best of the three (p. 219)", () => {
    expect(searchLevel({ search: null, per: 10, criminology: 14 })).toEqual({ level: 9, from: "Criminology" });
    expect(searchLevel({ search: 8, per: 10, criminology: 14 })).toEqual({ level: 9, from: "Criminology" });
    expect(searchLevel({ search: 12, per: 10, criminology: 14 })).toEqual({ level: 12, from: "Search" });
    expect(searchLevel({ search: null, per: 12, criminology: 11 })).toEqual({ level: 7, from: "Per" });
  });
});

describe("what the character wears", () => {
  it("is held to -7..+5 (p. 200)", () => {
    expect(holdoutClothingModifier(3)).toBe(3);
    expect(holdoutClothingModifier(9)).toBe(5);
    expect(holdoutClothingModifier(-10)).toBe(-7);
    expect(holdoutClothingModifier("x")).toBe(0);
    expect(holdoutClothingModifier(undefined)).toBe(0);
  });
});
