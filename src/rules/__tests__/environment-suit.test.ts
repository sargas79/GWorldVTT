import { describe, expect, it } from "vitest";

import { ENVIRONMENT_SUITS, suitedLevel } from "../skills.js";

/** Characters p. 192. */
describe("Environment Suit skill", () => {
  it("holds DX and DX-based skills to the suit skill while suited up", () => {
    expect(suitedLevel(14, 12)).toBe(12);
    expect(suitedLevel(11, 12)).toBe(11);
    expect(suitedLevel(14, null)).toBe(14);
    expect(ENVIRONMENT_SUITS).toContain("Vacc Suit");
  });
});
