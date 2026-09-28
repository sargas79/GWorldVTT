import { describe, expect, it } from "vitest";

import {
  fastDrawAmmoPenalty,
  fasterShootingDefault,
  GUNSLINGER_SKILLS,
  gunslingerAccuracy,
  gunslingerWeapon,
  halvePenaltyInFavour,
  isGunslingerSkill,
} from "../gunslinger.js";
import { resolveTechniqueDefaults } from "../skills.js";
import { noTraitEffects, traitEffects } from "../trait-effects.js";

/** Gunslinger, Characters p. 58 (the Revised edition's list). */
describe("Gunslinger's skills", () => {
  it("covers Beam Weapons, Gunner, Guns and Liquid Projector, whatever the specialty", () => {
    expect(GUNSLINGER_SKILLS).toEqual(["Beam Weapons", "Gunner", "Guns", "Liquid Projector"]);
    expect(isGunslingerSkill("Guns (Pistol)")).toBe(true);
    expect(isGunslingerSkill("Guns")).toBe(true);
    expect(isGunslingerSkill("Beam Weapons (Rifle)")).toBe(true);
    expect(isGunslingerSkill("Gunner (Machine Gun)")).toBe(true);
    expect(isGunslingerSkill("Liquid Projector (Flamethrower)")).toBe(true);
    expect(isGunslingerSkill("guns (pistol)")).toBe(true);
  });

  it("leaves out muscle-powered missile weapons", () => {
    for (const skill of [
      "Bow",
      "Crossbow",
      "Sling",
      "Blowpipe",
      "Throwing",
      "Thrown Weapon (Knife)",
      "Spear Thrower",
      "Innate Attack (Projectile)",
      "",
    ]) {
      expect(isGunslingerSkill(skill)).toBe(false);
    }
  });

  it("only makes a weapon a Gunslinger's for a Gunslinger, with one of them", () => {
    expect(gunslingerWeapon({ gunslinger: true, skill: "Guns (Pistol)" })).toEqual({
      twoHanded: false,
    });
    expect(gunslingerWeapon({ gunslinger: true, skill: "Guns (Rifle)", twoHanded: true })).toEqual({
      twoHanded: true,
    });
    expect(gunslingerWeapon({ gunslinger: true, skill: "Bow" })).toBeNull();
    expect(gunslingerWeapon({ gunslinger: false, skill: "Guns (Pistol)" })).toBeNull();
  });
});

describe("Gunslinger's Accuracy without an Aim maneuver", () => {
  it("adds the weapon's full Acc for single shots (RoF 1-3) from a one-handed gun", () => {
    expect(gunslingerAccuracy({ accuracy: 3, shots: 1, twoHanded: false })).toBe(3);
    expect(gunslingerAccuracy({ accuracy: 3, shots: 2, twoHanded: false })).toBe(3);
    expect(gunslingerAccuracy({ accuracy: 3, shots: 3, twoHanded: false })).toBe(3);
  });

  it("adds half Acc, rounded up, with a two-handed weapon", () => {
    expect(gunslingerAccuracy({ accuracy: 5, shots: 1, twoHanded: true })).toBe(3);
    expect(gunslingerAccuracy({ accuracy: 4, shots: 1, twoHanded: true })).toBe(2);
    expect(gunslingerAccuracy({ accuracy: 1, shots: 1, twoHanded: true })).toBe(1);
  });

  it("adds half Acc, rounded up, for automatic fire, one hand or two", () => {
    expect(gunslingerAccuracy({ accuracy: 3, shots: 4, twoHanded: false })).toBe(2);
    expect(gunslingerAccuracy({ accuracy: 3, shots: 20, twoHanded: true })).toBe(2);
  });

  it("adds nothing for a weapon with no Acc", () => {
    expect(gunslingerAccuracy({ accuracy: 0, shots: 1, twoHanded: false })).toBe(0);
    expect(gunslingerAccuracy({ accuracy: -1, shots: 1, twoHanded: true })).toBe(0);
  });
});

describe("Gunslinger's halved penalties", () => {
  it("halves a penalty and rounds in the shooter's favour", () => {
    expect(halvePenaltyInFavour(-4)).toBe(-2);
    expect(halvePenaltyInFavour(-5)).toBe(-2);
    expect(halvePenaltyInFavour(-1)).toBe(0);
    expect(halvePenaltyInFavour(0)).toBe(0);
    expect(halvePenaltyInFavour(2)).toBe(2);
  });

  it("halves a faster-shooting technique's default only for a Gunslinger", () => {
    expect(fasterShootingDefault(-4, true)).toBe(-2);
    expect(fasterShootingDefault(-3, true)).toBe(-1);
    expect(fasterShootingDefault(-4, false)).toBe(-4);
  });

  it("buys the technique up from the improved default", () => {
    // A technique defaulting to its skill at -4, with Guns at 14 and 2 levels bought.
    const bought = (modifier: number) =>
      resolveTechniqueDefaults({ defaults: [{ base: 14, modifier }], levels: 2 })?.level;
    expect(bought(-4)).toBe(12);
    expect(bought(fasterShootingDefault(-4, true))).toBe(14);
    // The prerequisite skill still caps it.
    expect(
      resolveTechniqueDefaults({
        defaults: [{ base: 14, modifier: fasterShootingDefault(-4, true) }],
        levels: 4,
      })?.level,
    ).toBe(14);
  });

  it("halves the sum of all Fast-Draw (Ammo) penalties, not each of them", () => {
    expect(fastDrawAmmoPenalty([-1, -1, -1], true)).toBe(-1);
    expect(fastDrawAmmoPenalty([-2, -3], true)).toBe(-2);
    expect(fastDrawAmmoPenalty([-2, -3], false)).toBe(-5);
    expect(fastDrawAmmoPenalty([-4, +2], true)).toBe(-2);
    expect(fastDrawAmmoPenalty([], true)).toBe(0);
  });
});

describe("the Gunslinger trait", () => {
  const held = (name: string) => ({ name });

  it("is read as a trait effect", () => {
    expect(noTraitEffects().gunslinger).toBe(false);
    expect(traitEffects([held("Gunslinger")]).gunslinger).toBe(true);
    expect(traitEffects([held("Ambidexterity")]).gunslinger).toBe(false);
  });
});
