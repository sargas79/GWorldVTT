import { describe, expect, it } from "vitest";

import { asSkillOrder, groupSkills, otherOrder } from "../skill-groups.js";

const skills = [
  { id: "1", name: "Stealth", attribute: "DX" as const, points: 2, level: 12, hasDefault: true },
  { id: "2", name: "Brawling", attribute: "DX" as const, points: 0, level: null, hasDefault: false },
  { id: "3", name: "Acting", attribute: "IQ" as const, points: 0, level: 6, hasDefault: true },
  { id: "4", name: "Swimming", attribute: "HT" as const, points: 1, level: 11, hasDefault: true },
  { id: "5", name: "Intimidation", attribute: "Will" as const, points: 4, level: 12, hasDefault: true },
];
const scores = { DX: 12, IQ: 11, HT: 11, ST: 10, Will: 11, Per: 11 };

describe("groupSkills", () => {
  it("groups by attribute in the printed order, heading each with its score", () => {
    const groups = groupSkills(skills, { order: "attribute", scores });
    expect(groups.map((g) => g.attribute)).toEqual(["DX", "IQ", "HT", "Will"]);
    expect(groups[0]?.score).toBe(12);
    expect(groups.map((g) => g.rows.map((r) => r.skill.name))).toEqual([
      ["Brawling", "Stealth"],
      ["Acting"],
      ["Swimming"],
      ["Intimidation"],
    ]);
  });

  /**
   * The reason the module exists: a skill with no points yet sits in its
   * attribute group with the rest, rather than under a heading of its own
   * that it leaves the moment a point is spent.
   */
  it("keeps an untrained skill in its attribute group, marked as such", () => {
    const [dx] = groupSkills(skills, { order: "attribute", scores });
    const brawling = dx?.rows.find((r) => r.skill.name === "Brawling");
    expect(brawling?.trained).toBe(false);
    expect(brawling?.rollable).toBe(false);
    const stealth = dx?.rows.find((r) => r.skill.name === "Stealth");
    expect(stealth?.trained).toBe(true);
    expect(stealth?.rollable).toBe(true);
  });

  it("lets an untrained skill with a default be rolled", () => {
    const [, iq] = groupSkills(skills, { order: "attribute", scores });
    expect(iq?.rows[0]).toMatchObject({ trained: false, rollable: true });
  });

  it("offers one alphabetical list regardless of attribute", () => {
    const groups = groupSkills(skills, { order: "alphabetical", scores });
    expect(groups).toHaveLength(1);
    expect(groups[0]?.attribute).toBeNull();
    expect(groups[0]?.rows.map((r) => r.skill.name)).toEqual([
      "Acting", "Brawling", "Intimidation", "Stealth", "Swimming",
    ]);
  });

  it("shows nothing for a character with no skills", () => {
    expect(groupSkills([], { order: "attribute", scores })).toEqual([]);
    expect(groupSkills([], { order: "alphabetical", scores })).toEqual([]);
  });
});

describe("the order setting", () => {
  it("flips between the two", () => {
    expect(otherOrder("attribute")).toBe("alphabetical");
    expect(otherOrder("alphabetical")).toBe("attribute");
  });

  it("reads anything unrecognised as the printed sheet's order", () => {
    expect(asSkillOrder("alphabetical")).toBe("alphabetical");
    expect(asSkillOrder("attribute")).toBe("attribute");
    expect(asSkillOrder(undefined)).toBe("attribute");
    expect(asSkillOrder("nonsense")).toBe("attribute");
  });
});
