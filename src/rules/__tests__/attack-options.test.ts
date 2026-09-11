import { describe, expect, it } from "vitest";

import {
  DECEPTIVE_SKILL_FLOOR,
  RAPID_STRIKE_PENALTY,
  bulkPenalty,
  deceptiveAttack,
  evadeModifier,
  maxDeception,
  slamDamage,
  slamOutcome,
} from "../attack-options.js";

describe("Deceptive Attack (p. 369)", () => {
  it("trades two points of skill for one of the foe's defense", () => {
    const attack = deceptiveAttack(16, 2);
    expect(attack.attackPenalty).toBe(-4);
    expect(attack.defensePenalty).toBe(-2);
    expect(attack.effectiveSkill).toBe(12);
  });

  /**
   * "You may not reduce your final effective skill below 10." That floor is
   * what makes this a skilled fighter's option rather than everyone's.
   */
  it("will not take the attacker below skill 10", () => {
    expect(maxDeception(16)).toBe(3);
    expect(maxDeception(11)).toBe(0);
    expect(maxDeception(10)).toBe(0);
    expect(maxDeception(9)).toBe(0);
    expect(DECEPTIVE_SKILL_FLOOR).toBe(10);
  });

  it("clamps a request for more deception than the skill can buy", () => {
    const greedy = deceptiveAttack(14, 9);
    expect(greedy.effectiveSkill).toBe(10);
    expect(greedy.defensePenalty).toBe(-2);
  });

  it("costs nothing when none is asked for", () => {
    expect(deceptiveAttack(16, 0)).toEqual({
      attackPenalty: 0,
      defensePenalty: 0,
      effectiveSkill: 16,
    });
  });

  it("gives an unskilled fighter no option at all", () => {
    expect(deceptiveAttack(10, 3).effectiveSkill).toBe(10);
    expect(deceptiveAttack(10, 3).defensePenalty).toBe(0);
  });
});

describe("Rapid Strike (p. 370)", () => {
  it("costs six from both attacks", () => {
    expect(RAPID_STRIKE_PENALTY).toBe(-6);
  });
});

describe("slam damage (p. 371)", () => {
  it("is HP times velocity over a hundred, in dice", () => {
    // 10 HP moving 20 yards: 2 dice.
    expect(slamDamage(10, 20)).toEqual({ dice: 2, modifier: 0 });
  });

  it("rounds a half die or more up to a full one", () => {
    expect(slamDamage(10, 25)).toEqual({ dice: 3, modifier: 0 });
    expect(slamDamage(10, 24)).toEqual({ dice: 2, modifier: 0 });
  });

  /** Below a die the book gives three steps rather than rounding to nothing. */
  it("gives the three fractional steps below a full die", () => {
    // 10 HP at 2 yards is 0.2 of a die.
    expect(slamDamage(10, 2)).toEqual({ dice: 1, modifier: -3 });
    // 10 HP at 5 yards is exactly 0.5.
    expect(slamDamage(10, 5)).toEqual({ dice: 1, modifier: -2 });
    // 10 HP at 7 yards is 0.7.
    expect(slamDamage(10, 7)).toEqual({ dice: 1, modifier: -1 });
  });

  it("treats the boundaries as the book writes them, at most rather than under", () => {
    // Exactly 0.25 is still the lowest step.
    expect(slamDamage(25, 1)).toEqual({ dice: 1, modifier: -3 });
  });
});

describe("slam outcome (p. 371)", () => {
  it("makes the foe roll DX when the attacker matches or beats them", () => {
    expect(slamOutcome(8, 8)).toBe("defenderRollsToStay");
    expect(slamOutcome(9, 8)).toBe("defenderRollsToStay");
  });

  it("knocks the foe down outright at twice their damage", () => {
    expect(slamOutcome(16, 8)).toBe("attackerKnocksDown");
  });

  it("puts the attacker down when the foe rolls twice as much", () => {
    expect(slamOutcome(4, 8)).toBe("attackerFellInstead");
  });

  it("does nothing when the attacker rolled less but not half", () => {
    expect(slamOutcome(6, 8)).toBe("nothing");
  });

  it("knocks nobody over when neither did any damage", () => {
    expect(slamOutcome(0, 0)).toBe("nothing");
  });
});

describe("evading (p. 368)", () => {
  it("is hard past someone standing and easy past someone down", () => {
    expect(evadeModifier({ foePosture: "standing" })).toBe(-5);
    expect(evadeModifier({ foePosture: "kneeling" })).toBe(-2);
    expect(evadeModifier({ foePosture: "lying" })).toBe(5);
  });

  it("is easier from a side and easier still from behind", () => {
    expect(evadeModifier({ approach: "side" })).toBe(2);
    expect(evadeModifier({ approach: "back" })).toBe(5);
    expect(evadeModifier({ approach: "front" })).toBe(0);
  });

  it("adds the two together", () => {
    expect(evadeModifier({ foePosture: "standing", approach: "back" })).toBe(0);
  });

  /**
   * The book lists standing, kneeling and lying. A crouching or sitting foe is
   * not among them, and picking a number for those would be inventing a rule.
   */
  it("modifies nothing for a posture the book does not list", () => {
    expect(evadeModifier({ foePosture: "crouching" })).toBe(0);
    expect(evadeModifier({ foePosture: "sitting" })).toBe(0);
    expect(evadeModifier({})).toBe(0);
  });
});

describe("Bulk", () => {
  /** Move and Attack: "-2 or -Bulk of weapon, whichever is worse" (p. 365). */
  it("takes the worse of -2 and the weapon's Bulk on a Move and Attack", () => {
    expect(bulkPenalty(-1, "moveAndAttack")).toBe(-2);
    expect(bulkPenalty(-2, "moveAndAttack")).toBe(-2);
    expect(bulkPenalty(-6, "moveAndAttack")).toBe(-6);
  });

  /** In close combat it is the Bulk itself, however small (p. 391). */
  it("is the Bulk itself in close combat", () => {
    expect(bulkPenalty(-1, "closeCombat")).toBe(-1);
    expect(bulkPenalty(-6, "closeCombat")).toBe(-6);
  });

  it("never turns into a bonus, whatever it was given", () => {
    expect(bulkPenalty(3, "closeCombat")).toBe(0);
    expect(bulkPenalty(3, "moveAndAttack")).toBe(-2);
  });
});
