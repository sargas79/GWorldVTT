import { describe, expect, it } from "vitest";
import { normalizeSkillName } from "../skills.js";
import {
  bestTool,
  familiarityKey,
  familiarityModifier,
  isFamiliar,
  isTechnologicalSkill,
  mayRollForFamiliarity,
  parseTechLevel,
  skillTechLevel,
  startingFamiliarities,
  techLevelModifier,
  toggleFamiliarity,
  toolServesSkill,
  toolSkillKey,
  UNFAMILIAR_PENALTY,
} from "../tech-level.js";

describe("parseTechLevel", () => {
  it("reads the number however the data writes it", () => {
    expect(parseTechLevel("8")).toBe(8);
    expect(parseTechLevel("TL7")).toBe(7);
    expect(parseTechLevel("11^")).toBe(11);
    expect(parseTechLevel(5)).toBe(5);
  });
  it("is null where there is none", () => {
    expect(parseTechLevel("")).toBeNull();
    expect(parseTechLevel("^")).toBeNull();
    expect(parseTechLevel(undefined)).toBeNull();
  });
});

describe("technological skills", () => {
  it("are the ones marked /TL, or given a TL", () => {
    expect(isTechnologicalSkill("Guns/TL (Pistol)")).toBe(true);
    expect(isTechnologicalSkill("Broadsword")).toBe(false);
    expect(isTechnologicalSkill("Guns (Pistol)", "7")).toBe(true);
  });
  it("are learned at the recorded TL, else the name's, else the character's", () => {
    expect(skillTechLevel("Guns/TL (Pistol)", "5", 8)).toBe(5);
    expect(skillTechLevel("Guns/TL7 (Pistol)", "", 8)).toBe(7);
    expect(skillTechLevel("Guns/TL (Pistol)", "", 8)).toBe(8);
  });
});

describe("techLevelModifier (Characters p. 168)", () => {
  const iq = (skill: number, gear: number) => techLevelModifier({ skillTechLevel: skill, equipmentTechLevel: gear, iqBased: true });
  it("follows the IQ-based table", () => {
    expect(iq(8, 8)).toBe(0);
    expect(iq(8, 9)).toBe(-5);
    expect(iq(8, 10)).toBe(-10);
    expect(iq(8, 11)).toBe(-15);
    expect(iq(8, 12)).toBeNull();
    expect(iq(8, 7)).toBe(-1);
    expect(iq(8, 6)).toBe(-3);
    expect(iq(8, 5)).toBe(-5);
    expect(iq(8, 4)).toBe(-7);
    // "Per extra -1 to TL: -2".
    expect(iq(8, 3)).toBe(-9);
  });
  it("is -1 per TL either way for other skills", () => {
    // "a TL5 gunman would be at -2 to shoot a TL7 revolver", and the other way round.
    expect(techLevelModifier({ skillTechLevel: 5, equipmentTechLevel: 7, iqBased: false })).toBe(-2);
    expect(techLevelModifier({ skillTechLevel: 7, equipmentTechLevel: 5, iqBased: false })).toBe(-2);
    expect(techLevelModifier({ skillTechLevel: 5, equipmentTechLevel: 12, iqBased: false })).toBe(-7);
  });
});

describe("familiarity (Characters p. 169)", () => {
  it("matches however the name was typed", () => {
    expect(familiarityKey("  Colt  Peacemaker ")).toBe("colt peacemaker");
    expect(isFamiliar(["Colt Peacemaker"], "colt peacemaker")).toBe(true);
    expect(isFamiliar([], "Colt Python")).toBe(false);
  });
  it("costs -2 for an unfamiliar item", () => {
    expect(familiarityModifier([], "Blaster Pistol")).toBe(UNFAMILIAR_PENALTY);
    expect(familiarityModifier(["Blaster Pistol"], "Blaster Pistol")).toBe(0);
  });
  it("toggles an entry in and out", () => {
    const once = toggleFamiliarity(["Luger"], "Colt Python");
    expect(once).toEqual(["Luger", "Colt Python"]);
    expect(toggleFamiliarity(once, "colt python")).toEqual(["Luger"]);
  });
  it("gives a starting character two per point, and a roll at six", () => {
    expect(startingFamiliarities(4)).toBe(8);
    expect(mayRollForFamiliarity(5)).toBe(false);
    expect(mayRollForFamiliarity(6)).toBe(true);
  });
});

