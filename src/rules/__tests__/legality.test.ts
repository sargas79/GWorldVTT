import { describe, expect, it } from "vitest";

import {
  LEGALITY_CLASS_NAMES,
  isLegalityClass,
  isRestricted,
  legalityUnder,
  licenseCost,
} from "../legality.js";

describe("Control Rating and Legality Class (Campaigns p. 507)", () => {
  it("lets any citizen carry an item whose LC is above the CR", () => {
    // A sword (LC4) in a CR3 society.
    expect(legalityUnder(4, 3)).toBe("open");
    expect(legalityUnder(4, 0)).toBe("open");
  });

  it("registers an item whose LC equals the CR, with no permit fee", () => {
    expect(legalityUnder(3, 3)).toBe("registered");
    expect(isRestricted("registered")).toBe(false);
  });

  it("licenses an item one below the CR", () => {
    // A handgun (LC3) in a CR4 society.
    expect(legalityUnder(3, 4)).toBe("licensed");
    expect(isRestricted("licensed")).toBe(true);
  });

  it("prohibits an item two below, and keeps three or more below for the military", () => {
    expect(legalityUnder(2, 4)).toBe("prohibited");
    expect(legalityUnder(1, 4)).toBe("military");
    expect(legalityUnder(0, 6)).toBe("military");
  });

  it("treats an item with no LC as open anywhere", () => {
    // "Ordinary clothing and tools normally do not require a LC" (Characters p. 267).
    expect(legalityUnder(null, 6)).toBe("open");
  });

  it("prices a license at 1d x 10% of the item", () => {
    expect(licenseCost(1000, 1)).toBe(100);
    expect(licenseCost(1000, 6)).toBe(600);
    // The die is a die: nothing below 1 or above 6.
    expect(licenseCost(1000, 9)).toBe(600);
    expect(licenseCost(1000, 0)).toBe(100);
  });

  it("names the five classes as the book does", () => {
    expect(LEGALITY_CLASS_NAMES[0]).toBe("banned");
    expect(LEGALITY_CLASS_NAMES[4]).toBe("open");
    expect(isLegalityClass(4)).toBe(true);
    expect(isLegalityClass(5)).toBe(false);
    expect(isLegalityClass(null)).toBe(false);
  });
});
