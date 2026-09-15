import { describe, expect, it } from "vitest";

import { pulledFormula } from "../pulled-blow.js";

/** A blow struck at less than full strength (GURPS Basic Set: Campaigns p. 401). */
const blow = (over: Partial<Parameters<typeof pulledFormula>[0]> = {}) => ({
  strength: 14,
  chosen: 8,
  stBased: true,
  damageBase: "sw",
  damageModifier: 1,
  minSt: null,
  naturalKey: "",
  dx: 12,
  skills: {},
  ...over,
});

describe("pulledFormula", () => {
  it("keeps a fist load's unarmed bonus, worked out at the pulled ST", () => {
    // Brass knuckles with Karate 13 against DX 12: +2 per die. ST 19 thrusts
    // 2d-1, so 2d+3; pulled to ST 10 it thrusts 1d-2, so 1d.
    const knuckles = blow({ strength: 20, damageBase: "thr", damageModifier: 0, skills: { Karate: 13 }, unarmedBonusSkill: "Karate" });
    expect(pulledFormula({ ...knuckles, chosen: 19 })).toBe("2d+3");
    expect(pulledFormula({ ...knuckles, chosen: 10 })).toBe("1d");
  });

  it("keeps Weapon Master's bonus, worked out on the dice of the pulled ST", () => {
    // +2 per die. ST 14 swings 2d, so 2d+1+4; pulled to ST 8 it swings 1d-2, so 1d-2+1+2.
    const mastered = blow({ weaponMasterPerDie: 2 });
    expect(pulledFormula({ ...mastered, chosen: 14 })).toBe("2d+5");
    expect(pulledFormula(mastered)).toBe("1d+1");
  });

  it("re-reads a sword's swing at the chosen ST, keeping its own modifier", () => {
    // ST 8 swings 1d-2; a broadsword's +1 makes it 1d-1.
    expect(pulledFormula(blow())).toBe("1d-1");
  });

  it("re-reads a thrust the same way", () => {
    // ST 8 thrusts 1d-3; +0.
    expect(pulledFormula(blow({ damageBase: "thr", damageModifier: 0 }))).toBe("1d-3");
  });

  it("works a punch out whole at the lower ST", () => {
    // ST 8 thrusts 1d-3, and a punch is thrust-1: 1d-4.
    expect(pulledFormula(blow({ naturalKey: "punch", damageBase: "" }))).toBe("1d-4");
  });

  it("never strikes harder than full strength", () => {
    // Choosing ST 20 on a ST 14 fighter is ST 14: a swing of 2d, +1.
    expect(pulledFormula(blow({ chosen: 20 }))).toBe("2d+1");
  });

  it("cannot pull a blow whose damage does not come off ST", () => {
    // "but not with a crossbow or a firearm" -- or anything with fixed dice.
    expect(pulledFormula(blow({ stBased: false }))).toBe(null);
  });
});
