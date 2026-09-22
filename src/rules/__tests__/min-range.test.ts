import { describe, expect, it } from "vitest";

import { insideMinimumRange } from "../ranged.js";

/**
 * A weapon that cannot hit a target closer than its minimum range: the Basic
 * Set's grenade launcher, ATGM and SAM (Characters p. 281, note 1).
 */
describe("insideMinimumRange", () => {
  it("is inside short of the minimum, and clear of it at the minimum and beyond", () => {
    expect(insideMinimumRange(9, 10)).toBe(true);
    expect(insideMinimumRange(0, 10)).toBe(true);
    expect(insideMinimumRange(10, 10)).toBe(false);
    expect(insideMinimumRange(250, 200)).toBe(false);
  });

  it("reads a fractional minimum as it is", () => {
    expect(insideMinimumRange(17, 17.5)).toBe(true);
    expect(insideMinimumRange(18, 17.5)).toBe(false);
  });

  it("never refuses a weapon with no minimum, or a range nobody knows", () => {
    expect(insideMinimumRange(0, 0)).toBe(false);
    expect(insideMinimumRange(3, -5)).toBe(false);
    expect(insideMinimumRange(Number.NaN, 10)).toBe(false);
  });
});
