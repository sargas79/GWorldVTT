import { describe, expect, it } from "vitest";

import {
  ammunitionCostFactor,
  ammunitionProblems,
  halveDamage,
  isShotgun,
  specialAmmunitionEffect,
  specialReloadCost,
} from "../special-ammunition.js";

const pistol = { damage: "2d", damageType: "pi" as const, armorDivisor: 1, accuracy: 2, st: 9, shotgun: false, projectiles: 1 };
const shotgun = { damage: "1d+1", damageType: "pi" as const, armorDivisor: 1, accuracy: 3, st: 10, shotgun: true, projectiles: 9 };

describe("what a load costs (Monster Hunters 1 p. 63)", () => {
  it("prices a fresh magazine of silent .40 ammunition at $72", () => {
    expect(specialReloadCost({ ammunition: 4, magazine: 32, load: { powder: "silent", payload: "" } })).toBe(72);
  });

  it("moves a hand-loaded option's CF by 2, but not a bought one's", () => {
    expect(ammunitionCostFactor({ powder: "handMatched", payload: "silver" })).toBe(58);
    expect(ammunitionCostFactor({ powder: "handMatched", payload: "silver", powderAdjust: -2, payloadAdjust: 2 })).toBe(58);
    expect(ammunitionCostFactor({ powder: "silent", payload: "wooden", powderAdjust: -2, payloadAdjust: -2 })).toBe(9);
  });
});

describe("what a load may be", () => {
  it("keeps shotgun payloads to shotguns, and bullets to pistols, rifles and SMGs", () => {
    expect(ammunitionProblems({ powder: "", payload: "flare" }, { shotgun: false })).toEqual(["shotgunOnly"]);
    expect(ammunitionProblems({ powder: "", payload: "hollowPoint" }, { shotgun: true })).toEqual(["notShotgun"]);
    expect(ammunitionProblems({ powder: "extraPowerful", payload: "dragonsBreath" }, { shotgun: true })).toEqual(["dragonsBreathPowder"]);
  });

  it("tells a shotgun by its skill or its shot", () => {
    expect(isShotgun({ skill: "Guns (Shotgun)", name: "Remington 870", projectiles: 1 })).toBe(true);
    expect(isShotgun({ skill: "Guns (Pistol)", name: "Glock", projectiles: 1 })).toBe(false);
  });
});

describe("what a load does", () => {
  it("stacks an extra-powerful chemical round to 0.44x Range", () => {
    const effect = specialAmmunitionEffect({ powder: "extraPowerful", payload: "chemicalSmoke" }, shotgun);
    expect(effect.rangeMultiplier).toBeCloseTo(0.44);
    expect(effect).toMatchObject({ damage: "2d-1", damageType: "cr", armorDivisor: 0.5, projectiles: 1 });
  });

  it("adds +1 per three dice, and ST x1.1 at least +1, for extra-powerful", () => {
    expect(specialAmmunitionEffect({ powder: "extraPowerful", payload: "" }, { ...pistol, damage: "4d" })).toMatchObject({ damage: "4d+2", st: 10 });
  });

  it("gives Accuracy by the gun's own", () => {
    expect(specialAmmunitionEffect({ powder: "handMatched", payload: "" }, pistol).accuracy).toBe(1);
    expect(specialAmmunitionEffect({ powder: "handMatched", payload: "" }, { ...pistol, accuracy: 4 }).accuracy).toBe(2);
    expect(specialAmmunitionEffect({ powder: "matchGrade", payload: "" }, pistol).accuracy).toBe(0);
  });

  it("makes silver silver and holy water holy, as hollow-points", () => {
    expect(specialAmmunitionEffect({ powder: "", payload: "silver" }, pistol).material).toBe("silver");
    expect(specialAmmunitionEffect({ powder: "", payload: "holyWater" }, pistol)).toMatchObject({ holy: true, damageType: "pi+", armorDivisor: 0.5 });
  });

  it("steps armour-piercing down with a (2) divisor", () => {
    expect(specialAmmunitionEffect({ powder: "", payload: "armorPiercing" }, pistol)).toMatchObject({ damageType: "pi-", armorDivisor: 2 });
  });

  it("gives thermate its burning follow-up and -1 per die", () => {
    expect(specialAmmunitionEffect({ powder: "", payload: "thermate" }, pistol)).toMatchObject({
      damage: "2d-2", followUp: { damage: "1d-2", damageType: "burn" },
    });
  });

  it("fires an explosive slug with a crushing follow-up", () => {
    expect(specialAmmunitionEffect({ powder: "", payload: "explosive" }, shotgun)).toMatchObject({
      damage: "4d", damageType: "pi++", armorDivisor: 0.5, followUp: { damage: "1d-1", damageType: "cr", explosive: true },
    });
  });

  it("does no damage with rock salt, to 10 yards", () => {
    expect(specialAmmunitionEffect({ powder: "", payload: "rockSalt" }, shotgun)).toMatchObject({ noDamage: true, fixedRange: 10 });
  });

  it("halves wooden rounds, rounding up: 3d becomes 1d+2", () => {
    expect(halveDamage("3d")).toBe("1d+2");
    expect(halveDamage("2d")).toBe("1d");
    expect(halveDamage("4d+1")).toBe("2d+1");
    expect(specialAmmunitionEffect({ powder: "", payload: "wooden" }, { ...pistol, damage: "3d" })).toMatchObject({ damage: "1d+2", rangeMultiplier: 0.5 });
  });

  it("gives Dragon's Breath RoF 1 and three seconds to fire again", () => {
    expect(specialAmmunitionEffect({ powder: "", payload: "dragonsBreath" }, shotgun)).toMatchObject({ damage: "1d-2", damageType: "burn", rateOfFire: 1, refireSeconds: 3 });
  });
});
