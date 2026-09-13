import { describe, expect, it } from "vitest";

import {
  ARM_LOCK_HOLD_BONUS,
  CHOKE_DAMAGE_ST_BONUS,
  CHOKE_FP_PER_TURN,
  CHOKE_HOLD_BONUS,
  FEET_PER_EXTRA_YARD,
  LOCKED_DEFENSE_PENALTY,
  NECK_SNAP_PENALTY,
  NECK_WOUNDING,
  armLockDamage,
  chokedCanStillFight,
  effectiveLevelDifference,
  improvisedPenalty,
  lockAttack,
  lockDr,
  lockResistance,
  piercingStrike,
  reachAdvantageFeet,
  techniqueModifier,
  techniqueSkills,
  wrenchWounding,
} from "../unarmed-techniques.js";
import { longestReach } from "../../system/roll.js";

describe("what each technique is rolled against (Campaigns pp. 403-404)", () => {
  it("takes a choke at two off Judo and three off Wrestling", () => {
    expect(techniqueModifier("chokeHold", "Judo")).toBe(-2);
    expect(techniqueModifier("chokeHold", "Wrestling")).toBe(-3);
  });

  it("takes an elbow at two off either skill it uses", () => {
    expect(techniqueModifier("elbowStrike", "Brawling")).toBe(-2);
    expect(techniqueModifier("elbowStrike", "karate")).toBe(-2);
    expect(techniqueSkills("elbowStrike")).toEqual(["Brawling", "Karate"]);
  });

  it("says nothing about a skill the technique does not use", () => {
    expect(techniqueModifier("chokeHold", "Brawling")).toBe(null);
    expect(techniqueModifier("piercingStrike", "Brawling")).toBe(null);
  });
});

describe("the armour a lock gets through (pp. 403-404)", () => {
  it("is stopped by a plate and by a hide, and not at all by mail", () => {
    // "The target's natural DR and the DR of his rigid armor protect normally.
    // Flexible armor has no effect!"
    expect(lockDr({ naturalDr: 2, rigidDr: 4, flexibleDr: 6 })).toBe(6);
    expect(lockDr({ naturalDr: 0, rigidDr: 0, flexibleDr: 8 })).toBe(0);
  });

  it("is not stopped by Tough Skin, which the book excepts", () => {
    expect(lockDr({ naturalDr: 3, toughSkin: true, rigidDr: 1, flexibleDr: 0 })).toBe(1);
  });
});

describe("arm lock (p. 403)", () => {
  it("holds at four and hurts by the margin", () => {
    expect(ARM_LOCK_HOLD_BONUS).toBe(4);
    expect(armLockDamage({ margin: 5, dr: 0 })).toEqual({ damage: 5, shockOnly: false });
    expect(armLockDamage({ margin: 5, dr: 2 })).toEqual({ damage: 3, shockOnly: false });
    expect(armLockDamage({ margin: 0, dr: 0 })).toEqual({ damage: 0, shockOnly: false });
  });

  it("goes on hurting a crippled arm without damaging it further", () => {
    // "You can inflict no further damage on a crippled limb, but you can
    // continue to roll the Contest each turn."
    expect(armLockDamage({ margin: 6, dr: 0, crippled: true }))
      .toEqual({ damage: 0, shockOnly: true });
  });

  it("is applied with the best of three and resisted with the better of two", () => {
    expect(lockAttack({ judo: 14, wrestling: 12, strength: 11 })).toBe(14);
    expect(lockAttack({ strength: 16 })).toBe(16);
    expect(lockResistance({ strength: 11, health: 13 })).toBe(13);
  });

  it("leaves the victim four worse against anything else in close combat", () => {
    expect(LOCKED_DEFENSE_PENALTY).toBe(-4);
  });
});

describe("choke hold (p. 404)", () => {
  it("holds at five and costs a point of fatigue a turn", () => {
    expect(CHOKE_HOLD_BONUS).toBe(5);
    expect(CHOKE_FP_PER_TURN).toBe(1);
    expect(CHOKE_DAMAGE_ST_BONUS).toBe(3);
  });

  it("leaves the arms and legs free, which is the point of the warning", () => {
    // "you control your victim's neck and head - not his arms and legs."
    expect(chokedCanStillFight()).toEqual({ canAttack: true, penalty: -4 });
  });
});

describe("neck snap and wrench limb (p. 404)", () => {
  it("contests at ST-4", () => {
    expect(NECK_SNAP_PENALTY).toBe(-4);
  });

  it("wounds a neck half again and a limb not at all", () => {
    expect(NECK_WOUNDING).toBe(1.5);
    expect(wrenchWounding("neck")).toBe(1.5);
    expect(wrenchWounding("arm")).toBe(1);
  });
});

describe("piercing strike (p. 403)", () => {
  it("costs two to hit and a point of damage, and buys a piercing blow", () => {
    expect(piercingStrike()).toEqual({
      toHit: -2, damage: -1, damageType: "pi", hurtsYourselfAtDr: 1,
    });
  });
});

describe("the effects of reach (p. 402)", () => {
  it("brings the foe three feet closer per yard past the first", () => {
    expect(FEET_PER_EXTRA_YARD).toBe(3);
    expect(reachAdvantageFeet(1)).toBe(0);
    // "a greatsword (two-yard reach) would let you fight as if your foe were
    // three feet closer."
    expect(reachAdvantageFeet(2)).toBe(3);
    expect(reachAdvantageFeet(3)).toBe(6);
  });

  it("works the book's own example, and only for the one with the reach", () => {
    // "If you were standing six feet below him, you would fight as though he
    // were only three feet higher."
    expect(effectiveLevelDifference({ feet: 6, reachYards: 2 })).toBe(3);
    // "He would not enjoy a similar benefit unless he, too, had long reach."
    expect(effectiveLevelDifference({ feet: 6, reachYards: 1 })).toBe(6);
  });

  it("never makes the gap negative", () => {
    expect(effectiveLevelDifference({ feet: 2, reachYards: 3 })).toBe(0);
  });
});

describe("improvised weapons (p. 404)", () => {
  it("is a penalty of one to three, and never a bonus", () => {
    expect(improvisedPenalty(1)).toBe(-1);
    expect(improvisedPenalty(-3)).toBe(-3);
    expect(improvisedPenalty(0)).toBe(0);
    // The book's range stops at three, whatever the GM was reaching for.
    expect(improvisedPenalty(9)).toBe(-3);
  });
});

/**
 * The reach column is a list, and what closes a vertical gap is the longest
 * entry in it: "C" is close combat and no reach at all, "1, 2" is a spear.
 */
describe("reading a reach column", () => {
  it("takes the longest reach the column offers", () => {
    expect(longestReach("1")).toBe(1);
    expect(longestReach("1, 2")).toBe(2);
    expect(longestReach("2, 3*")).toBe(3);
  });

  it("treats close combat, and anything unreadable, as a single yard", () => {
    expect(longestReach("C")).toBe(1);
    expect(longestReach("C, 1")).toBe(1);
    expect(longestReach("")).toBe(1);
  });
});
