import { describe, expect, it } from "vitest";

import { attackRateOfFire, sprayingFire, suppressionSkillCap, suppressionZones } from "../ranged.js";
import { inBand, inShape, segmentCrossesBand, segmentCrossesShape, type ModifierArea } from "../modifier-areas.js";

/** Spraying Fire and Suppression Fire, Campaigns p. 409 (sargas79/GWorldVTT#593). */
describe("Spraying Fire", () => {
  it("resolves the book's three-target example", () => {
    // RoF 15, Rcl 2: 5 shots, 1 wasted over 2 yards, 4 shots, 3 wasted over 4 yards, 2 shots.
    const spray = sprayingFire({
      rateOfFire: 15,
      recoil: 2,
      targets: [{ shots: 5 }, { shots: 4, yardsFromPrevious: 2 }, { shots: 2, yardsFromPrevious: 4 }],
    });
    expect(spray.attacks).toEqual([
      { shots: 5, recoil: 2, wasted: 0 },
      { shots: 4, recoil: 3, wasted: 1 },
      { shots: 2, recoil: 4, wasted: 3 },
    ]);
    expect(spray.shotsUsed).toBe(15);
    expect(spray.problem).toBeNull();
  });

  it("wastes nothing between targets a yard apart, and two shots a yard above RoF 16", () => {
    expect(sprayingFire({ rateOfFire: 10, recoil: 2, targets: [{ shots: 3 }, { shots: 3, yardsFromPrevious: 1 }] }).attacks[1]!.wasted).toBe(0);
    expect(sprayingFire({ rateOfFire: 20, recoil: 2, targets: [{ shots: 3 }, { shots: 3, yardsFromPrevious: 3 }] }).attacks[1]!.wasted).toBe(4);
  });

  it("says why a spray can't be fired", () => {
    expect(sprayingFire({ rateOfFire: 4, recoil: 2, targets: [{ shots: 2 }, { shots: 2 }] }).problem).toBe("rateOfFire");
    expect(sprayingFire({ rateOfFire: 10, recoil: 2, targets: [{ shots: 5 }] }).problem).toBe("targets");
    expect(sprayingFire({ rateOfFire: 10, recoil: 2, targets: [{ shots: 5 }, { shots: 0 }] }).problem).toBe("noShots");
    // 5 + 4 wasted + 5 = 14 shots from a RoF 10 weapon.
    expect(sprayingFire({ rateOfFire: 10, recoil: 2, targets: [{ shots: 5 }, { shots: 5, yardsFromPrevious: 5 }] }).problem).toBe("tooManyShots");
  });
});

describe("Suppression Fire", () => {
  it("fires every shot into one zone", () => {
    expect(suppressionZones({ rateOfFire: 8, shots: 8, zones: 1 })).toEqual({ shotsPerZone: [8], problem: null });
  });

  it("shares shots over adjacent zones only at RoF 10+ and five a zone", () => {
    expect(suppressionZones({ rateOfFire: 20, shots: 17, zones: 3 })).toEqual({ shotsPerZone: [6, 6, 5], problem: null });
    expect(suppressionZones({ rateOfFire: 8, shots: 8, zones: 2 }).problem).toBe("tooManyZones");
    expect(suppressionZones({ rateOfFire: 20, shots: 9, zones: 2 }).problem).toBe("tooManyZones");
    expect(suppressionZones({ rateOfFire: 4, shots: 4, zones: 1 }).problem).toBe("rateOfFire");
    expect(suppressionZones({ rateOfFire: 10, shots: 12, zones: 1 }).problem).toBe("tooManyShots");
  });

  it("caps skill at 6, or 8 mounted, plus the rapid-fire bonus", () => {
    expect(suppressionSkillCap(5)).toBe(7);
    expect(suppressionSkillCap(10)).toBe(8);
    expect(suppressionSkillCap(10, true)).toBe(10);
    expect(suppressionSkillCap(30, true)).toBe(13);
  });

  it("keeps a zone as a band from the firer to where the fire lands", () => {
    const from = { x: 0, y: 0 };
    const center = { x: 100, y: 0 };
    expect(inBand({ x: 50, y: 9 }, from, center, 10)).toBe(true);
    expect(inBand({ x: 50, y: 11 }, from, center, 10)).toBe(false);
    expect(inBand({ x: 108, y: 0 }, from, center, 10)).toBe(true);
    expect(inBand({ x: 115, y: 0 }, from, center, 10)).toBe(false);
    // A path that crosses the band without stopping in it.
    expect(segmentCrossesBand({ x: 50, y: -40 }, { x: 50, y: 40 }, from, center, 10)).toBe(true);
    expect(segmentCrossesBand({ x: 50, y: 20 }, { x: 60, y: 40 }, from, center, 10)).toBe(false);

    const band: ModifierArea = { id: "b", label: "", center, radius: 10, from, lines: [] };
    const circle: ModifierArea = { id: "c", label: "", center, radius: 10, lines: [] };
    expect(inShape({ x: 50, y: 0 }, band)).toBe(true);
    expect(inShape({ x: 50, y: 0 }, circle)).toBe(false);
    expect(segmentCrossesShape({ x: 50, y: -40 }, { x: 50, y: 40 }, band)).toBe(true);
    expect(segmentCrossesShape({ x: 50, y: -40 }, { x: 50, y: 40 }, circle)).toBe(false);
  });
});

describe("an attack's Rate of Fire and Recoil (since API 1.70.0)", () => {
  it("is the weapon's where nothing changes it", () => {
    expect(attackRateOfFire({ rateOfFire: 10, recoil: 2 })).toEqual({ rateOfFire: 10, recoil: 2 });
    // A muscle-powered weapon keeps its Recoil 0.
    expect(attackRateOfFire({ rateOfFire: 1, recoil: 0 })).toEqual({ rateOfFire: 1, recoil: 0 });
  });

  it("is set above or below the weapon's, then multiplied", () => {
    expect(attackRateOfFire({ rateOfFire: 3, recoil: 2, setRateOfFire: 12 }).rateOfFire).toBe(12);
    expect(attackRateOfFire({ rateOfFire: 10, recoil: 2, setRateOfFire: 12, multiplier: 0.5 }).rateOfFire).toBe(6);
    expect(attackRateOfFire({ rateOfFire: 10, recoil: 2, setRateOfFire: 0 }).rateOfFire).toBe(10);
  });

  it("sets or adds to the Recoil, never below 1", () => {
    expect(attackRateOfFire({ rateOfFire: 10, recoil: 2, setRecoil: 4 }).recoil).toBe(4);
    expect(attackRateOfFire({ rateOfFire: 10, recoil: 2, setRecoil: 4, recoilModifier: 1 }).recoil).toBe(5);
    expect(attackRateOfFire({ rateOfFire: 10, recoil: 2, recoilModifier: -5 }).recoil).toBe(1);
  });
});
