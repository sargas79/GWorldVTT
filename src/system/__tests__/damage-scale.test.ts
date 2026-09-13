import { describe, expect, it } from "vitest";

import { damageAtScale, hitPointsAfterBattle } from "../damage-scale.js";

/** A battle fought ten or a hundred to one (GURPS Basic Set: Campaigns p. 470). */
describe("damageAtScale", () => {
  it("takes a tank gun's 6dx10 down to 6d at a tenth", () => {
    expect(damageAtScale({ damage: "6dx10", scale: "decade" })).toBe("6d");
  });

  it("gives a small gun a small die rather than nothing", () => {
    // "If the converted damage is under 1d, treat fractions up to 0.25 as 1d-3,
    // fractions up to 0.5 as 1d-2, and larger fractions as 1d-1."
    expect(damageAtScale({ damage: "2d", scale: "decade" })).toBe("1d-3");
    expect(damageAtScale({ damage: "4d", scale: "decade" })).toBe("1d-2");
    expect(damageAtScale({ damage: "7d", scale: "decade" })).toBe("1d-1");
  });

  it("says nothing for something that is not dice", () => {
    expect(damageAtScale({ damage: "spec.", scale: "decade" })).toBe(null);
  });
});

describe("hitPointsAfterBattle", () => {
  it("multiplies what is left back up", () => {
    // "After the battle, multiply remaining HP by 10 or 100, as appropriate."
    expect(hitPointsAfterBattle({ remaining: 4, scale: "decade" })).toBe(40);
    expect(hitPointsAfterBattle({ remaining: 4, scale: "century" })).toBe(400);
  });
});
