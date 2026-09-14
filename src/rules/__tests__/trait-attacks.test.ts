import { describe, expect, it } from "vitest";

import {
  attackAttribute,
  levelledDamage,
  longDistanceModifier,
  maledictionRangeModifier,
} from "../trait-attacks.js";

describe("damage per level", () => {
  it("multiplies the dice and the adds by the levels held", () => {
    // An attack bought as "1d burning damage per level".
    expect(levelledDamage("1d", 3)).toBe("3d");
    // And one bought as "1d-1 fatigue damage per level".
    expect(levelledDamage("1d-1", 3)).toBe("3d-3");
    expect(levelledDamage("2d+1", 2)).toBe("4d+2");
  });

  it("counts a trait below its first level as that level", () => {
    expect(levelledDamage("1d", 0)).toBe("1d");
  });

  it("leaves what is not dice alone", () => {
    expect(levelledDamage("spec.", 4)).toBe("spec.");
  });
});

describe("the attribute an attack rolls against", () => {
  it("reads an attribute named where a skill would be", () => {
    expect(attackAttribute("Will")).toBe("Will");
    expect(attackAttribute("ST:Will")).toBe("Will");
    expect(attackAttribute("Perception")).toBe("Per");
    expect(attackAttribute("Innate Attack (Beam)")).toBe(null);
  });
});

/** Characters p. 241, "If the distance falls between two values, use the higher." */
describe("Long-Distance Modifiers", () => {
  it("costs nothing to 200 yards", () => {
    expect(longDistanceModifier(0)).toBe(0);
    expect(longDistanceModifier(200)).toBe(0);
  });

  it("reads the table, taking the higher penalty between rows", () => {
    expect(longDistanceModifier(201)).toBe(-1);
    expect(longDistanceModifier(880)).toBe(-1);
    expect(longDistanceModifier(1760)).toBe(-2);
    expect(longDistanceModifier(1760 * 5)).toBe(-4);
    expect(longDistanceModifier(1760 * 1000)).toBe(-8);
  });

  it("adds -2 per further factor of ten", () => {
    expect(longDistanceModifier(1760 * 10_000)).toBe(-10);
    expect(longDistanceModifier(1760 * 50_000)).toBe(-12);
  });
});

/** Characters p. 106: the three prices of Malediction are three range penalties. */
describe("a Malediction's range penalty", () => {
  it("is -1 a yard at the first level", () => {
    expect(maledictionRangeModifier(1, 7)).toBe(-7);
  });

  it("reads the Size and Speed/Range Table at the second", () => {
    expect(maledictionRangeModifier(2, 10)).toBe(-4);
    expect(maledictionRangeModifier(2, 2)).toBe(0);
  });

  it("uses the Long-Distance Modifiers at the third", () => {
    expect(maledictionRangeModifier(3, 150)).toBe(0);
    expect(maledictionRangeModifier(3, 1760)).toBe(-2);
  });

  it("is nothing for an attack that is not a Malediction", () => {
    expect(maledictionRangeModifier(0, 500)).toBe(0);
  });
});
