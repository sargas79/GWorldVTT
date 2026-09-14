import { describe, expect, it } from "vitest";

import {
  inSkillFamily,
  isOpenTechnique,
  qualifyingSkills,
  skillChosenIn,
  techniqueForSkill,
} from "../technique-skills.js";

/** Techniques bought for a skill chosen when taken (Characters p. 230; sargas79/GWorldVTT#194). */
describe("the kinds of skill a technique is written for", () => {
  it("knows the unarmed combat and Melee Weapon skills", () => {
    expect(inSkillFamily("Karate", "unarmed")).toBe(true);
    expect(inSkillFamily("Broadsword", "melee")).toBe(true);
    expect(inSkillFamily("Broadsword", "unarmed")).toBe(false);
    expect(inSkillFamily("First Aid/TL3", "melee")).toBe(false);
  });

  it("leaves the two-handed weapons out of the one-handed ones", () => {
    expect(inSkillFamily("Rapier", "oneHandedMelee")).toBe(true);
    expect(inSkillFamily("Two-Handed Sword", "oneHandedMelee")).toBe(false);
    expect(inSkillFamily("Staff", "oneHandedMelee")).toBe(false);
  });

  it("reads a ranged skill with its specialty and tech level as that skill", () => {
    expect(inSkillFamily("Guns/TL8 (Pistol)", "ranged")).toBe(true);
    expect(inSkillFamily("Bow", "ranged")).toBe(true);
  });

  it("lets any skill through for 'any'", () => {
    expect(inSkillFamily("Cooking", "any")).toBe(true);
  });
});

describe("qualifyingSkills", () => {
  const known = ["Broadsword", "Karate", "First Aid", "Guns/TL8 (Pistol)"];

  it("offers Disarming for Broadsword and Karate, and not for First Aid", () => {
    expect(qualifyingSkills({ families: ["melee", "shield", "unarmed"], choices: [] }, known))
      .toEqual(["Broadsword", "Karate"]);
  });

  it("offers a technique that names its skills only those", () => {
    expect(qualifyingSkills({ families: [], choices: ["Brawling", "Karate"] }, known)).toEqual(["Karate"]);
  });

  it("offers nothing to a character with no such skill", () => {
    expect(qualifyingSkills({ families: ["ranged"], choices: [] }, ["Cooking"])).toEqual([]);
  });
});

describe("naming an open technique for its skill", () => {
  it("names it for the skill chosen", () => {
    expect(techniqueForSkill("Disarming", "Broadsword")).toBe("Disarming (Broadsword)");
    expect(techniqueForSkill("Retain Weapon (Melee Weapon Skill)", "Staff")).toBe("Retain Weapon (Staff)");
  });

  it("reads the skill a template's entry chose", () => {
    expect(skillChosenIn("Disarming (Rapier)", "Disarming")).toBe("Rapier");
    expect(skillChosenIn("Disarming", "Disarming")).toBeNull();
    expect(skillChosenIn("Feint (Rapier)", "Disarming")).toBeNull();
  });

  it("is open only while it names kinds and no skill", () => {
    expect(isOpenTechnique({ prerequisite: "", skillFamilies: ["melee"] })).toBe(true);
    expect(isOpenTechnique({ prerequisite: "Broadsword", skillFamilies: ["melee"] })).toBe(false);
    expect(isOpenTechnique({ prerequisite: "", skillFamilies: [], skillChoices: [] })).toBe(false);
  });
});
