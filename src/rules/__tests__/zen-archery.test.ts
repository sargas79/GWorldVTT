import { describe, expect, it } from "vitest";

import {
  ZEN_ARCHERY_COVERS,
  concentrateTurnsAfterTurn,
  zenConcentrationModifier,
  zenShotBonus,
  zenSkillCovers,
} from "../zen-archery.js";

/**
 * Zen Archery (GURPS Basic Set: Characters p. 228): the roll is -10 on the
 * instant and eases with concentration; a success divides the shot's size and
 * speed/range penalties by three, rounding down.
 */
describe("zenConcentrationModifier", () => {
  it("follows the book's table of turns", () => {
    expect(zenConcentrationModifier(0)).toBe(-10);
    expect(zenConcentrationModifier(1)).toBe(-5);
    expect(zenConcentrationModifier(2)).toBe(-4);
    expect(zenConcentrationModifier(3)).toBe(-4);
    expect(zenConcentrationModifier(4)).toBe(-3);
    expect(zenConcentrationModifier(7)).toBe(-3);
    expect(zenConcentrationModifier(8)).toBe(-2);
    expect(zenConcentrationModifier(15)).toBe(-2);
    expect(zenConcentrationModifier(16)).toBe(-1);
    expect(zenConcentrationModifier(31)).toBe(-1);
    expect(zenConcentrationModifier(32)).toBe(0);
    expect(zenConcentrationModifier(100)).toBe(0);
  });

  it("reads nonsense as no concentration at all", () => {
    expect(zenConcentrationModifier(-3)).toBe(-10);
    expect(zenConcentrationModifier(Number.NaN)).toBe(-10);
  });
});

describe("zenShotBonus", () => {
  it("leaves a third of the size and range penalties, rounded down", () => {
    // -7 for range and -2 for SM: -9 becomes -3, so +6.
    expect(zenShotBonus({ size: -2, speedRange: -7 })).toBe(6);
    // -7 becomes -2 (round down), so +5.
    expect(zenShotBonus({ size: 0, speedRange: -7 })).toBe(5);
    // -1 and -2 are each less than a whole third: nothing is left.
    expect(zenShotBonus({ size: 0, speedRange: -2 })).toBe(2);
  });

  it("adds up only penalties: a large target keeps its bonus", () => {
    expect(zenShotBonus({ size: 2, speedRange: -6 })).toBe(4);
    expect(zenShotBonus({ size: 3, speedRange: 0 })).toBe(0);
  });

  it("gives nothing where there was nothing to ease", () => {
    expect(zenShotBonus({ size: 0, speedRange: 0 })).toBe(0);
  });
});

describe("zenSkillCovers", () => {
  it("covers the bow, and not the crossbow or a sling", () => {
    expect(zenSkillCovers(ZEN_ARCHERY_COVERS, "Bow")).toBe(true);
    expect(zenSkillCovers(ZEN_ARCHERY_COVERS, "bow")).toBe(true);
    expect(zenSkillCovers(ZEN_ARCHERY_COVERS, "Crossbow")).toBe(false);
    expect(zenSkillCovers(ZEN_ARCHERY_COVERS, "Sling")).toBe(false);
    expect(zenSkillCovers(ZEN_ARCHERY_COVERS, "")).toBe(false);
  });

  it("covers a named skill's specialties, whatever its tech level", () => {
    expect(zenSkillCovers(["Guns"], "Guns/TL8 (Pistol)")).toBe(true);
    expect(zenSkillCovers(["Guns"], "Guns (Rifle)")).toBe(true);
    expect(zenSkillCovers(["Guns (Rifle)"], "Guns/TL7 (Rifle)")).toBe(true);
    expect(zenSkillCovers(["Guns (Rifle)"], "Guns (Pistol)")).toBe(false);
    expect(zenSkillCovers(["Gunner"], "Guns (Rifle)")).toBe(false);
  });
});

describe("concentrateTurnsAfterTurn", () => {
  it("counts unbroken turns of Concentrate, and starts again after anything else", () => {
    expect(concentrateTurnsAfterTurn(0, "concentrate")).toBe(1);
    expect(concentrateTurnsAfterTurn(4, "concentrate")).toBe(5);
    expect(concentrateTurnsAfterTurn(4, "attack")).toBe(0);
    expect(concentrateTurnsAfterTurn(4, "aim")).toBe(0);
  });
});
