import { describe, expect, it } from "vitest";

import { isWildcardSkill, rolledSkillName } from "../../rules/skills.js";
import {
  attackSkillOptions,
  holdsAWildcard,
  rolledWithChosenSkill,
  type HeldSkill,
} from "../sheet-v2/attack-skills.js";

/**
 * Choosing what an attack is rolled with (GURPS Basic Set: Characters p. 175).
 *
 * The bug this answers: a character who had bought a wildcard covering the
 * weapon still attacked at the default for the skill the weapon names, because
 * they held no skill item of that exact name.
 */
const format = ({ name, level }: { name: string; level: number | null }) =>
  level === null ? name : `${name} ${level}`;
const weaponsOwnLabel = ({ name }: { name: string }) => `${name} (the weapon's own)`;

const skills: HeldSkill[] = [
  { name: "Sword!", level: 15 },
  { name: "Stealth", level: 12 },
  { name: "Brawling", level: 13 },
  { name: "Broadsword", level: 10 },
];

describe("a wildcard skill", () => {
  /** "Wildcard skills are always written with a '!' after the skill name." */
  it("is the one written with a bang", () => {
    expect(isWildcardSkill("Sword!")).toBe(true);
    expect(isWildcardSkill("  gun!  ")).toBe(true);
    expect(isWildcardSkill("Broadsword")).toBe(false);
    expect(isWildcardSkill("")).toBe(false);
  });

  it("is spotted among the skills a character holds", () => {
    expect(holdsAWildcard(skills)).toBe(true);
    expect(holdsAWildcard([{ name: "Broadsword", level: 14 }])).toBe(false);
  });
});

describe("the skill an attack is rolled with", () => {
  it("is the weapon's own until one is chosen", () => {
    expect(rolledSkillName({ skill: "Broadsword", skillChoice: "" })).toBe("Broadsword");
    expect(rolledSkillName({ skill: "Broadsword", skillChoice: "Sword!" })).toBe("Sword!");
    expect(rolledSkillName({ skill: "Broadsword", skillChoice: "   " })).toBe("Broadsword");
    expect(rolledSkillName({})).toBe("");
  });

  it("says when the row is no longer on the weapon's own skill", () => {
    expect(rolledWithChosenSkill("Broadsword", "")).toBe(false);
    expect(rolledWithChosenSkill("Broadsword", "Sword!")).toBe(true);
    // The same skill chosen explicitly is not a change; "Guns/TL (Pistol)" and
    // "Guns (Pistol)" are the same skill written two ways.
    expect(rolledWithChosenSkill("Broadsword", "broadsword")).toBe(false);
    expect(rolledWithChosenSkill("Guns/TL (Pistol)", "Guns (Pistol)")).toBe(false);
  });
});

describe("the picker's options", () => {
  it("offers the weapon's own skill first, then the character's, best first", () => {
    const options = attackSkillOptions({ modeSkill: "Broadsword", chosen: "", skills, format, weaponsOwnLabel });
    expect(options.map((o) => o.label)).toEqual([
      "Broadsword (the weapon's own)",
      "Sword! 15",
      "Brawling 13",
      "Stealth 12",
    ]);
    expect(options[0]?.selected).toBe(true);
    expect(options[0]?.isDefault).toBe(true);
  });

  it("does not offer the weapon's own skill twice", () => {
    const options = attackSkillOptions({ modeSkill: "Broadsword", chosen: "", skills, format, weaponsOwnLabel });
    expect(options.filter((o) => o.value === "Broadsword")).toEqual([]);
  });

  it("marks the chosen skill, however it was written", () => {
    const options = attackSkillOptions({ modeSkill: "Broadsword", chosen: "sword!", skills, format, weaponsOwnLabel });
    expect(options.find((o) => o.selected)?.value).toBe("Sword!");
    expect(options[0]?.selected).toBe(false);
  });

  /** The reset the issue asks for: the first entry puts the row back. */
  it("always offers the way back to the weapon's own skill", () => {
    const options = attackSkillOptions({ modeSkill: "Broadsword", chosen: "Sword!", skills, format, weaponsOwnLabel });
    expect(options[0]).toMatchObject({ value: "", isDefault: true, selected: false });
  });

  it("keeps a chosen skill the character no longer has, rather than lying about the row", () => {
    const options = attackSkillOptions({ modeSkill: "Broadsword", chosen: "Sword!", skills: [{ name: "Stealth", level: 12 }], format, weaponsOwnLabel });
    expect(options.map((o) => [o.value, o.selected])).toEqual([
      ["", false],
      ["Stealth", false],
      ["Sword!", true],
    ]);
  });

  it("leaves out a skill with no name", () => {
    const options = attackSkillOptions({ modeSkill: "Broadsword", chosen: "", skills: [{ name: "  ", level: 9 }], format, weaponsOwnLabel });
    expect(options).toHaveLength(1);
  });
});
