import { describe, expect, it } from "vitest";

import {
  availableQualities,
  breakageModifier,
  breakageQuality,
  materialCostMultiplier,
  materialWeightMultiplier,
  maxQualityFor,
  obsidianDamageBonus,
  shieldComposition,
  materialArmorDivisor,
  minStPenalty,
  outranks,
  qualityAccuracyBonus,
  qualityCostMultiplier,
  qualityDamageBonus,
  qualityMalfunction,
  qualityRangeMultiplier,
  silverCoatedWounding,
  silverCostMultiplier,
  weaponClassOf,
} from "../weapon-quality.js";

describe("what a weapon of each quality costs (Characters p. 274)", () => {
  it("prices a cheap weapon at 40% of list, or 20% at TL7+", () => {
    expect(qualityCostMultiplier("sword", "cheap", 3)).toBe(0.4);
    expect(qualityCostMultiplier("cutting", "cheap", 8)).toBe(0.2);
  });

  it("prices good at list through TL6 and 40% at TL7+", () => {
    expect(qualityCostMultiplier("crushing", "good", 3)).toBe(1);
    expect(qualityCostMultiplier("crushing", "good", 7)).toBe(0.4);
  });

  it("prices fine by class: x4 swords, x3 crushing, x10 cutting, list at TL7+", () => {
    expect(qualityCostMultiplier("sword", "fine", 3)).toBe(4);
    expect(qualityCostMultiplier("fencing", "fine", 3)).toBe(4);
    expect(qualityCostMultiplier("crushing", "fine", 3)).toBe(3);
    expect(qualityCostMultiplier("cutting", "fine", 3)).toBe(10);
    expect(qualityCostMultiplier("cutting", "fine", 7)).toBe(1);
  });

  it("sells very fine only to swords and fencing weapons, x20 or x4 at TL7+", () => {
    expect(qualityCostMultiplier("sword", "veryFine", 3)).toBe(20);
    expect(qualityCostMultiplier("fencing", "veryFine", 8)).toBe(4);
    expect(qualityCostMultiplier("cutting", "veryFine", 3)).toBeNull();
    expect(availableQualities("crushing", 3)).toEqual(["cheap", "good", "fine"]);
    expect(availableQualities("sword", 3)).toEqual(["cheap", "good", "fine", "veryFine"]);
  });

  it("prices firearms at x2 fine and x5 very fine, and bows at x4 fine (pp. 276, 279)", () => {
    expect(qualityCostMultiplier("firearm", "fine", 8)).toBe(2);
    expect(qualityCostMultiplier("firearm", "veryFine", 8)).toBe(5);
    expect(qualityCostMultiplier("bow", "fine", 3)).toBe(4);
    expect(availableQualities("bow", 3)).toEqual(["good", "fine"]);
  });
});

describe("what quality does in a fight", () => {
  it("adds +1 cutting and impaling damage for fine, +2 for very fine, nothing crushing", () => {
    expect(qualityDamageBonus("fine", "cut")).toBe(1);
    expect(qualityDamageBonus("veryFine", "imp")).toBe(2);
    expect(qualityDamageBonus("fine", "cr")).toBe(0);
    expect(qualityDamageBonus("cheap", "cut")).toBe(0);
  });

  it("gives no fine bonus to a stone, bronze or iron blade (p. 275)", () => {
    expect(qualityDamageBonus("fine", "cut", "iron")).toBe(0);
    expect(qualityDamageBonus("fine", "cut", "steel")).toBe(1);
  });

  it("changes accuracy: +1/+2 on fine firearms, -1 on a cheap thrown weapon", () => {
    expect(qualityAccuracyBonus("firearm", "fine", false)).toBe(1);
    expect(qualityAccuracyBonus("firearm", "veryFine", false)).toBe(2);
    expect(qualityAccuracyBonus("cutting", "cheap", true)).toBe(-1);
    expect(qualityAccuracyBonus("cutting", "cheap", false)).toBe(0);
  });

  it("moves Malf. by one, and past 19 the weapon never jams (Campaigns p. 407, Characters p. 279)", () => {
    expect(qualityMalfunction(17, "fine")).toBe(18);
    expect(qualityMalfunction(17, "cheap")).toBe(16);
    expect(qualityMalfunction(18, "veryFine")).toBeNull();
    expect(qualityMalfunction(null, "fine")).toBeNull();
  });

  it("stretches a fine bow's ranges by 20%", () => {
    expect(qualityRangeMultiplier("bow", "fine")).toBe(1.2);
    expect(qualityRangeMultiplier("sword", "fine")).toBe(1);
  });

  it("carries the breakage modifier the grade gives", () => {
    expect(breakageModifier("cheap")).toBe(2);
    expect(breakageModifier("good")).toBe(0);
    expect(breakageModifier("fine")).toBe(-1);
    expect(breakageModifier("veryFine")).toBe(-2);
  });
});

