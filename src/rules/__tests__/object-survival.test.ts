import { describe, expect, it } from "vitest";

import { objectSurvivalChecks } from "../objects.js";

describe("the HT rolls a damaged thing makes (Campaigns p. 484)", () => {
  it("calls for none above -1xHP", () => {
    expect(objectSurvivalChecks(10, 0, 10)).toEqual([]);
    expect(objectSurvivalChecks(10, -9, 10)).toEqual([]);
  });

  it("calls for one at -1xHP, and one more at each multiple the blow reaches", () => {
    expect(objectSurvivalChecks(10, -10, 10)).toEqual([1]);
    expect(objectSurvivalChecks(10, -35, 10)).toEqual([1, 2, 3]);
    // A multiple already passed is not rolled for again.
    expect(objectSurvivalChecks(-12, -25, 10)).toEqual([2]);
  });

  it("calls for none where the blow reaches -5xHP, which destroys without a roll", () => {
    expect(objectSurvivalChecks(10, -50, 10)).toEqual([]);
  });

  it("calls for none for a blow that did nothing, or a thing with no hit points", () => {
    expect(objectSurvivalChecks(-15, -15, 10)).toEqual([]);
    expect(objectSurvivalChecks(0, -5, 0)).toEqual([]);
  });
});
