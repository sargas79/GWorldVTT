import { describe, expect, it } from "vitest";

import { perDieOfBasicDamage } from "../damage.js";
import {
  ALL_WEAPONS_LEVEL,
  inWeaponMasterClass,
  isWeaponMaster,
  thrownDamageBonusPerDie,
  weaponMasterBonusPerDie,
  weaponMasterDamage,
  weaponMasteryFrom,
} from "../weapon-master.js";

/**
 * Weapon Master (GURPS Basic Set: Characters p. 99): +1 per die to basic
 * thrust or swing damage with a weapon in the class at DX+1 in its skill, +2
 * at DX+2, nothing at default; Throwing Art's bonus replaces it (p. 226).
 */
describe("isWeaponMaster", () => {
  it("reads the trait by name, with or without its weapons", () => {
    expect(isWeaponMaster("Weapon Master")).toBe(true);
    expect(isWeaponMaster("Weapon Master (Rapier)")).toBe(true);
    expect(isWeaponMaster("weapon master (swords)")).toBe(true);
    expect(isWeaponMaster("Trained By A Master")).toBe(false);
    expect(isWeaponMaster("Weapon Bond")).toBe(false);
  });
});

describe("weaponMasteryFrom", () => {
  it("takes a trait's own list of weapons", () => {
    expect(weaponMasteryFrom([
      { name: "Weapon Master (Knightly weapons)", levels: 3, masteredWeapons: ["Broadsword", "Axe/Mace", " ", "Shield"] },
    ])).toEqual({ all: false, entries: ["Broadsword", "Axe/Mace", "Shield"] });
  });

  it("reads the name in parentheses when there is no list", () => {
    expect(weaponMasteryFrom([{ name: "Weapon Master (Rapier)", levels: 1 }])).toEqual({ all: false, entries: ["Rapier"] });
    expect(weaponMasteryFrom([{ name: "Weapon Master", levels: 1, masteredWeapons: [] }])).toEqual({ all: false, entries: [] });
  });

  it("takes in every weapon at the sixth level", () => {
    expect(weaponMasteryFrom([{ name: "Weapon Master", levels: ALL_WEAPONS_LEVEL }]).all).toBe(true);
  });

  it("puts several Weapon Masters together and ignores other traits", () => {
    expect(weaponMasteryFrom([
      { name: "Weapon Master (Rapier)", levels: 1 },
      { name: "Weapon Master (Bow)", levels: 1 },
      { name: "Combat Reflexes (Rapier)", levels: 1, masteredWeapons: ["Knife"] },
    ])).toEqual({ all: false, entries: ["Rapier", "Bow"] });
  });
});

describe("inWeaponMasterClass", () => {
  const sword = { name: "Broadsword", skills: ["Broadsword", "Broadsword"] };
  const dagger = { name: "Dagger", skills: ["Knife", "Thrown Weapon (Knife)"] };
  const katana = { name: "Katana", skills: ["Broadsword", "Two-Handed Sword"] };

  it("matches a weapon by the skill of any of its modes", () => {
    const mastery = { all: false, entries: ["Knife"] };
    expect(inWeaponMasterClass(mastery, dagger)).toBe(true);
    expect(inWeaponMasterClass(mastery, sword)).toBe(false);
  });

  it("matches a weapon by its own name, whatever its skill", () => {
    const mastery = { all: false, entries: ["katana"] };
    expect(inWeaponMasterClass(mastery, katana)).toBe(true);
    expect(inWeaponMasterClass(mastery, sword)).toBe(false);
  });

  it("lets a skill without its specialty take in every specialty", () => {
    expect(inWeaponMasterClass({ all: false, entries: ["Thrown Weapon"] }, dagger)).toBe(true);
    expect(inWeaponMasterClass({ all: false, entries: ["Thrown Weapon (Axe/Mace)"] }, dagger)).toBe(false);
  });

  it("takes in everything for all muscle-powered weapons, and nothing with no entries", () => {
    expect(inWeaponMasterClass({ all: true, entries: [] }, sword)).toBe(true);
    expect(inWeaponMasterClass({ all: false, entries: [] }, sword)).toBe(false);
  });
});

describe("weaponMasterBonusPerDie", () => {
  it("is nothing at DX, +1 at DX+1 and +2 from DX+2", () => {
    expect(weaponMasterBonusPerDie(12, 12)).toBe(0);
    expect(weaponMasterBonusPerDie(13, 12)).toBe(1);
    expect(weaponMasterBonusPerDie(14, 12)).toBe(2);
    expect(weaponMasterBonusPerDie(20, 12)).toBe(2);
  });

  it("is nothing for a skill used at default", () => {
    expect(weaponMasterBonusPerDie(null, 12)).toBe(0);
  });
});

describe("weaponMasterDamage", () => {
  it("adds the bonus per die of the thrust or swing rolled", () => {
    // ST 13 thrusts 1d and swings 2d-1; ST 19 swings 3d+1.
    expect(weaponMasterDamage(1, "sw", 13)).toBe(2);
    expect(weaponMasterDamage(2, "thr", 13)).toBe(2);
    expect(weaponMasterDamage(2, "sw", 19)).toBe(6);
  });

  it("counts the dice at the ST a weapon's minimum caps damage at", () => {
    // A minimum ST of 5 caps damage at ST 15, which swings 2d+1, not 3d+1.
    expect(weaponMasterDamage(1, "sw", 19, 5)).toBe(2);
  });

  it("adds nothing to fixed damage", () => {
    expect(weaponMasterDamage(2, "fixed", 13)).toBe(0);
    expect(perDieOfBasicDamage(2, "", 13)).toBe(0);
  });
});

describe("thrownDamageBonusPerDie", () => {
  it("uses Throwing Art's bonus instead of Weapon Master's where it gives one", () => {
    expect(thrownDamageBonusPerDie({ throwingArt: 1, weaponMaster: 2 })).toBe(1);
    expect(thrownDamageBonusPerDie({ throwingArt: 2, weaponMaster: 0 })).toBe(2);
  });

  it("keeps Weapon Master's where Throwing Art gives nothing", () => {
    expect(thrownDamageBonusPerDie({ throwingArt: 0, weaponMaster: 2 })).toBe(2);
  });
});
