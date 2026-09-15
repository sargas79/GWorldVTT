import { describe, expect, it } from "vitest";

import { inSkillFamily } from "../technique-skills.js";
import {
  THROWING_ART,
  coveredByThrowingArt,
  throwingArtAttack,
  throwingArtBonus,
  throwingArtDamage,
} from "../throwing-art.js";

/**
 * Throwing Art (GURPS Basic Set: Characters p. 226): it covers Throwing and
 * Thrown Weapon, and at DX gives +1 to ST for distance and +1 per die of
 * thrown damage, +2 at DX+1 or better.
 */
describe("coveredByThrowingArt", () => {
  it("stands in for Throwing and every Thrown Weapon specialty", () => {
    expect(coveredByThrowingArt("Throwing")).toBe(true);
    expect(coveredByThrowingArt("Thrown Weapon (Knife)")).toBe(true);
    expect(coveredByThrowingArt("Thrown Weapon (Axe/Mace)")).toBe(true);
    expect(coveredByThrowingArt("thrown weapon (spear)")).toBe(true);
  });

  it("leaves the skills it does not name alone", () => {
    expect(coveredByThrowingArt("Spear Thrower")).toBe(false);
    expect(coveredByThrowingArt("Bolas")).toBe(false);
    expect(coveredByThrowingArt("Lasso")).toBe(false);
    expect(coveredByThrowingArt("Net")).toBe(false);
    expect(coveredByThrowingArt("Bow")).toBe(false);
    expect(coveredByThrowingArt("Knife")).toBe(false);
    expect(coveredByThrowingArt(THROWING_ART)).toBe(false);
  });
});

describe("throwingArtBonus", () => {
  it("is nothing below DX, +1 at DX, and +2 from DX+1", () => {
    expect(throwingArtBonus(11, 12)).toBe(0);
    expect(throwingArtBonus(12, 12)).toBe(1);
    expect(throwingArtBonus(13, 12)).toBe(2);
    expect(throwingArtBonus(18, 12)).toBe(2);
  });

  it("is nothing without the skill", () => {
    expect(throwingArtBonus(null, 12)).toBe(0);
  });
});

describe("throwingArtDamage", () => {
  it("adds the bonus per die of the thrower's thrust or swing", () => {
    // ST 13 thrusts 1d and swings 2d-1; ST 19 thrusts 2d-1 and swings 3d+1.
    expect(throwingArtDamage(2, "thr", 13)).toBe(2);
    expect(throwingArtDamage(2, "sw", 13)).toBe(4);
    expect(throwingArtDamage(1, "thr", 19)).toBe(2);
    expect(throwingArtDamage(1, "sw", 19)).toBe(3);
  });

  it("adds nothing to fixed damage, or without a bonus", () => {
    expect(throwingArtDamage(2, "fixed", 13)).toBe(0);
    expect(throwingArtDamage(0, "sw", 13)).toBe(0);
  });
});

describe("throwingArtAttack", () => {
  it("rolls Throwing Art when it is better than the weapon's skill", () => {
    expect(
      throwingArtAttack({ skill: "Thrown Weapon (Knife)", level: 12, atDefault: false, throwingArt: 14, dx: 12 }),
    ).toEqual({ skill: THROWING_ART, level: 14, atDefault: false, bonus: 2 });
  });

  it("rolls it over a default, and in place of a skill the character never learned", () => {
    expect(
      throwingArtAttack({ skill: "Throwing", level: 9, atDefault: true, throwingArt: 12, dx: 12 }),
    ).toEqual({ skill: THROWING_ART, level: 12, atDefault: false, bonus: 1 });
    expect(
      throwingArtAttack({ skill: "Thrown Weapon (Shuriken)", level: null, atDefault: false, throwingArt: 10, dx: 12 }),
    ).toEqual({ skill: THROWING_ART, level: 10, atDefault: false, bonus: 0 });
  });

  it("keeps the weapon's own skill when it is as good, with the bonus still given", () => {
    expect(
      throwingArtAttack({ skill: "Thrown Weapon (Spear)", level: 15, atDefault: false, throwingArt: 13, dx: 12 }),
    ).toEqual({ skill: "Thrown Weapon (Spear)", level: 15, atDefault: false, bonus: 2 });
    expect(
      throwingArtAttack({ skill: "Thrown Weapon (Spear)", level: 13, atDefault: false, throwingArt: 13, dx: 12 }),
    ).toEqual({ skill: "Thrown Weapon (Spear)", level: 13, atDefault: false, bonus: 2 });
  });

  it("changes nothing without Throwing Art, or for a skill it does not cover", () => {
    expect(
      throwingArtAttack({ skill: "Thrown Weapon (Knife)", level: 12, atDefault: false, throwingArt: null, dx: 12 }),
    ).toEqual({ skill: "Thrown Weapon (Knife)", level: 12, atDefault: false, bonus: 0 });
    expect(
      throwingArtAttack({ skill: "Spear Thrower", level: 11, atDefault: false, throwingArt: 16, dx: 12 }),
    ).toEqual({ skill: "Spear Thrower", level: 11, atDefault: false, bonus: 0 });
  });
});

describe("Throwing Art among the ranged skills", () => {
  it("qualifies for techniques on ranged combat skills", () => {
    expect(inSkillFamily(THROWING_ART, "ranged")).toBe(true);
  });
});
