import { describe, expect, it } from "vitest";
import {
  bandForYards,
  bandPenalty,
  closeContactShot,
  combinedCoverage,
  coverageProtects,
  largeTargetWounding,
  mayDodgeFirearm,
  nonCombatBonus,
  rangedRapidStrikeAllowed,
  shiftBand,
  splitRateOfFire,
  strikeAroundPenalty,
} from "../revised-ranged.js";
import { injuryToleranceFrom, toleratedWoundingModifier } from "../injury-tolerance.js";

describe("close-contact shots", () => {
  it("gives +4 pressed, +3 more over All-Out's +1, +1 braced", () => {
    const r = closeContactShot({ contact: "pressed", allOutDetermined: true, braced: true, unresisting: false });
    expect(r).toMatchObject({ toHit: 8, pressed: 4, allOutExtra: 3, braced: 1, targetDefenseBonus: 2, cancelsRunaround: true, bulkApplies: true });
  });
  it("touching gives no defense bonus; unresisting drops Bulk", () => {
    const r = closeContactShot({ contact: "touching", allOutDetermined: false, braced: false, unresisting: true });
    expect(r).toMatchObject({ toHit: 0, targetDefenseBonus: 0, bulkApplies: false, targetMayParry: true, noAimBonuses: true });
  });
});

describe("non-combat bonuses", () => {
  it("adds up to +10 and skips pressure bonuses for people", () => {
    const all = { noRiskToSelf: true, noRiskToOthers: true, noStake: true, environment: 4, rangeAndSpeedKnown: true };
    expect(nonCombatBonus({ ...all, targetIsPerson: false })).toBe(10);
    expect(nonCombatBonus({ ...all, targetIsPerson: true })).toBe(7);
    expect(nonCombatBonus({ ...all, environment: 9, targetIsPerson: false })).toBe(10);
  });
});

describe("partial coverage", () => {
  it("adds coverage and rolls n or less to protect", () => {
    expect(combinedCoverage([2, 3])).toBe(5);
    expect(combinedCoverage([4, 4])).toBe(6);
    expect(coverageProtects(3, 3)).toBe(true);
    expect(coverageProtects(3, 4)).toBe(false);
  });
  it("penalises striking around", () => {
    expect([1, 2, 3, 4, 5, 6].map(strikeAroundPenalty)).toEqual([-1, -1, -2, -3, -4, 0]);
  });
});

describe("restricted dodge and tricky shooting", () => {
  it("dodges only the declared shooter", () => {
    const d = { shooter: "a", maneuver: "move", acrobaticRolledOnTurn: false, droppedProneAtEnd: false };
    expect(mayDodgeFirearm(d, "a")).toBe(true);
    expect(mayDodgeFirearm(d, "b")).toBe(false);
    expect(mayDodgeFirearm({ ...d, maneuver: "aim" }, "a")).toBe(false);
    expect(mayDodgeFirearm(null, "a")).toBe(false);
  });
  it("rapid strike needs RoF 2+ and no dual weapon; splits the RoF", () => {
    expect(rangedRapidStrikeAllowed(1, false)).toBe(false);
    expect(rangedRapidStrikeAllowed(3, true)).toBe(false);
    expect(rangedRapidStrikeAllowed(3, false)).toBe(true);
    expect(splitRateOfFire(3, 1)).toEqual([1, 2]);
    expect(splitRateOfFire(3, 3)).toBeNull();
  });
});

describe("simplified range", () => {
  it("reads bands", () => {
    expect(bandForYards(5)).toBe("close");
    expect(bandForYards(6)).toBe("short");
    expect(bandForYards(100)).toBe("medium");
    expect(bandForYards(500)).toBe("long");
    expect(bandForYards(501)).toBe("extreme");
    expect(bandPenalty("long")).toBe(-11);
  });
  it("shifts only at Close and Short", () => {
    expect(shiftBand("close", "farther")).toBe("short");
    expect(shiftBand("short", "closer")).toBe("close");
    expect(shiftBand("medium", "closer")).toBe("medium");
  });
});

describe("large targets", () => {
  it("follows the table", () => {
    expect(largeTargetWounding("pi", 4, false)).toBe(1 / 3);
    expect(largeTargetWounding("pi+", 6, false)).toBe(1 / 3);
    expect(largeTargetWounding("imp", 8, false)).toBe(1 / 3);
    expect(largeTargetWounding("pi-", 13, false)).toBe(1 / 200);
    expect(largeTargetWounding("cut", 9, false)).toBeNull();
  });
  it("shifts a row for Homogenous", () => {
    expect(largeTargetWounding("pi", 5, true)).toBe(largeTargetWounding("pi", 7, false));
    expect(largeTargetWounding("pi-", 20, true)).toBe(1 / 200);
  });
  it("replaces the fixed figures only when the SM is set", () => {
    const unliving = injuryToleranceFrom(["Injury Tolerance (Unliving)"]);
    expect(toleratedWoundingModifier("pi", unliving)).toBe(1 / 3);
    expect(toleratedWoundingModifier("pi", { ...unliving, largeTargetSm: 9 })).toBe(1 / 20);
  });
});
