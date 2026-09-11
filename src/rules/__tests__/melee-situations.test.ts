import { describe, expect, it } from "vitest";

import {
  canTargetChinks,
  chinkDr,
  chinkPenalty,
  disarmContestModifier,
  disarmPenalty,
  disarmResult,
  levelDifference,
} from "../melee-situations.js";

describe("chinks in armour (Campaigns p. 400)", () => {
  /** "a piercing, impaling, or tight-beam burning attack" */
  it("is only worth trying with something that can slip into a gap", () => {
    for (const type of ["imp", "pi-", "pi", "pi+", "pi++"] as const) {
      expect(canTargetChinks(type), type).toBe(true);
    }
    expect(canTargetChinks("cut")).toBe(false);
    expect(canTargetChinks("cr")).toBe(false);
  });

  it("allows a burning attack only when it is tight-beam", () => {
    expect(canTargetChinks("burn")).toBe(false);
    expect(canTargetChinks("burn", true)).toBe(true);
  });

  /** "-8 to hit a chink in the foe's torso armor, or at -10 for any other" */
  it("costs eight at the torso and ten anywhere else", () => {
    expect(chinkPenalty("torso")).toBe(-8);
    expect(chinkPenalty("skull")).toBe(-10);
    expect(chinkPenalty("arm")).toBe(-10);
  });

  /** "If you hit, halve DR." */
  it("halves the DR it finds", () => {
    expect(chinkDr(8)).toBe(4);
    expect(chinkDr(7)).toBe(3);
    expect(chinkDr(0)).toBe(0);
  });
});

describe("striking at a weapon (Campaigns p. 401)", () => {
  /** "an extra -2 to hit unless you use a fencing weapon" */
  it("costs two unless you are fencing", () => {
    expect(disarmPenalty(false)).toBe(-2);
    expect(disarmPenalty(true)).toBe(0);
  });

  /** "+2 if you use Jitte/Sai or Whip skill... foe gets +2 if two-handed" */
  it("favours the right tools on both sides", () => {
    expect(disarmContestModifier({ jitteOrWhip: true })).toEqual({ attacker: 2, defender: 0 });
    expect(disarmContestModifier({ foeTwoHanded: true })).toEqual({ attacker: 0, defender: 2 });
    expect(disarmContestModifier({})).toEqual({ attacker: 0, defender: 0 });
  });

  it("takes the weapon on a win", () => {
    expect(disarmResult({ outcome: "first", marginOfVictory: 1 })).toEqual({
      disarmed: true,
      unready: false,
      attackerDisarmed: false,
    });
  });

  /** "he keeps his weapon, but it will be unready unless he won by 3 or more" */
  it("leaves a narrowly held weapon unready", () => {
    expect(disarmResult({ outcome: "second", marginOfVictory: 2 }).unready).toBe(true);
    expect(disarmResult({ outcome: "second", marginOfVictory: 3 }).unready).toBe(false);
  });

  /** A tie is not a win, so the weapon is shaken loose but not lost. */
  it("leaves a tied weapon unready too", () => {
    expect(disarmResult({ outcome: "tie", marginOfVictory: 0 })).toMatchObject({
      disarmed: false,
      unready: true,
    });
  });

  /** "If you roll a critical failure, you are the one disarmed!" */
  it("costs the attacker their own weapon on a critical failure", () => {
    expect(disarmResult({ outcome: "first", marginOfVictory: 5, criticalFailure: true })).toEqual({
      disarmed: false,
      unready: false,
      attackerDisarmed: true,
    });
  });
});

describe("fighting at different levels (Campaigns p. 402)", () => {
  /** "One foot of vertical difference, or less: Ignore it." */
  it("ignores a step", () => {
    expect(levelDifference(1).negligible).toBe(true);
    expect(levelDifference(0).negligible).toBe(true);
  });

  /** "the higher fighter has -2 to hit the feet or legs, and +1 to hit the head" */
  it("changes what each can reach at two feet, but not their defenses", () => {
    const two = levelDifference(2);
    expect(two.higher).toMatchObject({ toHitLegs: -2, toHitHead: 1, defense: 0 });
    expect(two.lower).toMatchObject({ toHitLegs: 2, toHitHead: -2, defense: 0 });
  });

  /** "the lower fighter is at -1 to any active defense, while the upper is +1" */
  it("starts moving the defenses at three feet, a point per foot", () => {
    expect(levelDifference(3).lower.defense).toBe(-1);
    expect(levelDifference(4).lower.defense).toBe(-2);
    expect(levelDifference(5).lower.defense).toBe(-3);
    expect(levelDifference(3).higher.defense).toBe(1);
    expect(levelDifference(5).higher.defense).toBe(3);
  });

  /** "The upper fighter cannot strike at the lower fighter's feet or legs." */
  it("puts the legs out of the upper fighter's reach at four feet", () => {
    expect(levelDifference(4).higher.cannotReach).toContain("leg");
    expect(levelDifference(3).higher.cannotReach).toHaveLength(0);
  });

  /** "The lower fighter cannot strike at the upper fighter's head." */
  it("puts the head out of the lower fighter's reach at five feet", () => {
    expect(levelDifference(5).lower.cannotReach).toContain("skull");
  });

  /** "Neither gets any special bonus or penalty to attack" at six feet. */
  it("leaves each able to reach only one part of the other at six feet", () => {
    const six = levelDifference(6);
    expect(six.higher.toHitHead).toBe(0);
    expect(six.lower.toHitLegs).toBe(0);
    expect(six.higher.cannotReach).toContain("torso");
    expect(six.lower.cannotReach).toContain("torso");
    expect(six.impossible).toBe(false);
  });

  /** "Over six feet of vertical difference: Combat is impossible." */
  it("says so past six feet", () => {
    expect(levelDifference(7).impossible).toBe(true);
  });
});
