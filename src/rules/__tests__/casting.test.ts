import { describe, expect, it } from "vitest";

import {
  CRITICAL_SPELL_FAILURE,
  NO_RITUAL,
  activeSpellCounts,
  areaEnergy,
  cancelCost,
  castingTimeAfterSkill,
  criticalFailuresAreMild,
  criticalSpellFailure,
  distancePenalty,
  effectiveMana,
  energyAfterSkill,
  energyBounds,
  energyOnOutcome,
  failuresAreCritical,
  fatigueReturnsNextTurn,
  hpBurnPenalty,
  isExpired,
  maintainedExpiry,
  maintenancePenalty,
  manaSkillModifier,
  mayCast,
  outcomeUnderMana,
  ritualForSkill,
  spellExpiry,
  subjectSizeEnergy,
} from "../casting.js";

describe("mana (Characters p. 235)", () => {
  it("is -5 in low mana and nothing elsewhere", () => {
    expect(manaSkillModifier("low")).toBe(-5);
    expect(manaSkillModifier("normal")).toBe(0);
    expect(manaSkillModifier("veryHigh")).toBe(0);
  });

  /** "No one can use magic at all" / "Only mages" / "Anyone who knows spells" */
  it("says who may cast", () => {
    expect(mayCast("none", true)).toBe(false);
    expect(mayCast("low", false)).toBe(false);
    expect(mayCast("normal", true)).toBe(true);
    expect(mayCast("normal", false)).toBe(false);
    expect(mayCast("high", false)).toBe(true);
    expect(mayCast("veryHigh", false)).toBe(true);
  });

  it("makes every failure critical only in very high mana, and mild only in low", () => {
    expect(failuresAreCritical("veryHigh")).toBe(true);
    expect(failuresAreCritical("high")).toBe(false);
    expect(criticalFailuresAreMild("low")).toBe(true);
    expect(criticalFailuresAreMild("normal")).toBe(false);
    expect(fatigueReturnsNextTurn("veryHigh")).toBe(true);
    expect(fatigueReturnsNextTurn("normal")).toBe(false);
  });

  it("lets a scene override the world, and falls back to normal", () => {
    expect(effectiveMana("low", "")).toBe("low");
    expect(effectiveMana("low", "high")).toBe("high");
    expect(effectiveMana("garbage", undefined)).toBe("normal");
    expect(effectiveMana("normal", "nonsense")).toBe("normal");
  });

  it("turns a failure into a critical failure in very high mana", () => {
    const failed = { success: false, criticalSuccess: false, criticalFailure: false };
    expect(outcomeUnderMana(failed, "veryHigh").criticalFailure).toBe(true);
    expect(outcomeUnderMana(failed, "normal").criticalFailure).toBe(false);
    const made = { success: true, criticalSuccess: false, criticalFailure: false };
    expect(outcomeUnderMana(made, "veryHigh").criticalFailure).toBe(false);
  });
});

