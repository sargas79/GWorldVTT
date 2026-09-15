import { describe, expect, it } from "vitest";

import {
  bareHandedParryModifier,
  canParryFlail,
  flailDefenseModifier,
  flailKind,
  parriedLimbStrikeModifier,
  thrownParryModifier,
} from "../defenses.js";
import { evaluateTurnsAfterTurn, takesEvaluateBonus } from "../maneuvers.js";

describe("flails (Characters p. 208, Campaigns pp. 405, 548)", () => {
  it("knows a flail by its skill, and a nunchaku by its name", () => {
    expect(flailKind("Flail", "Morningstar")).toBe("flail");
    expect(flailKind("Two-Handed Flail", "Flail")).toBe("flail");
    expect(flailKind("Flail", "Nunchaku")).toBe("nunchaku");
    expect(flailKind("Axe/Mace", "Mace")).toBeNull();
    expect(flailKind(undefined)).toBeNull();
  });

  it("is -4 to parry and -2 to block, halved against a nunchaku", () => {
    expect(flailDefenseModifier("flail", "parry")).toBe(-4);
    expect(flailDefenseModifier("flail", "block")).toBe(-2);
    expect(flailDefenseModifier("flail", "dodge")).toBe(0);
    expect(flailDefenseModifier("nunchaku", "parry")).toBe(-2);
    expect(flailDefenseModifier("nunchaku", "block")).toBe(-1);
    expect(flailDefenseModifier(null, "parry")).toBe(0);
  });

  it("can't be parried with a fencing weapon or a knife", () => {
    expect(canParryFlail({ skill: "Rapier", isFencing: true })).toBe(false);
    expect(canParryFlail({ skill: "Knife", isFencing: false })).toBe(false);
    expect(canParryFlail({ skill: "Broadsword", isFencing: false })).toBe(true);
    expect(canParryFlail({ skill: "Brawling", isFencing: false })).toBe(true);
  });
});

describe("parrying (Campaigns p. 376)", () => {
  it("is -1 against a thrown weapon, or -2 against one of 1 lb. or less", () => {
    expect(thrownParryModifier(0.5)).toBe(-2);
    expect(thrownParryModifier(1)).toBe(-2);
    expect(thrownParryModifier(4)).toBe(-1);
  });

  it("is -3 bare-handed against a weapon, unless it thrusts or the parry is Judo or Karate", () => {
    const against = (parrySkill: string, attackIsThrust = false) =>
      bareHandedParryModifier({ parrySkill, bareHanded: true, attackIsWeapon: true, attackIsThrust });
    expect(against("Brawling")).toBe(-3);
    expect(against("Karate")).toBe(0);
    expect(against("Judo")).toBe(0);
    expect(against("Brawling", true)).toBe(0);
    expect(bareHandedParryModifier({ parrySkill: "Brawling", bareHanded: true, attackIsWeapon: false, attackIsThrust: false })).toBe(0);
    expect(bareHandedParryModifier({ parrySkill: "Broadsword", bareHanded: false, attackIsWeapon: true, attackIsThrust: false })).toBe(0);
  });

  it("strikes an unarmed attacker's limb at -4 against Judo or Karate", () => {
    expect(parriedLimbStrikeModifier("Karate")).toBe(-4);
    expect(parriedLimbStrikeModifier("Judo")).toBe(-4);
    expect(parriedLimbStrikeModifier("Brawling")).toBe(0);
  });
});

describe("Evaluate (Campaigns p. 364)", () => {
  it("adds one per turn spent evaluating, to three, and lapses after any other turn", () => {
    expect(evaluateTurnsAfterTurn(0, "evaluate")).toBe(1);
    expect(evaluateTurnsAfterTurn(2, "evaluate")).toBe(3);
    expect(evaluateTurnsAfterTurn(3, "evaluate")).toBe(3);
    expect(evaluateTurnsAfterTurn(2, "attack")).toBe(0);
  });

  it("goes to an Attack, Feint, All-Out Attack or Move and Attack", () => {
    expect(takesEvaluateBonus("attack", true)).toBe(true);
    expect(takesEvaluateBonus("feint", false)).toBe(true);
    expect(takesEvaluateBonus("allOutAttack", true)).toBe(true);
    expect(takesEvaluateBonus("evaluate", false)).toBe(false);
    expect(takesEvaluateBonus("allOutDefense", false)).toBe(false);
  });
});

describe("how often a defense may be used (Campaigns pp. 375-376)", () => {
  it("puts -4 on each parry after the first with the same weapon, -2 for fencing or master training, -1 for both", async () => {
    const { multipleParryPenalty } = await import("../defenses.js");
    expect(multipleParryPenalty(0, { fencing: false, trained: false })).toBe(0);
    expect(multipleParryPenalty(1, { fencing: false, trained: false })).toBe(-4);
    expect(multipleParryPenalty(2, { fencing: false, trained: false })).toBe(-8);
    expect(multipleParryPenalty(1, { fencing: true, trained: false })).toBe(-2);
    expect(multipleParryPenalty(2, { fencing: true, trained: true })).toBe(-2);
  });

  it("gives an Acrobatic Dodge +2 or -2, once a turn for a defender with a point in Acrobatics", async () => {
    const { acrobaticDefenseModifier, mayTryAcrobatic, ACROBATIC_DEFENSES_PER_TURN } = await import("../defenses.js");
    expect([acrobaticDefenseModifier(true), acrobaticDefenseModifier(false)]).toEqual([2, -2]);
    expect(mayTryAcrobatic({ points: 1, used: 0, perTurn: ACROBATIC_DEFENSES_PER_TURN })).toBe(true);
    expect(mayTryAcrobatic({ points: 1, used: 1, perTurn: ACROBATIC_DEFENSES_PER_TURN })).toBe(false);
    expect(mayTryAcrobatic({ points: 0, used: 0, perTurn: ACROBATIC_DEFENSES_PER_TURN })).toBe(false);
    expect(mayTryAcrobatic({ points: 2, used: 5, perTurn: null })).toBe(true);
  });

  it("can't block bullets or beams", async () => {
    const { blockableAttack } = await import("../defenses.js");
    expect(blockableAttack("Guns (Pistol)")).toBe(false);
    expect(blockableAttack("Beam Weapons (Rifle)")).toBe(false);
    expect(blockableAttack("Bow")).toBe(true);
    expect(blockableAttack(undefined)).toBe(true);
  });
});
