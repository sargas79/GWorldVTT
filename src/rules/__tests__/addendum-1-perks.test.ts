import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  bondBonus, classicFeaturesGain, controllableTarget, cuttingEdgeFor, cuttingEdgeTechLevel, dabblerBonusFor,
  dabblerChoices, dabblerGain, improvisedWaived, maximumWithSpecialExercises, mayFeintWith, mayTradeForAmbidexterity,
  mayTradeForHighTl, needsPermit, noPerks, nuisanceRollsWaived, offHandWaived, perksOf, permitsUncovered,
  shtickSkill, strongbowAllowance, strongbowMinSt,
} from "../addendum-perks.js";
import { appearanceReaction, reactionSources } from "../social.js";
import { skillTechLevel } from "../tech-level.js";

interface Doc { name: string; system: { category: string; needsSpecialty: boolean; reference: string } }
const records = JSON.parse(
  readFileSync(join(import.meta.dirname, "../../../packs-src/advantages/basic-set-addendum-advantages.json"), "utf8"),
) as Doc[];

describe("the Revised perks' records", () => {
  const names = [
    "Alternative Feints", "Classic Features", "Controllable Disadvantage", "Cutting-Edge Training", "Dabbler",
    "Equipment Bond", "Improvised Weapons", "Convincing Nod", "Disarming Smile", "Fearsome Stare", "Gangster Swagger",
    "Haughty Sneer", "Sexy Pose", "No Nuisance Rolls", "Off-Hand Training", "Citizenship", "Courtesy Title", "License",
    "Office", "Permit", "Strongbow", "Extra Option", "Rules Exemption", "Secret Knowledge", "Special Exercises",
    "Unusual Training", "Weapon Bond",
  ];
  it.each(names)("%s is a perk on p. 328 or 329", (name) => {
    const doc = records.find((r) => r.name === name);
    expect(doc?.system.category).toBe("perk");
    expect(doc?.system.reference).toMatch(/p\. 32[89]$/);
  });
  it("names what a bond is to", () => {
    expect(records.find((r) => r.name === "Weapon Bond")?.system.needsSpecialty).toBe(true);
  });
});

describe("Dabbler", () => {
  it("reads +1 for a bare name, +2 for two choices and +3 for four", () => {
    const { bonuses, spent } = dabblerChoices("Biology, Chemistry, Physics +2, Mathematics (Applied) +3");
    expect(bonuses).toEqual({ biology: 1, chemistry: 1, physics: 2, "mathematics (applied)": 3 });
    expect(spent).toBe(8);
  });
  it("stops at eight choices", () => {
    const { bonuses } = dabblerChoices("A +3, B +3, C");
    expect(Object.keys(bonuses)).toEqual(["a", "b"]);
  });
  it("never lifts a default past what a point buys", () => {
    expect(dabblerGain({ bonus: 3, level: 7, onePointLevel: 11 })).toBe(3);
    expect(dabblerGain({ bonus: 3, level: 10, onePointLevel: 11 })).toBe(1);
    expect(dabblerGain({ bonus: 2, level: 11, onePointLevel: 11 })).toBe(0);
  });
  it("finds a skill with or without its specialty", () => {
    const perks = perksOf([{ name: "Dabbler", specialty: "Physics +2, Biology" }]);
    expect(dabblerBonusFor(perks, "Physics")).toBe(2);
    expect(dabblerBonusFor(perks, "Biology/TL8")).toBe(1);
    expect(dabblerBonusFor(perks, "Chemistry")).toBe(0);
  });
});

describe("Cutting-Edge Training", () => {
  it("adds its levels to the personal TL in that skill only", () => {
    expect(cuttingEdgeTechLevel(7, 1)).toBe(8);
    const perks = perksOf([{ name: "Cutting-Edge Training", levels: 2, specialty: "Piloting/TL9 (Aerospace)" }]);
    expect(cuttingEdgeFor(perks, "Piloting (Aerospace)")).toBe(2);
    expect(cuttingEdgeFor(perks, "Piloting (Helicopter)")).toBe(0);
    expect(skillTechLevel("Piloting (Aerospace)", "", 7, 2)).toBe(9);
    expect(skillTechLevel("Piloting (Aerospace)", "", 7)).toBe(7);
  });
  it("trades five for High TL 1", () => {
    expect(mayTradeForHighTl(4)).toBe(false);
    expect(mayTradeForHighTl(5)).toBe(true);
  });
});

