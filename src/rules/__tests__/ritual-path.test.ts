import { describe, expect, it } from "vitest";

import {
  PATHS,
  isRitualAdept,
  manaReserveMax,
  pathCeiling,
  pathLevel,
  pathOfSkill,
  pathSkillName,
} from "../ritual-path.js";

/** Monster Hunters 1 pp. 32-33. */
describe("the nine Paths", () => {
  it("are nine, each a skill named for it", () => {
    expect(PATHS).toHaveLength(9);
    expect(pathSkillName("Undead")).toBe("Path of Undead");
    expect(pathOfSkill("path of crossroads")).toBe("Crossroads");
    expect(pathOfSkill("Path of Air")).toBe(null);
    expect(pathOfSkill("Thaumatology")).toBe(null);
  });
});

describe("how high a Path may be", () => {
  it("is the lower of Thaumatology and 12 + Magery", () => {
    // "A sage with Thaumatology-15 and Magery 3" (p. 38).
    expect(pathCeiling({ thaumatology: 15, magery: 3 })).toBe(15);
    expect(pathCeiling({ thaumatology: 15, magery: 2 })).toBe(14);
    // Sabrina: Magery 0 and Thaumatology-21, "limited to 12" (p. 37).
    expect(pathCeiling({ thaumatology: 21, magery: 0 })).toBe(12);
  });

  it("is nothing at all without Thaumatology", () => {
    expect(pathCeiling({ thaumatology: null, magery: 5 })).toBe(null);
    expect(pathLevel({ trained: 14, thaumatology: null, magery: 5 }).level).toBe(null);
  });
});

describe("a Path's level", () => {
  it("defaults to Thaumatology-6, never past 12", () => {
    expect(pathLevel({ trained: null, thaumatology: 15, magery: 2 })).toEqual({ level: 9, atDefault: true, capped: false });
    // "an untrained caster with a Thaumatology skill of 18 is identical to one
    // with a higher Thaumatology skill" (p. 33).
    expect(pathLevel({ trained: null, thaumatology: 18, magery: 5 }).level).toBe(12);
    expect(pathLevel({ trained: null, thaumatology: 30, magery: 5 }).level).toBe(12);
  });

  it("takes points in the Path where they are better, held to the ceiling", () => {
    // Thomas: Magery 5, Thaumatology-19, Path of Spirit-17 (p. 37).
    expect(pathLevel({ trained: 17, thaumatology: 19, magery: 5 })).toEqual({ level: 17, atDefault: false, capped: false });
    expect(pathLevel({ trained: 16, thaumatology: 15, magery: 3 })).toEqual({ level: 15, atDefault: false, capped: true });
  });
});

describe("the mana reserve (p. 36)", () => {
  it("holds Magery x 3, and nothing without Magery", () => {
    expect(manaReserveMax(5)).toBe(15);
    expect(manaReserveMax(0)).toBe(0);
    expect(manaReserveMax(null)).toBe(0);
  });
});

describe("Ritual Adept (p. 25)", () => {
  it("is known by its name", () => {
    expect(isRitualAdept("Ritual Adept")).toBe(true);
    expect(isRitualAdept("Ritual Magery")).toBe(false);
  });
});