describe("magic rituals (Characters p. 237)", () => {
  it("doubles the time at skill 9 or less", () => {
    expect(ritualForSkill(9)).toEqual({ costReduction: 0, timeMultiplier: 2, ritual: "elaborate" });
    expect(castingTimeAfterSkill(1, ritualForSkill(8))).toBe(2);
  });

  it("is as listed from 10 to 14", () => {
    expect(ritualForSkill(12)).toEqual({ costReduction: 0, timeMultiplier: 1, ritual: "spoken" });
  });

  it("takes one off the cost from 15 to 19", () => {
    expect(ritualForSkill(15).costReduction).toBe(1);
    expect(ritualForSkill(19).timeMultiplier).toBe(1);
  });

  /** "Time: Halved (round fractions up to the next second). Minimum casting time is still one second. Cost: Reduced by 2." */
  it("halves the time and takes two off at 20", () => {
    const ritual = ritualForSkill(22);
    expect(ritual).toEqual({ costReduction: 2, timeMultiplier: 0.5, ritual: "none" });
    expect(castingTimeAfterSkill(3, ritual)).toBe(2);
    expect(castingTimeAfterSkill(1, ritual)).toBe(1);
  });

  it("quarters the time and takes three off at 25, and keeps going by fives", () => {
    expect(ritualForSkill(25)).toMatchObject({ costReduction: 3, timeMultiplier: 0.25 });
    expect(ritualForSkill(30)).toMatchObject({ costReduction: 4, timeMultiplier: 0.125 });
    expect(ritualForSkill(35)).toMatchObject({ costReduction: 5, timeMultiplier: 0.0625 });
    expect(castingTimeAfterSkill(60, ritualForSkill(25))).toBe(15);
  });

  /** "you can cast it at no cost" */
  it("can reduce a cost to nothing, but never below", () => {
    expect(energyAfterSkill(1, ritualForSkill(16))).toBe(0);
    expect(energyAfterSkill(1, ritualForSkill(21))).toBe(0);
    expect(energyAfterSkill(5, ritualForSkill(21))).toBe(3);
  });

  /** "Never reduce the cost of a Blocking spell" */
  it("never reduces a Blocking spell", () => {
    expect(energyAfterSkill(1, ritualForSkill(25), { blocking: true })).toBe(1);
  });

  /** "high skill has no effect on ... the time to cast Missile spells" */
  it("leaves a Missile spell's time alone at high skill, but not at low", () => {
    expect(castingTimeAfterSkill(1, ritualForSkill(25), { missile: true })).toBe(1);
    expect(castingTimeAfterSkill(2, ritualForSkill(25), { missile: true })).toBe(2);
    expect(castingTimeAfterSkill(1, ritualForSkill(8), { missile: true })).toBe(2);
  });

  it("has a no-ritual stand-in for when the rule is off", () => {
    expect(energyAfterSkill(3, NO_RITUAL)).toBe(3);
    expect(castingTimeAfterSkill(4, NO_RITUAL)).toBe(4);
  });
});

describe("what a casting costs (Characters p. 239)", () => {
  it("multiplies an Area spell's base cost by its radius, at least one yard and one point", () => {
    expect(areaEnergy(2, 3)).toBe(6);
    expect(areaEnergy(2, 0)).toBe(2);
    expect(areaEnergy(0.5, 1)).toBe(1);
    expect(areaEnergy(0.5, 4)).toBe(2);
  });

  it("scales a Regular spell for a big subject and never for a small one", () => {
    expect(subjectSizeEnergy(3, 2)).toBe(9);
    expect(subjectSizeEnergy(3, 0)).toBe(3);
    expect(subjectSizeEnergy(3, -2)).toBe(3);
  });

  /** "The upper limit is the higher of the standard number of levels or the caster's Magery level" */
  it("bounds a variable cost, with Magery raising the ceiling", () => {
    expect(energyBounds({ cast: 1, castMax: 4, text: "1 to 4" }, 1)).toEqual({ min: 1, max: 4 });
    expect(energyBounds({ cast: 1, castMax: 4, text: "1 to 4" }, 10)).toEqual({ min: 1, max: 10 });
    expect(energyBounds({ cast: 2, castMax: 2, text: "2" }, 5)).toEqual({ min: 2, max: 2 });
    expect(energyBounds({ cast: 1, castMax: null, text: "1 to Magery" }, 3)).toEqual({ min: 1, max: 3 });
    expect(energyBounds({ cast: 2, castMax: null, text: "2 to 2xMagery" }, 3)).toEqual({ min: 2, max: 6 });
    expect(energyBounds({ cast: null, castMax: null, text: "Varies" }, 3)).toEqual({ min: 0, max: null });
    expect(energyBounds({ cast: 1, castMax: null, text: "1 to Magery" }, null)).toEqual({ min: 1, max: 1 });
  });
});

