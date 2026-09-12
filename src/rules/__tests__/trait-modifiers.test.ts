import { describe, expect, it } from "vitest";

import {
  MIN_NET_MODIFIER,
  SELF_CONTROL_MULTIPLIERS,
  modifiedPoints,
  netModifier,
  traitPoints,
} from "../traits.js";

/**
 * Enhancements and limitations (GURPS Basic Set: Characters pp. 101-102), and
 * self-control numbers on disadvantages (pp. 120-121).
 */
describe("netModifier", () => {
  it("adds enhancements and limitations together", () => {
    expect(netModifier([20, -10, -5])).toBe(5);
    expect(netModifier([])).toBe(0);
  });

  /** "The net modifier can never be less than -80%." */
  it("floors the net at -80%", () => {
    expect(netModifier([-50, -50])).toBe(MIN_NET_MODIFIER);
    expect(MIN_NET_MODIFIER).toBe(-80);
  });
});

describe("modifiedPoints", () => {
  it("scales the base cost by the net modifier", () => {
    expect(modifiedPoints(10, [20])).toBe(12);
    expect(modifiedPoints(10, [-50])).toBe(5);
  });

  /** A fraction rounds away from zero: 6.5 becomes 7, and -6.5 becomes -7. */
  it("rounds a fraction away from zero, for advantages and disadvantages alike", () => {
    expect(modifiedPoints(5, [30])).toBe(7);
    expect(modifiedPoints(-5, [30])).toBe(-7);
    expect(modifiedPoints(5, [-70])).toBe(2);
  });

  it("applies a self-control number to a disadvantage", () => {
    expect(SELF_CONTROL_MULTIPLIERS).toEqual({ 6: 2, 9: 1.5, 12: 1, 15: 0.5 });
    expect(modifiedPoints(-10, [], 6)).toBe(-20);
    expect(modifiedPoints(-10, [], 9)).toBe(-15);
    expect(modifiedPoints(-10, [], 12)).toBe(-10);
    expect(modifiedPoints(-10, [], 15)).toBe(-5);
    expect(modifiedPoints(-15, [], 9)).toBe(-23);
  });

  it("ignores a self-control number it does not know", () => {
    expect(modifiedPoints(-10, [], 7)).toBe(-10);
    expect(modifiedPoints(-10, [], null)).toBe(-10);
  });

  it("applies both, the self-control number first", () => {
    // Bad Temper (9) is -15; with a -20% limitation it is -12.
    expect(modifiedPoints(-10, [-20], 9)).toBe(-12);
  });
});

describe("traitPoints with modifiers", () => {
  const cost = { points: 15, levels: 0, pointsPerLevel: 0, costTable: [] };

  it("prices a flat trait after its modifiers", () => {
    expect(traitPoints({ ...cost, modifiers: [-20] })).toBe(12);
  });

  it("prices a levelled trait's total after its modifiers", () => {
    expect(traitPoints({ points: 0, levels: 3, pointsPerLevel: 10, costTable: [], modifiers: [50] })).toBe(45);
  });

  it("prices a disadvantage by its control number", () => {
    expect(traitPoints({ points: -10, levels: 0, pointsPerLevel: 0, costTable: [], selfControl: 6 })).toBe(-20);
  });

  it("is unchanged without any", () => {
    expect(traitPoints(cost)).toBe(15);
    expect(traitPoints({ ...cost, modifiers: [], selfControl: null })).toBe(15);
  });
});
