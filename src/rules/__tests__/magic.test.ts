import { describe, expect, it } from "vitest";

import {
  checkPrerequisites,
  collegeSkillNames,
  describePrerequisites,
  isCollegeSkill,
  magicSkillBonus,
  magicStyleFor,
  mageryForStyle,
  nextSpellPoints,
  parsePrerequisite,
  parsePrerequisites,
  previousSpellPoints,
  ritualSpellLevel,
  spellLevel,
  type PrerequisiteContext,
} from "../magic.js";

describe("learning spells (Characters p. 235)", () => {
  /** "if you have IQ 12 and Magery 3, you learn spells as if you had IQ 15" */
  it("adds Magery to IQ", () => {
    // 1 point in an IQ/Hard skill is IQ-2, so IQ 15 gives 13.
    expect(spellLevel({ iq: 12, magery: 3, points: 1, difficulty: "H" })).toBe(13);
    // 4 points is IQ+0 for Hard and IQ-1 for Very Hard.
    expect(spellLevel({ iq: 12, magery: 3, points: 4, difficulty: "H" })).toBe(15);
    expect(spellLevel({ iq: 12, magery: 3, points: 4, difficulty: "VH" })).toBe(14);
  });

  it("reads Magery 0 as no bonus, and no Magery the same way", () => {
    expect(spellLevel({ iq: 12, magery: 0, points: 4, difficulty: "H" })).toBe(12);
    expect(spellLevel({ iq: 12, magery: null, points: 4, difficulty: "H" })).toBe(12);
  });

  /** "Spells have no default - you can only cast spells you know." */
  it("has no level at all with no points spent", () => {
    expect(spellLevel({ iq: 14, magery: 2, points: 0, difficulty: "H" })).toBeNull();
  });

  it("applies a flat bonus", () => {
    expect(spellLevel({ iq: 12, magery: 1, points: 2, difficulty: "H", bonus: 2 })).toBe(14);
  });

  it("walks the Skill Cost Table at the spell's difficulty", () => {
    expect(nextSpellPoints(0, "H", "standard")).toBe(1);
    expect(nextSpellPoints(2, "H", "standard")).toBe(4);
    expect(previousSpellPoints(4, "VH", "standard")).toBe(2);
  });
});

describe("Ritual Magic (Characters p. 242)", () => {
  /**
   * "a spell with one prerequisite that itself has one prerequisite
   * defaults to college skill-2"
   */
  it("defaults to the college skill less the prerequisite count", () => {
    const resolved = ritualSpellLevel({ collegeLevel: 14, prerequisiteCount: 2, points: 0 });
    expect(resolved.level).toBe(12);
    expect(resolved.levels).toBe(0);
  });

  /** "Ritual mages can cast spells at default!" -- there is a level with no points. */
  it("has a level with no points spent", () => {
    expect(ritualSpellLevel({ collegeLevel: 12, prerequisiteCount: 0, points: 0 }).level).toBe(12);
  });

  /** A Hard technique: the first point buys nothing, then a level a point. */
  it("buys the default back as a Hard technique", () => {
    expect(ritualSpellLevel({ collegeLevel: 14, prerequisiteCount: 3, points: 1 }).level).toBe(11);
    expect(ritualSpellLevel({ collegeLevel: 14, prerequisiteCount: 3, points: 2 }).level).toBe(12);
    expect(ritualSpellLevel({ collegeLevel: 14, prerequisiteCount: 3, points: 4 }).level).toBe(14);
  });

  /** "Spells cannot exceed the associated college skill." */
  it("never exceeds the college skill", () => {
    const resolved = ritualSpellLevel({ collegeLevel: 14, prerequisiteCount: 1, points: 6 });
    expect(resolved.level).toBe(14);
    expect(resolved.cappedByCollege).toBe(true);
  });

  it("steps a point at a time, as techniques do", () => {
    expect(nextSpellPoints(2, "H", "ritual")).toBe(3);
    expect(previousSpellPoints(3, "H", "ritual")).toBe(2);
  });

  it("names the college skill both ways the book does", () => {
    expect(collegeSkillNames("Fire")).toEqual(["Path of Fire", "Fire College"]);
    expect(isCollegeSkill("Path of Fire")).toBe(true);
    expect(isCollegeSkill("fire college")).toBe(true);
    expect(isCollegeSkill("Thaumatology")).toBe(false);
  });

  /** "Magery adds to core skill, college skills, and spells." */
  it("adds Ritual Magery to the core and college skills, and Magery to Thaumatology", () => {
    const ritual = { magery: null, ritualMagery: 2 };
    expect(magicSkillBonus("Ritual Magic", ritual)).toBe(2);
    expect(magicSkillBonus("Thaumatology", ritual)).toBe(2);
    expect(magicSkillBonus("Path of Fire", ritual)).toBe(2);
    expect(magicSkillBonus("Stealth", ritual)).toBe(0);

    const standard = { magery: 3, ritualMagery: null };
    expect(magicSkillBonus("Thaumatology", standard)).toBe(3);
    expect(magicSkillBonus("Ritual Magic", standard)).toBe(0);
    expect(magicSkillBonus("Path of Fire", standard)).toBe(0);
  });
});

describe("which style a character uses", () => {
  it("follows the traits when asked to", () => {
    expect(magicStyleFor("auto", { magery: null, ritualMagery: 1 })).toBe("ritual");
    expect(magicStyleFor("auto", { magery: 2, ritualMagery: null })).toBe("standard");
    expect(magicStyleFor("auto", { magery: null, ritualMagery: null })).toBe("standard");
  });

  /** "normal Magery and Ritual Magery are separate advantages" -- somebody with both chooses. */
  it("reads the standard way when both kinds of Magery are held", () => {
    expect(magicStyleFor("auto", { magery: 1, ritualMagery: 1 })).toBe("standard");
    expect(magicStyleFor("ritual", { magery: 1, ritualMagery: 1 })).toBe("ritual");
  });

  it("uses the Magery that belongs to the style", () => {
    const talent = { magery: 2, ritualMagery: 1 };
    expect(mageryForStyle("standard", talent)).toBe(2);
    expect(mageryForStyle("ritual", talent)).toBe(1);
  });
});

