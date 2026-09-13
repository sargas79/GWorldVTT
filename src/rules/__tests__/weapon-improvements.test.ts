import { describe, expect, it } from "vitest";

import {
  allowedWeapon,
  improvedWeaponPrice,
  improvisedPenalty,
  weaponCostFactor,
  weaponImprovementEffects,
  weaponImprovementProblems,
  type ImprovedWeapon,
} from "../weapon-improvements.js";

const saber: ImprovedWeapon = {
  weaponClass: "fencing",
  quality: "veryFine",
  material: "silverCoated",
  improvements: { balanced: true, titanium: true },
};

describe("the were-hunter's saber (Monster Hunters 1 p. 59)", () => {
  it("is +10 CF, $7,700 from $700, and 3/4 the weight", () => {
    expect(weaponCostFactor(saber)).toBe(10);
    expect(improvedWeaponPrice(saber, { cost: 700, weight: 3 })).toEqual({ cost: 7700, weight: 2.25, costFactor: 10 });
  });

  it("has +1 skill, +2 damage and -2 to odds of breakage", () => {
    expect(weaponImprovementEffects(saber, { damageType: "cut" })).toMatchObject({ skill: 1, damage: 2, breakage: -2 });
  });
});

describe("the combinations the book forbids", () => {
  it("does not let silver be very fine, fine or titanium", () => {
    const silver = { ...saber, material: "silver" as const };
    expect(weaponImprovementProblems(silver)).toContain("silverCombination");
    const fixed = allowedWeapon(silver);
    expect(fixed.quality).toBe("good");
    expect(fixed.improvements.titanium).toBe(false);
    expect(weaponImprovementProblems(fixed)).toEqual([]);
  });

  it("keeps very fine for swords and weighted for two-handed axes and maces", () => {
    const axe: ImprovedWeapon = { weaponClass: "cutting", quality: "veryFine", material: "", improvements: { weighted: true } };
    expect(weaponImprovementProblems(axe)).toEqual(["veryFineNotSword", "weightedNotTwoHandedAxe"]);
    expect(weaponImprovementProblems({ ...axe, quality: "fine", twoHandedAxeOrMace: true })).toEqual([]);
    expect(allowedWeapon(axe)).toMatchObject({ quality: "fine", improvements: { weighted: false } });
  });

  it("lets silver-coated and titanium go together", () => {
    expect(weaponImprovementProblems({ ...saber, quality: "good" })).toEqual([]);
  });
});

describe("prices and effects by kind (pp. 59-61)", () => {
  it("makes silver +19 CF and +2 to odds of breakage", () => {
    const mace: ImprovedWeapon = { weaponClass: "crushing", quality: "good", material: "silver", improvements: {} };
    expect(weaponCostFactor(mace)).toBe(19);
    expect(weaponImprovementEffects(mace, { damageType: "cr" }).breakage).toBe(2);
  });

  it("gives fine +1 only to cutting and impaling, at no cost", () => {
    const sword: ImprovedWeapon = { weaponClass: "sword", quality: "fine", material: "", improvements: {} };
    expect(weaponCostFactor(sword)).toBe(0);
    expect(weaponImprovementEffects(sword, { damageType: "cut" }).damage).toBe(1);
    expect(weaponImprovementEffects(sword, { damageType: "cr" }).damage).toBe(0);
  });

  it("prices a holy weapon at no less than $250", () => {
    const knife: ImprovedWeapon = { weaponClass: "cutting", quality: "fine", material: "", improvements: { holy: true } };
    expect(improvedWeaponPrice(knife, { cost: 40, weight: 1 }).cost).toBe(250);
  });

  it("gives a balanced, compound, fine bow +1 Acc, ST+2 and 1.2x range for +8 CF", () => {
    const bow: ImprovedWeapon = { weaponClass: "bow", quality: "fine", material: "", improvements: { balanced: true, compound: true } };
    expect(weaponCostFactor(bow)).toBe(8);
    expect(weaponImprovementEffects(bow, { damageType: "imp", ranged: true })).toMatchObject({ accuracy: 1, st: 2, rangeMultiplier: 1.2 });
  });

  it("gives a fine gun +1 Acc from Acc 2, and a very fine one +2 from Acc 4", () => {
    const gun: ImprovedWeapon = { weaponClass: "firearm", quality: "fine", material: "", improvements: {} };
    expect(weaponCostFactor(gun)).toBe(1);
    expect(weaponImprovementEffects(gun, { damageType: "pi", baseAccuracy: 2, ranged: true }).accuracy).toBe(1);
    expect(weaponImprovementEffects(gun, { damageType: "pi", baseAccuracy: 1, ranged: true }).accuracy).toBe(0);
    expect(weaponCostFactor({ ...gun, quality: "veryFine" })).toBe(4);
    expect(weaponImprovementEffects({ ...gun, quality: "veryFine" }, { damageType: "pi", baseAccuracy: 3, ranged: true }).accuracy).toBe(0);
  });
});

describe("improvised weapons (p. 60)", () => {
  it("take their penalty unless the perk names the skill", () => {
    expect(improvisedPenalty({ penalty: -2, skill: "Knife", traitNames: [] })).toBe(-2);
    expect(improvisedPenalty({ penalty: -2, skill: "Knife", traitNames: ["Improvised Weapons (Knife)"] })).toBe(0);
    expect(improvisedPenalty({ penalty: -2, skill: "Knife", traitNames: ["Improvised Weapons (Broadsword)"] })).toBe(-2);
  });
});
