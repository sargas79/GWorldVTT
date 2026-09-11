import { describe, expect, it } from "vitest";

import { penalty, totalPenalty } from "../modifiers.js";

describe("building a modifier that prints correctly", () => {
  it("negates what it is given", () => {
    expect(penalty(1)).toBe(-1);
    expect(penalty(6)).toBe(-6);
  });

  /** The whole reason this exists: `-0` prints as "-0" on a chat card. */
  it("gives a positive zero for no penalty at all", () => {
    expect(Object.is(penalty(0), 0)).toBe(true);
    expect(Object.is(penalty(0), -0)).toBe(false);
  });

  it("treats a negative size as no penalty rather than a bonus", () => {
    expect(Object.is(penalty(-3), 0)).toBe(true);
  });

  it("adds several penalties up", () => {
    expect(totalPenalty(1, 2)).toBe(-3);
    expect(totalPenalty(0, 4)).toBe(-4);
  });

  it("still gives a positive zero when every part is zero", () => {
    expect(Object.is(totalPenalty(0, 0), 0)).toBe(true);
    expect(Object.is(totalPenalty(), 0)).toBe(true);
  });
});
