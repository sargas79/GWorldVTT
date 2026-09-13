import { describe, expect, it } from "vitest";

import {
  ammunitionCost,
  ammunitionEffect,
  availableAmmunition,
  calibreOf,
  crossbowReloadTime,
  fullLoad,
  parseShots,
  reloadTime,
  stepPiercing,
} from "../ammunition.js";

describe("the Shots column (Characters p. 270)", () => {
  it("reads a magazine, a chambered round and the reload time", () => {
    expect(parseShots("30+1(3)")).toMatchObject({ capacity: 30, chambered: true, reloadSeconds: 3, perShot: false, thrown: false });
    expect(fullLoad(parseShots("30+1(3)"))).toBe(31);
    expect(parseShots("1(4)")).toMatchObject({ capacity: 1, chambered: false, reloadSeconds: 4 });
  });

  it("reads shots loaded one at a time, thrown weapons, and columns that say nothing", () => {
    expect(parseShots("6(3i)")).toMatchObject({ capacity: 6, reloadSeconds: 3, perShot: true });
    expect(parseShots("T(1)")).toMatchObject({ capacity: 1, thrown: true, reloadSeconds: 1 });
    expect(parseShots("1(-)")).toMatchObject({ capacity: 1, reloadSeconds: null });
    expect(parseShots("10")).toMatchObject({ capacity: 10, reloadSeconds: null });
    expect(parseShots("")).toMatchObject({ capacity: null });
    expect(fullLoad(parseShots(""))).toBe(0);
  });

  it("times a reload: all at once, or per shot with an i (Campaigns p. 373)", () => {
    expect(reloadTime(parseShots("30+1(3)"), 31)).toBe(3);
    expect(reloadTime(parseShots("6(3i)"), 6)).toBe(18);
    expect(reloadTime(parseShots("6(3i)"), 2)).toBe(6);
    expect(reloadTime(parseShots("1(-)"), 1)).toBeNull();
  });
});

describe("cocking a strong crossbow (Characters p. 270)", () => {
  it("takes the listed time up to the user's ST, double for one or two over", () => {
    expect(crossbowReloadTime({ bowSt: 10, userSt: 12, baseSeconds: 4, goatsFoot: false }).seconds).toBe(4);
    expect(crossbowReloadTime({ bowSt: 13, userSt: 12, baseSeconds: 4, goatsFoot: false }).seconds).toBe(8);
    expect(crossbowReloadTime({ bowSt: 14, userSt: 12, baseSeconds: 4, goatsFoot: false }).seconds).toBe(8);
  });

  it("needs a goat's foot and 20 seconds standing for three or four over, and cannot at five", () => {
    const without = crossbowReloadTime({ bowSt: 15, userSt: 12, baseSeconds: 4, goatsFoot: false });
    expect(without).toMatchObject({ seconds: null, needsGoatsFoot: true });
    const withIt = crossbowReloadTime({ bowSt: 16, userSt: 12, baseSeconds: 4, goatsFoot: true });
    expect(withIt).toMatchObject({ seconds: 20, needsGoatsFoot: true, mustStand: true });
    expect(crossbowReloadTime({ bowSt: 17, userSt: 12, baseSeconds: 4, goatsFoot: true })).toMatchObject({ seconds: null, tooStrong: true });
  });
});

describe("ammunition (Characters pp. 275, 276, 278-279)", () => {
  const rifle = { damageType: "pi" as const, armorDivisor: 1, calibreMm: 5.56, tl: 8, bow: false };

  it("costs $20 a pound of reload", () => {
    // "The 5.56mm assault rifle has a weight of '9/1.' Thus, a full reload weighs 1 lb. and costs $20."
    expect(ammunitionCost(1)).toBe(20);
    expect(ammunitionCost(0.8)).toBe(16);
  });

  it("reads a calibre off the name", () => {
    expect(calibreOf("Assault Rifle, 5.56mm")).toBe(5.56);
    expect(calibreOf("Sniper Rifle, .338")).toBeCloseTo(8.59, 1);
    expect(calibreOf("Auto Pistol, 9mm")).toBe(9);
    expect(calibreOf("ATGM, 115mm")).toBe(115);
    expect(calibreOf("Pump Shotgun, 12G")).toBeNull();
  });

  it("steps piercing up and down the ladder and no further", () => {
    expect(stepPiercing("pi", 1)).toBe("pi+");
    expect(stepPiercing("pi++", 1)).toBe("pi++");
    expect(stepPiercing("pi-", -1)).toBe("pi-");
    expect(stepPiercing("cut", 1)).toBe("cut");
  });

  it("hollow-point steps the wound up and halves penetration, not for pi++ or before TL6", () => {
    expect(ammunitionEffect("hp", rifle)).toMatchObject({ available: true, damageType: "pi+", armorDivisor: 0.5, costMultiplier: 1 });
    expect(ammunitionEffect("hp", { ...rifle, damageType: "pi++" }).available).toBe(false);
    expect(ammunitionEffect("hp", { ...rifle, tl: 5 }).available).toBe(false);
  });

  it("APHC adds a (2) divisor and degrades small-calibre wounds, at double cost and LC2", () => {
    expect(ammunitionEffect("aphc", rifle)).toMatchObject({ damageType: "pi-", armorDivisor: 2, costMultiplier: 2, lc: 2 });
    // A 115mm round keeps its wound.
    expect(ammunitionEffect("aphc", { ...rifle, damageType: "pi++", calibreMm: 115 })).toMatchObject({ damageType: "pi++", armorDivisor: 2 });
    expect(ammunitionEffect("aphc", { ...rifle, damageType: "pi-" }).damageType).toBe("pi-");
    expect(ammunitionEffect("aphc", { ...rifle, tl: 6 }).available).toBe(false);
  });

  it("APDS is APHC plus half again the range and +1 per die, five times the cost, LC1, TL9", () => {
    expect(ammunitionEffect("apds", { ...rifle, tl: 9 })).toMatchObject({
      damageType: "pi-", armorDivisor: 2, rangeMultiplier: 1.5, perDieBonus: 1, costMultiplier: 5, lc: 1,
    });
    expect(ammunitionEffect("apds", rifle).available).toBe(false);
  });

  it("bodkin points turn an arrow's impaling into piercing at (2), TL3+", () => {
    const bow = { damageType: "imp" as const, armorDivisor: 1, calibreMm: null, tl: 3, bow: true };
    expect(ammunitionEffect("bodkin", bow)).toMatchObject({ damageType: "pi", armorDivisor: 2, costMultiplier: 1 });
    expect(ammunitionEffect("bodkin", { ...bow, tl: 2 }).available).toBe(false);
    expect(ammunitionEffect("bodkin", rifle).available).toBe(false);
  });

  it("prices silver: bullets fifty times, arrowheads twenty", () => {
    expect(ammunitionEffect("silver", rifle).costMultiplier).toBe(50);
    expect(ammunitionEffect("silver", { ...rifle, tl: 3 }).available).toBe(false);
    expect(ammunitionEffect("silver", { damageType: "imp", armorDivisor: 1, calibreMm: null, tl: 3, bow: true }).costMultiplier).toBe(20);
  });

  it("lists what a weapon can be loaded with", () => {
    expect(availableAmmunition({ ...rifle, tl: 9 })).toEqual(["", "hp", "aphc", "apds", "silver"]);
    expect(availableAmmunition({ damageType: "imp", armorDivisor: 1, calibreMm: null, tl: 3, bow: true })).toEqual(["", "bodkin", "silver"]);
    expect(availableAmmunition({ ...rifle, damageType: "burn" })).toEqual(["", "silver"]);
  });
});
