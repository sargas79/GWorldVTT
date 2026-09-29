import { describe, expect, it } from "vitest";

import {
  acrobaticStand,
  acrobaticStandModifier,
  armedGrapple,
  closeCombatBulk,
  closeCombatDamageModifier,
  closeCombatPenalty,
  evadeBase,
  headButtDamage,
  headButtSelfInjury,
  longestReach,
  stampKickDamage,
  stampKickMiss,
  stampKickTarget,
  wrenchLevel,
} from "../addendum-techniques.js";
import { naturalAttacks } from "../natural-attacks.js";
import { strikingPart } from "../hurting-yourself.js";

describe("Acrobatic Stand (Revised p. 333)", () => {
  it("stands from lying as a maneuver, and as a step on a critical", () => {
    expect(acrobaticStand({ from: "lying", success: true, critical: false })).toBe("standsAsManeuver");
    expect(acrobaticStand({ from: "lying", success: true, critical: true })).toBe("standsAsStep");
  });
  it("sits on a failure and stays down on a critical failure", () => {
    expect(acrobaticStand({ from: "lying", success: false, critical: false })).toBe("sits");
    expect(acrobaticStand({ from: "lying", success: false, critical: true })).toBe("staysDown");
  });
  it("stands from sitting as a step, and falls on a critical failure", () => {
    expect(acrobaticStand({ from: "sitting", success: true, critical: false })).toBe("standsAsStep");
    expect(acrobaticStand({ from: "crawling", success: false, critical: false })).toBe("standsAsManeuver");
    expect(acrobaticStand({ from: "sitting", success: false, critical: true })).toBe("falls");
  });
  it("takes the encumbrance level as a penalty", () => {
    expect(acrobaticStandModifier(2)).toBe(-2);
    expect(acrobaticStandModifier(0)).toBe(0);
  });
});

describe("Armed Grapple (Revised p. 334)", () => {
  it("uses Cloak unpenalized and a weapon at -2", () => {
    expect(armedGrapple({ cloak: true, oneHanded: true, bothHandsOnIt: false }).penalty).toBe(0);
    expect(armedGrapple({ cloak: false, oneHanded: true, bothHandsOnIt: true }).penalty).toBe(-2);
  });
  it("asks a Ready for a one-handed weapon that is not a cloak", () => {
    expect(armedGrapple({ cloak: false, oneHanded: true, bothHandsOnIt: false }).needsReady).toBe(true);
    expect(armedGrapple({ cloak: true, oneHanded: true, bothHandsOnIt: false }).needsReady).toBe(false);
  });
});

describe("Close Combat (Revised p. 334)", () => {
  it("reads the longest reach", () => {
    expect(longestReach("1, 2")).toBe(2);
    expect(longestReach("C, 1")).toBe(1);
    expect(longestReach("C")).toBe(0);
  });
  it("costs 4, 8 or 12 by reach, half of it bought back at most", () => {
    expect(closeCombatPenalty("1")).toBe(-4);
    expect(closeCombatPenalty("2")).toBe(-8);
    expect(closeCombatPenalty("3")).toBe(-12);
    expect(closeCombatPenalty("2", 2)).toBe(-6);
    expect(closeCombatPenalty("2", 20)).toBe(-4);
    expect(closeCombatPenalty("3", 6)).toBe(-6);
  });
  it("takes a point off swing damage per yard and none off thrust", () => {
    expect(closeCombatDamageModifier("3", true)).toBe(-3);
    expect(closeCombatDamageModifier("3", false)).toBe(0);
  });
  it("buys off Bulk in close combat for a ranged weapon", () => {
    expect(closeCombatBulk(-4, 0)).toBe(-4);
    expect(closeCombatBulk(-4, 3)).toBe(-1);
    expect(closeCombatBulk(-2, 5)).toBe(0);
  });
});

describe("Evade (Revised p. 334)", () => {
  it("replaces DX with the technique, unless DX is better", () => {
    expect(evadeBase(11, null)).toBe(11);
    expect(evadeBase(11, 14)).toBe(14);
    expect(evadeBase(11, 9)).toBe(11);
  });
});

describe("Head Butt and Stamp Kick (Revised p. 334)", () => {
  const thrust = { dice: 1, adds: 0 };
  it("does thrust-1, thrust-2 untrained, and +1 in a rigid helm", () => {
    expect(headButtDamage(thrust, { trained: true, helm: false })).toEqual({ dice: 1, adds: -1 });
    expect(headButtDamage(thrust, { trained: false, helm: false })).toEqual({ dice: 1, adds: -2 });
    expect(headButtDamage(thrust, { trained: true, helm: true })).toEqual({ dice: 1, adds: 0 });
  });
  it("hurts the face when parried and the skull against DR 3+", () => {
    expect(headButtSelfInjury({ parried: true, targetDr: 0, damage: 4, skullDr: 2, faceDr: 0 })).toEqual({ location: "face", injury: 4 });
    expect(headButtSelfInjury({ parried: false, targetDr: 3, damage: 4, skullDr: 2, faceDr: 0, rigidHelmDr: 1 })).toEqual({ location: "skull", injury: 1 });
    expect(headButtSelfInjury({ parried: false, targetDr: 2, damage: 4, skullDr: 2, faceDr: 0 })).toEqual({ location: null, injury: 0 });
  });
  it("does thrust+1 plus the skill bonus in a stamp kick", () => {
    expect(stampKickDamage({ dice: 2, adds: 0 }, 2)).toEqual({ dice: 2, adds: 3 });
  });
  it("aims a stamp kick at a lying foe or a foot or leg", () => {
    expect(stampKickTarget({ foePosture: "lying" })).toBe(true);
    expect(stampKickTarget({ foePosture: "standing", location: "leg" })).toBe(true);
    expect(stampKickTarget({ foePosture: "standing", location: "torso" })).toBe(false);
  });
  it("leaves a stomper unable to retreat when the DX roll fails", () => {
    expect(stampKickMiss(false).cannotRetreat).toBe(true);
    expect(stampKickMiss(true).cannotRetreat).toBe(false);
  });
  it("lists both as natural attacks", () => {
    const attacks = naturalAttacks({ st: 10, dx: 12, skills: { Brawling: 14 } });
    const butt = attacks.find((a) => a.key === "headButt");
    const stamp = attacks.find((a) => a.key === "stampKick");
    expect(butt).toMatchObject({ skillName: "Brawling", skillLevel: 13, damage: { dice: 1, adds: -2 } });
    expect(stamp).toMatchObject({ skillName: "Brawling", skillLevel: 11, damage: { dice: 1, adds: 0 } });
    expect(naturalAttacks({ st: 10, dx: 12, skills: {} }).find((a) => a.key === "headButt")).toMatchObject({ skillName: "DX", skillLevel: 10 });
    expect(naturalAttacks({ st: 10, dx: 12, skills: {} }).some((a) => a.key === "stampKick")).toBe(false);
  });
  it("hurts the skull or the foot when striking DR 3+", () => {
    expect(strikingPart("headButt")).toBe("skull");
    expect(strikingPart("stampKick")).toBe("foot");
  });
});

describe("Wrench Arm and Leg (Revised p. 334)", () => {
  it("is ST-4, bought up to ST+3", () => {
    expect(wrenchLevel(12, 0)).toBe(8);
    expect(wrenchLevel(12, 4)).toBe(12);
    expect(wrenchLevel(12, 20)).toBe(15);
  });
});