describe("blade composition (p. 275)", () => {
  it("breaks an outdated blade as cheap against a superior swing, and solid silver always", () => {
    expect(breakageQuality("fine", "bronze", true)).toBe("cheap");
    expect(breakageQuality("fine", "bronze", false)).toBe("fine");
    expect(breakageQuality("fine", "silver", false)).toBe("cheap");
    expect(breakageQuality("good", "silverCoated", true)).toBe("good");
    expect(outranks("steel", "iron")).toBe(true);
    expect(outranks("bronze", "steel")).toBe(false);
  });

  it("gives a stone blade a (0.5) divisor on cuts and thrusts only", () => {
    expect(materialArmorDivisor("stone", "cut")).toBe(0.5);
    expect(materialArmorDivisor("stone", "cr")).toBeNull();
    expect(materialArmorDivisor("steel", "cut")).toBeNull();
  });

  it("reduces a silver-coated weapon's wounding multiplier and prices silver", () => {
    expect(silverCoatedWounding(2)).toBe(1.5);
    expect(silverCoatedWounding(3)).toBe(2);
    expect(silverCoatedWounding(4)).toBe(3);
    expect(silverCoatedWounding(1)).toBe(1);
    expect(silverCostMultiplier("silver")).toBe(20);
    expect(silverCostMultiplier("silver", true)).toBe(50);
    expect(silverCostMultiplier("silverCoated")).toBe(3);
  });
});

describe("obsidian, plastic and what a shield is made of (pp. 275, 287)", () => {
  it("gives an obsidian blade the stone divisor, a fine blade's bonus and a cheap blade's breakage", () => {
    expect(materialArmorDivisor("obsidian", "cut")).toBe(0.5);
    expect(materialArmorDivisor("obsidian", "cr")).toBeNull();
    // "+1 to cutting and impaling damage (as if fine)", whatever it was bought as.
    expect(qualityDamageBonus("good", "cut", "obsidian")).toBe(1);
    expect(qualityDamageBonus("cheap", "imp", "obsidian")).toBe(1);
    expect(qualityDamageBonus("veryFine", "cut", "obsidian")).toBe(1);
    expect(qualityDamageBonus("good", "cr", "obsidian")).toBe(0);
    // "It loses its damage bonus if used to parry any weapon... or to strike DR 2+."
    expect(obsidianDamageBonus("cut", true)).toBe(0);
    // "+2 to breakage (as if cheap)", against anything.
    expect(breakageQuality("fine", "obsidian", false)).toBe("cheap");
  });

  it("halves a plastic blade's weight, doubles its price and caps it at good", () => {
    expect(materialWeightMultiplier("plastic")).toBe(0.5);
    expect(materialCostMultiplier("plastic")).toBe(2);
    expect(maxQualityFor("plastic")).toBe("good");
    expect(maxQualityFor("steel")).toBeNull();
    // "Treat them as equivalent to steel for breakage."
    expect(outranks("steel", "plastic")).toBe(false);
    expect(outranks("plastic", "bronze")).toBe(true);
    expect(breakageQuality("good", "plastic", true)).toBe("good");
  });

  it("prices silver through the same door as every other material", () => {
    expect(materialCostMultiplier("silver")).toBe(20);
    expect(materialCostMultiplier("silverCoated")).toBe(3);
    expect(materialCostMultiplier("steel")).toBe(1);
    expect(materialWeightMultiplier("steel")).toBe(1);
  });

  it("makes an iron shield dearer, heavier and tougher, and a riot shield lighter (p. 287)", () => {
    expect(shieldComposition("iron")).toEqual({ costFactor: 5, weightFactor: 2, drBonus: 3, hpFactor: 2, minTl: 3 });
    expect(shieldComposition("plastic")).toEqual({ costFactor: 1, weightFactor: 0.5, drBonus: 0, hpFactor: 1, minTl: 7 });
    expect(shieldComposition("wood")).toEqual({ costFactor: 1, weightFactor: 1, drBonus: 0, hpFactor: 1, minTl: 0 });
  });
});

describe("sorting a weapon into its class", () => {
  it("reads a gun off its Malf., a bow off its skill, a sword off its skill, the rest by whether it cuts", () => {
    expect(weaponClassOf({ skills: ["Guns (Pistol)"], damageTypes: ["pi"], hasMalfunction: true, isFencing: false })).toBe("firearm");
    expect(weaponClassOf({ skills: ["Bow"], damageTypes: ["imp"], hasMalfunction: false, isFencing: false })).toBe("bow");
    expect(weaponClassOf({ skills: ["Rapier"], damageTypes: ["imp"], hasMalfunction: false, isFencing: true })).toBe("fencing");
    expect(weaponClassOf({ skills: ["Broadsword"], damageTypes: ["cut", "cr"], hasMalfunction: false, isFencing: false })).toBe("sword");
    expect(weaponClassOf({ skills: ["Axe/Mace"], damageTypes: ["cut"], hasMalfunction: false, isFencing: false })).toBe("cutting");
    expect(weaponClassOf({ skills: ["Axe/Mace"], damageTypes: ["cr"], hasMalfunction: false, isFencing: false })).toBe("crushing");
  });
});

describe("a weapon that needs more ST than you have (p. 270)", () => {
  it("is -1 to skill per point lacking, and nothing otherwise", () => {
    expect(minStPenalty(10, 12)).toBe(-2);
    expect(minStPenalty(12, 12)).toBe(0);
    expect(minStPenalty(14, 12)).toBe(0);
    expect(minStPenalty(10, null)).toBe(0);
  });
});
