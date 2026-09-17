import { describe, expect, it } from "vitest";

import { blastAt, collateralDamage } from "../explosions.js";

/** A blast that falls off by the distance rather than three times it (sargas79/GWorldVTT#484). */
describe("an explosion's divisor per yard (since API 1.63.0)", () => {
  it("divides by three times the distance unless told otherwise", () => {
    expect(collateralDamage(60, 2)).toBe(10);
    expect(collateralDamage(60, 2, 1)).toBe(30);
  });

  it("reaches further for a smaller divisor", () => {
    // 2 dice reach 4 yards at the Basic Set's figure; at 1 per yard, 12.
    expect(blastAt({ rolledDamage: 60, distanceYards: 6, diceOfDamage: 2 }).outOfRange).toBe(true);
    expect(blastAt({ rolledDamage: 60, distanceYards: 6, diceOfDamage: 2, divisorPerYard: 1 })).toMatchObject({ outOfRange: false, damage: 10 });
  });
});