describe("bestTool", () => {
  it("weighs each tool's TL against the skill's", () => {
    // A fine TL6 kit (+2, -3 for an IQ skill at TL8) loses to a basic TL8 one.
    expect(bestTool([{ quality: 2, techLevel: 6 }, { quality: 0, techLevel: 8 }], { skillTechLevel: 8, iqBased: true })).toEqual({ quality: 0, techLevel: 0 });
    expect(bestTool([{ quality: 2, techLevel: 7 }], { skillTechLevel: 8, iqBased: true })).toEqual({ quality: 2, techLevel: -1 });
  });
  it("passes over a tool the skill cannot use, and weighs no TL for a skill without one", () => {
    expect(bestTool([{ quality: 1, techLevel: 12 }], { skillTechLevel: 8, iqBased: true })).toBeNull();
    expect(bestTool([{ quality: 1, techLevel: 12 }], { skillTechLevel: null, iqBased: true })).toEqual({ quality: 1, techLevel: 0 });
    expect(bestTool([], { skillTechLevel: 8, iqBased: false })).toBeNull();
  });
});

describe("toolServesSkill", () => {
  it("matches the exact name", () => {
    expect(toolServesSkill("First Aid/TL", "First Aid/TL")).toBe(true);
    expect(toolServesSkill("Lockpicking/TL", "Lockpicking/TL")).toBe(true);
  });

  it("matches a name written without the /TL", () => {
    expect(toolServesSkill("First Aid", "First Aid/TL")).toBe(true);
    expect(toolServesSkill("First Aid/TL", "First Aid")).toBe(true);
  });

  it("matches a name written with a TL number", () => {
    expect(toolServesSkill("First Aid/TL8", "First Aid/TL")).toBe(true);
    expect(toolServesSkill("First Aid", "First Aid/TL8")).toBe(true);
    expect(toolServesSkill("First Aid/TL7", "First Aid/TL8")).toBe(true);
  });

  it("matches a specialty with or without the /TL, in any case", () => {
    expect(toolServesSkill("Electronics Operation (Security)", "Electronics Operation/TL (Security)")).toBe(true);
    expect(toolServesSkill("Electronics Operation/TL8 (Security)", "Electronics Operation/TL (Security)")).toBe(true);
    expect(toolServesSkill("electronics operation (security)", "Electronics Operation/TL (Security)")).toBe(true);
    expect(toolServesSkill("Electronics Operation(Security)", "Electronics Operation/TL ( Security )")).toBe(true);
  });

  it("never matches across specialties, or a specialty with its bare skill", () => {
    expect(toolServesSkill("Electronics Operation (Security)", "Electronics Operation/TL (Medical)")).toBe(false);
    expect(toolServesSkill("Electronics Operation", "Electronics Operation/TL (Security)")).toBe(false);
    expect(toolServesSkill("Electronics Operation (Security)", "Electronics Repair/TL (Security)")).toBe(false);
    expect(toolServesSkill("First Aid", "Physician/TL")).toBe(false);
    expect(toolServesSkill("", "First Aid/TL")).toBe(false);
  });

  it("writes one key for every spelling", () => {
    expect(toolSkillKey("  Electronics Operation/TL8  (Security) ")).toBe("electronics operation (security)");
    expect(toolSkillKey("Guns/TL^ (Pistol)")).toBe("guns (pistol)");
  });
});

describe("normalizeSkillName", () => {
  it("sees through the /TL marker, case and spacing, and keeps the specialty", () => {
    expect(normalizeSkillName("Physician/TL")).toBe("physician");
    expect(normalizeSkillName("First Aid/TL9")).toBe("first aid");
    expect(normalizeSkillName("Electronics Repair/TL ( Security )")).toBe("electronics repair (security)");
    expect(normalizeSkillName("Guns/TL8(Pistol)")).toBe(normalizeSkillName("guns (pistol)"));
    expect(toolSkillKey("Surgery/TL")).toBe(normalizeSkillName("Surgery"));
  });
});