describe("modifiers to the casting roll", () => {
  it("charges a yard a point, and five more for a subject out of sight", () => {
    expect(distancePenalty({ yards: 0 })).toBe(0);
    expect(distancePenalty({ yards: 5 })).toBe(-5);
    expect(distancePenalty({ yards: 3, cannotSeeOrTouch: true })).toBe(-8);
  });

  /** "-3 per spell you are concentrating on ... -1 per other spell you have 'on'" */
  it("charges for spells still running", () => {
    expect(maintenancePenalty({ spellsOn: 2, concentratingOn: 1 })).toBe(-5);
    expect(maintenancePenalty({ spellsOn: 0, concentratingOn: 0 })).toBe(0);
  });

  it("leaves a permanent spell out of the count", () => {
    expect(
      activeSpellCounts([
        { permanent: true },
        { concentrating: true },
        { concentrating: false },
        {},
      ]),
    ).toEqual({ spellsOn: 2, concentratingOn: 1 });
  });

  it("charges a point of skill per HP burned", () => {
    expect(hpBurnPenalty(2)).toBe(-2);
    expect(hpBurnPenalty(0)).toBe(0);
  });
});

describe("energy on each outcome (Characters pp. 235, 241)", () => {
  const made = { success: true, criticalSuccess: false, criticalFailure: false };
  const crit = { success: true, criticalSuccess: true, criticalFailure: false };
  const failed = { success: false, criticalSuccess: false, criticalFailure: false };
  const fumbled = { success: false, criticalSuccess: false, criticalFailure: true };

  it("costs the full amount on a success and nothing on a critical success", () => {
    expect(energyOnOutcome({ cost: 4, outcome: made })).toBe(4);
    expect(energyOnOutcome({ cost: 4, outcome: crit })).toBe(0);
  });

  /** "If success would have cost energy, you lose one energy point; otherwise, you lose nothing." */
  it("costs one on a failure, and nothing if the spell was free", () => {
    expect(energyOnOutcome({ cost: 4, outcome: failed })).toBe(1);
    expect(energyOnOutcome({ cost: 0, outcome: failed })).toBe(0);
  });

  it("costs the full amount on a critical failure, and always for an Information spell", () => {
    expect(energyOnOutcome({ cost: 4, outcome: fumbled })).toBe(4);
    expect(energyOnOutcome({ cost: 4, outcome: failed, information: true })).toBe(4);
    expect(energyOnOutcome({ cost: 4, outcome: crit, information: true })).toBe(0);
  });
});

describe("the Critical Spell Failure Table (Characters p. 236)", () => {
  it("covers every roll from 3 to 18 exactly once", () => {
    const covered = CRITICAL_SPELL_FAILURE.flatMap((e) => e.rolls).sort((a, b) => a - b);
    expect(covered).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]);
  });

  it("reads the rows that hurt the caster", () => {
    expect(criticalSpellFailure(3)).toMatchObject({ effect: "failsInjuryDice", injuryDice: 1 });
    expect(criticalSpellFailure(8)).toMatchObject({ effect: "failsInjuryOne", injury: 1 });
    expect(criticalSpellFailure(9)).toMatchObject({ effect: "failsStunned", stunned: true });
    expect(criticalSpellFailure(18)).toMatchObject({ effect: "demon", gmDecides: true });
  });

  it("clamps a roll outside 3-18", () => {
    expect(criticalSpellFailure(1).effect).toBe("failsInjuryDice");
    expect(criticalSpellFailure(30).effect).toBe("demon");
  });
});

describe("duration and maintenance (Characters pp. 237-238)", () => {
  it("counts an expiry from now, or none for a duration it cannot count", () => {
    expect(spellExpiry(100, 60)).toBe(160);
    expect(spellExpiry(100, null)).toBeNull();
    expect(spellExpiry(100, 0)).toBeNull();
  });

  it("knows when a spell has run out", () => {
    expect(isExpired(160, 159)).toBe(false);
    expect(isExpired(160, 160)).toBe(true);
    expect(isExpired(null, 1e9)).toBe(false);
  });

  /** "the spell continues for another interval equal to its duration" */
  it("extends a maintained spell from where it stood, or from now if it lapsed", () => {
    expect(maintainedExpiry(160, 60, 150)).toBe(220);
    expect(maintainedExpiry(160, 60, 300)).toBe(360);
    expect(maintainedExpiry(null, 60, 300)).toBeNull();
  });

  /** "you must pay one energy point" to cancel early; a spell that ran out is free */
  it("charges a point to cancel early and nothing once it has run out", () => {
    expect(cancelCost(160, 100)).toBe(1);
    expect(cancelCost(160, 160)).toBe(0);
    expect(cancelCost(null, 100)).toBe(1);
  });
});
