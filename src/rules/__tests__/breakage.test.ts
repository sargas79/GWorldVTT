import { describe, expect, it } from "vitest";

import {
  brokenWeaponKindFor,
  brokenWeaponResult,
  heavyParryBreakChance,
  heavyParryOutcome,
  isSolidCrushing,
  maxParryableWeight,
  resistsBreakage,
  strikeAtWeaponPenalty,
  unarmedAttackWeight,
  weaponCondition,
  weaponDr,
  weaponHitPoints,
  weaponState,
} from "../breakage.js";

describe("Parrying Heavy Weapons (Campaigns p. 376)", () => {
  it("breaks 2 in 6 at three times the weight, +1 per whole multiple past that", () => {
    // A 3 lb broadsword parrying a 9 lb maul.
    expect(heavyParryBreakChance({ parryingWeight: 3, attackingWeight: 9, quality: "good" })).toBe(2);
    expect(heavyParryBreakChance({ parryingWeight: 3, attackingWeight: 12, quality: "good" })).toBe(3);
    expect(heavyParryBreakChance({ parryingWeight: 3, attackingWeight: 15, quality: "good" })).toBe(4);
    // Below three times, nothing.
    expect(heavyParryBreakChance({ parryingWeight: 3, attackingWeight: 8, quality: "good" })).toBe(0);
  });

  it("is worse for a cheap weapon and better for a fine one", () => {
    expect(heavyParryBreakChance({ parryingWeight: 3, attackingWeight: 9, quality: "cheap" })).toBe(4);
    expect(heavyParryBreakChance({ parryingWeight: 3, attackingWeight: 9, quality: "fine" })).toBe(1);
    expect(heavyParryBreakChance({ parryingWeight: 3, attackingWeight: 9, quality: "veryFine" })).toBe(0);
  });

  it("breaks on a die at or under the chance, and the parry still counts unless the odds passed six", () => {
    expect(heavyParryOutcome(2, 2)).toEqual({ chance: 2, breaks: true, parryCounts: true });
    expect(heavyParryOutcome(2, 3)).toEqual({ chance: 2, breaks: false, parryCounts: true });
    // A knife parrying a tree trunk: 7 in 6, and the parry is worth nothing.
    expect(heavyParryOutcome(7, 5)).toEqual({ chance: 7, breaks: true, parryCounts: false });
    expect(heavyParryOutcome(0, 1).breaks).toBe(false);
  });

  it("weighs a punch at a tenth of ST and a slam at the whole of it", () => {
    expect(unarmedAttackWeight(15)).toBe(1.5);
    expect(unarmedAttackWeight(15, true)).toBe(15);
  });

  it("refuses to parry anything over Basic Lift, or twice it with two hands", () => {
    expect(maxParryableWeight(20, false)).toBe(20);
    expect(maxParryableWeight(20, true)).toBe(40);
  });
});

describe("the resistant weapons of the Critical Miss Table (p. 556)", () => {
  it("names fine weapons, solid crushing ones, magic ones and most firearms", () => {
    const plain = { solidCrushing: false, magic: false, firearm: false };
    expect(resistsBreakage({ quality: "fine", ...plain })).toBe(true);
    expect(resistsBreakage({ quality: "good", ...plain })).toBe(false);
    expect(resistsBreakage({ quality: "good", ...plain, solidCrushing: true })).toBe(true);
    expect(resistsBreakage({ quality: "good", ...plain, magic: true })).toBe(true);
    expect(resistsBreakage({ quality: "good", ...plain, firearm: true })).toBe(true);
    expect(resistsBreakage({ quality: "good", ...plain, firearm: true, wheelLockOrGuidedOrBeam: true })).toBe(false);
  });

  it("calls a mace solid crushing and an axe not", () => {
    expect(isSolidCrushing("Axe/Mace", ["cr"])).toBe(true);
    expect(isSolidCrushing("Axe/Mace", ["cut"])).toBe(false);
    expect(isSolidCrushing("Broadsword", ["cr"])).toBe(false);
  });
});

