import { describe, expect, it } from "vitest";

import * as rules from "../index.js";
import { hearingDistanceModifier } from "../senses.js";

/** The Hearing Distance Table (Campaigns p. 358; sargas79/GWorldVTT#731). */
describe("the Hearing Distance Table", () => {
  it("is 0 at the sound's own distance, and a point a step either way", () => {
    expect(hearingDistanceModifier(1, 1)).toBe(0);
    expect(hearingDistanceModifier(2, 1)).toBe(-1);
    expect(hearingDistanceModifier(0.5, 1)).toBe(1);
    expect(hearingDistanceModifier(0.25, 1)).toBe(2);
  });

  it("puts normal conversation at 8 yards at -3", () => {
    expect(hearingDistanceModifier(8, 1)).toBe(-3);
  });

  it("reads every printed row as its own step", () => {
    // Leaves rustling (1/4 yd) against each louder row out to 512 yards.
    for (let n = 0; n <= 11; n += 1) expect(hearingDistanceModifier(0.25 * 2 ** n, 0.25)).toBe(n === 0 ? 0 : -n);
    expect(hearingDistanceModifier(0.25, 512)).toBe(11);
  });

  it("counts only whole steps between two rows", () => {
    // Farther: 5 yd from a 1-yd sound is past 4, so the 8-yd step.
    expect(hearingDistanceModifier(5, 1)).toBe(-3);
    expect(hearingDistanceModifier(4.01, 1)).toBe(-3);
    // Nearer: 0.3 yd from a 1-yd sound has passed 1/2 but not 1/4.
    expect(hearingDistanceModifier(0.3, 1)).toBe(1);
    expect(hearingDistanceModifier(0.9, 1)).toBe(0);
    expect(hearingDistanceModifier(1.1, 1)).toBe(-1);
  });

  it("gives nothing without two distances above 0", () => {
    expect(hearingDistanceModifier(0, 1)).toBe(0);
    expect(hearingDistanceModifier(-4, 1)).toBe(0);
    expect(hearingDistanceModifier(8, 0)).toBe(0);
    expect(hearingDistanceModifier(Number.NaN, 1)).toBe(0);
    expect(hearingDistanceModifier(Number.POSITIVE_INFINITY, 1)).toBe(0);
    expect(hearingDistanceModifier("8" as unknown as number, 1)).toBe(-3);
  });

  it("goes on past the table's rows", () => {
    expect(hearingDistanceModifier(4096, 1)).toBe(-12);
  });

  it("is in the rules namespace modules read", () => {
    expect(rules.hearingDistanceModifier).toBe(hearingDistanceModifier);
  });
});
