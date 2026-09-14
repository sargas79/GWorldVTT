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