describe("Striking at Weapons (p. 400)", () => {
  it("is -5 for a knife or a pistol, -4 for reach 1 or a carbine, -3 for reach 2+ or a rifle", () => {
    expect(strikeAtWeaponPenalty({ reach: "C" })).toBe(-5);
    expect(strikeAtWeaponPenalty({ reach: "C,1" })).toBe(-4);
    expect(strikeAtWeaponPenalty({ reach: "1" })).toBe(-4);
    expect(strikeAtWeaponPenalty({ reach: "1,2*" })).toBe(-3);
    expect(strikeAtWeaponPenalty({ reach: "2,3" })).toBe(-3);
    expect(strikeAtWeaponPenalty({ bulk: -2 })).toBe(-5);
    expect(strikeAtWeaponPenalty({ bulk: -3 })).toBe(-4);
    expect(strikeAtWeaponPenalty({ bulk: -5 })).toBe(-3);
  });
});

describe("a weapon as an object (pp. 483-485)", () => {
  it("gives a sword DR 6, an axe or a gun DR 4, a staff DR 2", () => {
    expect(weaponDr({ material: "", skill: "Broadsword", firearm: false })).toBe(6);
    expect(weaponDr({ material: "", skill: "Axe/Mace", firearm: false })).toBe(4);
    expect(weaponDr({ material: "", skill: "Guns (Rifle)", firearm: true })).toBe(4);
    expect(weaponDr({ material: "", skill: "Staff", firearm: false })).toBe(2);
    expect(weaponDr({ material: "wood", skill: "Axe/Mace", firearm: false })).toBe(2);
  });

  it("reads HP off the weight, solid or machine", () => {
    // 8 x cube root of 8 = 16 for a solid 8 lb thing; 4 x 2 = 8 for a machine.
    expect(weaponHitPoints(8, false)).toBe(16);
    expect(weaponHitPoints(8, true)).toBe(8);
    expect(weaponHitPoints(1, false)).toBe(8);
  });

  it("tells sound from damaged, disabled and destroyed", () => {
    expect(weaponCondition(weaponState(0, 16))).toBe("sound");
    expect(weaponCondition(weaponState(12, 16))).toBe("damaged");
    expect(weaponCondition(weaponState(16, 16))).toBe("disabled");
    expect(weaponCondition(weaponState(40, 16))).toBe("disabled");
    expect(weaponCondition(weaponState(96, 16))).toBe("destroyed");
  });

  it("reads the Broken Weapons table by kind and die (p. 485)", () => {
    expect(brokenWeaponKindFor({ skill: "Broadsword", weightLbs: 3, ranged: false })).toBe("sword");
    expect(brokenWeaponKindFor({ skill: "Knife", weightLbs: 1, ranged: false })).toBe("light");
    expect(brokenWeaponKindFor({ skill: "Bow", weightLbs: 3, ranged: true })).toBe("missile");
    expect(brokenWeaponKindFor({ skill: "Polearm", weightLbs: 12, ranged: false })).toBe("polearm");

    expect(brokenWeaponResult("sword", 2)).toBe("swordHalved");
    expect(brokenWeaponResult("sword", 5)).toBe("useless");
    expect(brokenWeaponResult("polearm", 1)).toBe("polearmPole");
    expect(brokenWeaponResult("polearm", 4)).toBe("polearmStaffAndAxe");
    expect(brokenWeaponResult("polearm", 6)).toBe("polearmClubAndGreatAxe");
    expect(brokenWeaponResult("spear", 6)).toBe("spearBroken");
    expect(brokenWeaponResult("twoHandedAxeMace", 1)).toBe("twoHandedHeadOff");
    expect(brokenWeaponResult("light", 1)).toBe("useless");
    expect(brokenWeaponResult("other", 3)).toBe("gmDecides");
  });
});