describe("Off-Hand Training and Improvised Weapons", () => {
  const perks = perksOf([
    { name: "Off-Hand Training", specialty: "Broadsword" },
    { name: "Improvised Weapons", specialty: "Brawling" },
  ]);
  it("waive for the named skill", () => {
    expect(offHandWaived(perks, "Broadsword")).toBe(true);
    expect(offHandWaived(perks, "Shortsword")).toBe(false);
    expect(improvisedWaived(perks, "Brawling")).toBe(true);
    expect(improvisedWaived(perks, "Karate")).toBe(false);
  });
  it("trades five for Ambidexterity", () => {
    expect(mayTradeForAmbidexterity(5)).toBe(true);
  });
});

describe("bonds", () => {
  it("give +1 with the named item only", () => {
    const perks = perksOf([{ name: "Weapon Bond (Grandfather's Katana)" }, { name: "Equipment Bond", specialty: "Field Surgery Kit" }]);
    expect(bondBonus(perks, "grandfather's katana")).toBe(1);
    expect(bondBonus(perks, "Field Surgery Kit")).toBe(1);
    expect(bondBonus(perks, "Katana")).toBe(0);
  });
});

describe("Strongbow", () => {
  it("allows +1 at DX+1 and +2 at DX+2 or better", () => {
    expect(strongbowAllowance(0)).toBe(0);
    expect(strongbowAllowance(1)).toBe(1);
    expect(strongbowAllowance(2)).toBe(2);
    expect(strongbowAllowance(5)).toBe(2);
    expect(strongbowMinSt(13, 2)).toBe(11);
    expect(strongbowMinSt(null, 2)).toBeNull();
  });
});

describe("Classic Features", () => {
  it("counts Appearance a level higher for those who fancy it", () => {
    expect(appearanceReaction(-1)).toBe(-1);
    expect(appearanceReaction(0)).toBe(0);
    expect(appearanceReaction(1)).toBe(1);
    expect(classicFeaturesGain(0, appearanceReaction)).toBe(1);
    expect(classicFeaturesGain(-1, appearanceReaction)).toBe(1);
    expect(classicFeaturesGain(1, appearanceReaction)).toBe(1);
    expect(classicFeaturesGain(6, appearanceReaction)).toBe(0);
  });
  it("is a conditional reaction source", () => {
    const sources = reactionSources([{ name: "Classic Features (Redhead)" }]);
    expect(sources).toEqual([{ label: "Classic Features", value: 1, condition: "fancied" }]);
  });
});

describe("the small ones", () => {
  it("Alternative Feints names the skills", () => {
    const perks = perksOf([{ name: "Alternative Feints", specialty: "Dancing" }]);
    expect(mayFeintWith(perks, "Dancing")).toBe(true);
    expect(mayFeintWith(perks, "Acrobatics")).toBe(false);
  });
  it("a Permit covers one piece of gear whose LC is below the Control Rating", () => {
    expect(needsPermit(2, 3)).toBe(true);
    expect(needsPermit(3, 3)).toBe(false);
    expect(needsPermit(null, 4)).toBe(false);
    expect(permitsUncovered([1, 2, 4], 3, 1)).toBe(1);
  });
  it("No Nuisance Rolls needs 16+ in every score", () => {
    expect(nuisanceRollsWaived([16, 17])).toBe(true);
    expect(nuisanceRollsWaived([16, 15])).toBe(false);
    expect(nuisanceRollsWaived([])).toBe(false);
  });
  it("Special Exercises raises a maximum a level a perk", () => {
    const perks = perksOf([{ name: "Special Exercises" }, { name: "Special Exercises" }]);
    expect(maximumWithSpecialExercises(20, perks)).toBe(22);
    expect(maximumWithSpecialExercises(20, noPerks())).toBe(20);
  });
  it("Controllable Disadvantage is -1 per further attempt in the hour", () => {
    expect(controllableTarget({ score: 12, physical: true, attemptsThisHour: 1 })).toBe(12);
    expect(controllableTarget({ score: 12, physical: false, attemptsThisHour: 3 })).toBe(10);
  });
  it("each Influence Shtick stands for a skill", () => {
    expect(shtickSkill("Fearsome Stare")).toBe("Intimidation");
    expect(shtickSkill("Sexy Pose")).toBe("Sex Appeal");
    expect(perksOf([{ name: "Haughty Sneer" }]).shticks).toEqual(["haughty sneer"]);
  });
});
