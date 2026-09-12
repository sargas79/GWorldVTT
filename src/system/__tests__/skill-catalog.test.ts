import { describe, expect, it } from "vitest";

import { catalogSkill, defaultLevelFrom, setSkillCatalog } from "../skill-catalog.js";

const attributes = { ST: 11, DX: 12, IQ: 13, HT: 10, Will: 13, Per: 13 } as const;
const score = (a: keyof typeof attributes) => attributes[a];

describe("defaultLevelFrom", () => {
  /** "Guns (Pistol) defaults to DX-4": anybody can pull a trigger. */
  it("takes the best attribute default", () => {
    const level = defaultLevelFrom(
      [
        { from: "attribute", attribute: "DX", skill: "", modifier: -4 },
        { from: "attribute", attribute: "IQ", skill: "", modifier: -6 },
      ],
      score,
      () => null,
    );
    expect(level).toBe(8);
  });

  it("takes a default from a skill the character has, and ignores one they lack", () => {
    const skills: Record<string, number> = { "Guns/TL (Rifle)": 14 };
    const level = defaultLevelFrom(
      [
        { from: "attribute", attribute: "DX", skill: "", modifier: -4 },
        { from: "skill", attribute: "DX", skill: "Guns (Rifle)", modifier: -2 },
        { from: "skill", attribute: "DX", skill: "Guns (Shotgun)", modifier: -2 },
      ],
      score,
      (name) => skills[name] ?? skills[`${name.replace(" (", "/TL (")}`] ?? null,
    );
    expect(level).toBe(12);
  });

  it("applies the Rule of 20 to an attribute default", () => {
    const level = defaultLevelFrom(
      [{ from: "attribute", attribute: "DX", skill: "", modifier: -4 }],
      () => 25,
      () => null,
    );
    expect(level).toBe(16);
  });

  /** A skill with no default cannot be used untrained at all. */
  it("is null when the book lists no default", () => {
    expect(defaultLevelFrom([], score, () => null)).toBeNull();
    expect(
      defaultLevelFrom(
        [{ from: "skill", attribute: "DX", skill: "Karate", modifier: -3 }],
        score,
        () => null,
      ),
    ).toBeNull();
  });
});

describe("the catalog", () => {
  it("finds a skill by name, with or without its /TL marker", () => {
    setSkillCatalog([
      { name: "Guns/TL (Pistol)", attribute: "DX", defaults: [] },
      { name: "Brawling", attribute: "DX", defaults: [] },
    ]);
    expect(catalogSkill("Guns (Pistol)")?.name).toBe("Guns/TL (Pistol)");
    expect(catalogSkill("brawling")?.name).toBe("Brawling");
    expect(catalogSkill("Karate")).toBeNull();
    setSkillCatalog([]);
  });
});
