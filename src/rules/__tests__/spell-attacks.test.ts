import { describe, expect, it } from "vitest";

import { formatDiceAdds, parseDiceAdds } from "../dice.js";
import {
  MISSILE_MAX_SECONDS,
  canEnlargeMissile,
  resistanceAttribute,
  resistanceScore,
  ruleOf16,
  spellAffects,
  spellDamage,
  subjectIsLiving,
  rainDamage,
  readSpellDamage,
  spellAttackKind,
} from "../spell-attacks.js";

describe("Missile spells (Characters pp. 240-241)", () => {
  it("can be enlarged for three seconds and no more", () => {
    expect(MISSILE_MAX_SECONDS).toBe(3);
    expect(canEnlargeMissile(1)).toBe(true);
    expect(canEnlargeMissile(2)).toBe(true);
    expect(canEnlargeMissile(3)).toBe(false);
  });

  /** "Most Missile spells inflict 1d of damage per point of energy." */
  it("does a die per point of energy, adds scaling with the dice", () => {
    expect(formatDiceAdds(spellDamage(parseDiceAdds("1d")!, 3))).toBe("3d");
    expect(formatDiceAdds(spellDamage(parseDiceAdds("1d-1")!, 2))).toBe("2d-2");
    expect(spellDamage(parseDiceAdds("1d")!, 0)).toEqual({ dice: 0, adds: 0 });
  });
});

describe("Resisted spells (Characters pp. 241-242; Campaigns p. 349)", () => {
  /** "the attacker's effective skill cannot exceed the higher of 16 and the defender's actual resistance" */
  it("caps the caster at 16, or at the subject's resistance if that is higher", () => {
    expect(ruleOf16(18, 14)).toBe(16);
    expect(ruleOf16(18, 17)).toBe(17);
    expect(ruleOf16(18, 20)).toBe(18);
    expect(ruleOf16(12, 14)).toBe(12);
  });

  /** "The subject's Magic Resistance, if any, adds to his resistance", doubled against an Area spell. */
  it("adds Magic Resistance to the resistance, twice against an Area spell", () => {
    expect(resistanceScore({ score: 12, magicResistance: 3 })).toBe(15);
    expect(resistanceScore({ score: 12, magicResistance: 3, area: true })).toBe(18);
    expect(resistanceScore({ score: 12, magicResistance: 0, area: true })).toBe(12);
  });

  it("reads the attribute a spell is resisted with", () => {
    expect(resistanceAttribute("HT")).toBe("HT");
    expect(resistanceAttribute("Will")).toBe("Will");
    expect(resistanceAttribute("spell")).toBeNull();
    expect(resistanceAttribute("Will or skill")).toBeNull();
    expect(resistanceAttribute("Magelock")).toBeNull();
    expect(subjectIsLiving("HT")).toBe(true);
    expect(subjectIsLiving("spell")).toBe(false);
  });

  /** "If you win, your spell affects the subject. If you lose or tie, the spell has no effect" */
  it("affects a subject the caster beats, and not one who ties", () => {
    expect(spellAffects({ caster: { success: true, margin: 4 }, subject: { success: true, margin: 2 } })).toBe(true);
    expect(spellAffects({ caster: { success: true, margin: 2 }, subject: { success: true, margin: 2 } })).toBe(false);
    expect(spellAffects({ caster: { success: true, margin: 1 }, subject: { success: true, margin: 3 } })).toBe(false);
    expect(spellAffects({ caster: { success: true, margin: 0 }, subject: { success: false, margin: 5 } })).toBe(true);
    expect(spellAffects({ caster: { success: false, margin: 1 }, subject: { success: false, margin: 5 } })).toBe(false);
  });
});

/** Spells that do damage without being Missile or Melee (sargas79/GWorldVTT#192). */
describe("which attack a damaging spell makes", () => {
  it("throws a Missile, strikes with a Melee spell, aims a Regular one, rains an Area one", () => {
    expect(spellAttackKind(["missile"])).toBe("missile");
    expect(spellAttackKind(["melee"])).toBe("melee");
    expect(spellAttackKind(["regular"])).toBe("jet");
    expect(spellAttackKind(["area"])).toBe("rain");
  });

  it("gives nothing to hit with to an Information, Enchantment or Blocking spell", () => {
    expect(spellAttackKind(["information"])).toBeNull();
    expect(spellAttackKind(["regular", "information"])).toBeNull();
    expect(spellAttackKind(["enchantment"])).toBeNull();
    expect(spellAttackKind(["blocking"])).toBeNull();
  });
});

describe("readSpellDamage", () => {
  it("reads dice, and the first of a choice", () => {
    expect(readSpellDamage("~1d-1")).toBe("1d-1");
    expect(readSpellDamage("1d/1d+1")).toBe("1d");
    expect(readSpellDamage("1d+1/2d+1")).toBe("1d+1");
  });

  it("leaves what the spell's own text explains", () => {
    expect(readSpellDamage("Spec.")).toBe("");
    expect(readSpellDamage("HT")).toBe("");
    expect(readSpellDamage("1d|HT")).toBe("");
    expect(readSpellDamage("+2")).toBe("");
  });
});

describe("rainDamage", () => {
  it("is the whole roll for a whole second, and half, rounded down, for less (Magic p. 74)", () => {
    expect(rainDamage(5, true)).toBe(5);
    expect(rainDamage(5, false)).toBe(2);
    expect(rainDamage(-1, true)).toBe(0);
  });
});