describe("reading a prerequisite line", () => {
  it("takes a bare name as a spell", () => {
    expect(parsePrerequisite("Create Fire")).toEqual({ kind: "spell", name: "Create Fire" });
  });

  it("reads Magery and attribute minimums", () => {
    expect(parsePrerequisite("Magery 2")).toEqual({ kind: "magery", level: 2 });
    expect(parsePrerequisite("IQ 13")).toEqual({ kind: "attribute", attribute: "IQ", minimum: 13 });
    expect(parsePrerequisite("IQ 12+")).toEqual({ kind: "attribute", attribute: "IQ", minimum: 12 });
  });

  it("reads the three kinds of count", () => {
    expect(parsePrerequisite("6 Air spells")).toEqual({ kind: "college", college: "Air", count: 6 });
    expect(parsePrerequisite("12 spells")).toEqual({ kind: "spells", count: 12 });
    expect(parsePrerequisite("spells from 10 colleges")).toEqual({ kind: "colleges", count: 10 });
    expect(parsePrerequisite("one spell from each of 10 colleges")).toEqual({ kind: "colleges", count: 10 });
  });

  it("reads a marked advantage or skill", () => {
    expect(parsePrerequisite("Empathy (advantage)")).toEqual({ kind: "trait", name: "Empathy" });
    expect(parsePrerequisite("Locksmith (skill)")).toEqual({ kind: "skill", name: "Locksmith" });
  });

  it("splits clauses on commas and alternatives on 'or'", () => {
    const clauses = parsePrerequisites("Magery 1, Earth to Stone or 4 Earth spells");
    expect(clauses).toHaveLength(2);
    expect(clauses[1]).toEqual([
      { kind: "spell", name: "Earth to Stone" },
      { kind: "college", college: "Earth", count: 4 },
    ]);
    expect(describePrerequisites(clauses)).toBe("Magery 1, Earth to Stone or 4 Earth spells");
  });

  it("reads an empty line as no requirements", () => {
    expect(parsePrerequisites("")).toEqual([]);
    expect(parsePrerequisites("  ,  ")).toEqual([]);
  });
});

describe("checking prerequisites", () => {
  const mage: PrerequisiteContext = {
    magery: 1,
    attributes: { IQ: 12 },
    spells: [
      { name: "Ignite Fire", colleges: ["Fire"], points: 1 },
      { name: "Create Fire", colleges: ["Fire"], points: 2 },
      { name: "Shape Fire", colleges: ["Fire"], points: 0 },
      { name: "Seek Earth", colleges: ["Earth"], points: 1 },
      { name: "Earth to Air", colleges: ["Earth", "Air"], points: 1 },
    ],
    hasTrait: (name) => name === "Empathy",
    hasSkill: (name) => name === "Locksmith",
  };

  it("passes with nothing required", () => {
    expect(checkPrerequisites([], mage)).toEqual({ met: true, missing: [] });
  });

  /** "you must have at least one point in the prerequisite spell" */
  it("counts a spell only once a point is in it", () => {
    expect(checkPrerequisites(parsePrerequisites("Create Fire"), mage).met).toBe(true);
    const check = checkPrerequisites(parsePrerequisites("Shape Fire"), mage);
    expect(check.met).toBe(false);
    expect(check.missing).toEqual(["Shape Fire"]);
  });

  it("holds Magery and attributes to their minimums", () => {
    expect(checkPrerequisites(parsePrerequisites("Magery 1, IQ 12"), mage).met).toBe(true);
    expect(checkPrerequisites(parsePrerequisites("Magery 2"), mage).missing).toEqual(["Magery 2"]);
    expect(checkPrerequisites(parsePrerequisites("IQ 13"), mage).missing).toEqual(["IQ 13"]);
    expect(checkPrerequisites(parsePrerequisites("Magery 1"), { ...mage, magery: null }).met).toBe(false);
  });

  it("is met by any one alternative", () => {
    expect(checkPrerequisites(parsePrerequisites("Truthsayer or Create Fire"), mage).met).toBe(true);
    expect(checkPrerequisites(parsePrerequisites("Magery 3 or Empathy (advantage)"), mage).met).toBe(true);
    expect(checkPrerequisites(parsePrerequisites("Apportation or Locksmith (skill)"), mage).met).toBe(true);
  });

  /** "Earth to Air is both an Earth and an Air spell. This is only important when counting prerequisites." */
  it("counts a spell of two colleges for both", () => {
    expect(checkPrerequisites(parsePrerequisites("2 Earth spells"), mage).met).toBe(true);
    expect(checkPrerequisites(parsePrerequisites("1 Air spells"), mage).met).toBe(true);
    expect(checkPrerequisites(parsePrerequisites("3 Fire spells"), mage).met).toBe(false);
    expect(checkPrerequisites(parsePrerequisites("spells from 3 colleges"), mage).met).toBe(true);
    expect(checkPrerequisites(parsePrerequisites("spells from 4 colleges"), mage).met).toBe(false);
    expect(checkPrerequisites(parsePrerequisites("4 spells"), mage).met).toBe(true);
    expect(checkPrerequisites(parsePrerequisites("5 spells"), mage).met).toBe(false);
  });

  it("matches spell names however they are cased", () => {
    expect(checkPrerequisites(parsePrerequisites("create fire"), mage).met).toBe(true);
  });
});
