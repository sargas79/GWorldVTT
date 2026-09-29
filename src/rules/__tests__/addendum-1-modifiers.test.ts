import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  abilityRollModifiers, abilityRollTotal, activeDefenseRollTarget, affectsOthersPercent, costsHitPointsCost,
  costsHitPointsPercent, disadvantageLimitation, durationMargin, eitherOrPercent, gameTimeUses, maximumDurationPercent,
  mayAffectOthers, mayReduceDuration, minimumDurationPercent, minimumWithinMaximum, natureTechPenalty,
  powerModifierOrigin, reducedDurationDivisor, reducedDurationPercent, reducedSeconds, requiredRolls,
  requiresAttributePercent, requiresRollOf, requiresSkillPercent,
} from "../addendum-modifiers.js";
import { powersOf } from "../powers.js";
import { modifiedPoints } from "../traits.js";

interface Doc {
  name: string;
  system: { kind: string; value: number; costTable: number[]; levelNames: string[]; maxLevels: number; reference: string };
}
const records = JSON.parse(
  readFileSync(join(import.meta.dirname, "../../../packs-src/modifiers/basic-set-addendum-modifiers.json"), "utf8"),
) as Doc[];
const record = (name: string) => records.find((r) => r.name === name)!;

describe("the Revised modifiers' records", () => {
  it("carry every modifier of pp. 330-332", () => {
    for (const name of [
      "Affects Others", "Costs Hit Points", "Fixed Duration", "Game Time", "Hard to Use", "Reliable",
      "Maximum Duration", "Minimum Duration", "Reduced Duration", "Requires IQ Roll", "Requires Will Roll",
      "Requires Active Defense Roll", "Switchable", "Biological", "Chi", "Cosmic", "Divine", "Magical", "Moral",
      "Nature", "Psionic", "Spirit", "Super", "Superscience",
    ]) {
      expect(record(name)?.system.reference, name).toMatch(/p\. 33[0-2]$/);
    }
  });

  it("price Hard to Use at -5% a level to four and Reliable at +5% to +10", () => {
    expect(record("Hard to Use").system).toMatchObject({ kind: "limitation", value: -5, maxLevels: 4 });
    expect(record("Reliable").system).toMatchObject({ kind: "enhancement", value: 5, maxLevels: 10 });
  });

  it("carry the duration tables", () => {
    expect(record("Maximum Duration").system.costTable).toEqual([-75, -65, -50, -25, -10, -5, 0]);
    expect(record("Minimum Duration").system.costTable).toEqual([0, -5, -10, -15, -20, -25, -30]);
    expect(record("Reduced Duration").system.costTable).toEqual([-5, -10, -15, -20, -25, -30, -35]);
  });

  it("price the power modifiers and their variants", () => {
    const value = (n: string) => record(n).system.value;
    expect(["Biological", "Chi", "Divine", "Magical", "Nature", "Psionic", "Super", "Superscience"].map(value))
      .toEqual([-10, -10, -10, -10, -10, -10, -10, -10]);
    expect(value("Cosmic")).toBe(50);
    expect(value("Moral")).toBe(-20);
    expect(value("Spirit")).toBe(-5);
    expect(value("Spirit (fickle)")).toBe(-25);
    expect(value("Nature (with a TL penalty)")).toBe(-20);
  });

  it("price the Requires rolls as the page does", () => {
    expect(record("Requires DX Roll").system.value).toBe(-10);
    expect(record("Requires Per Roll").system.value).toBe(-5);
    expect(record("Requires IQ Roll (Quick Contest)").system.value).toBe(-20);
    expect(record("Requires Will Roll (Quick Contest)").system.value).toBe(-15);
    expect(record("Requires Active Defense Roll").system.value).toBe(-40);
  });
});

describe("Costs Hit Points", () => {
  it("is -10% per HP, -20% per second, and half of that for converted FP", () => {
    expect(costsHitPointsPercent(2)).toBe(-20);
    expect(costsHitPointsPercent(1, { perSecond: true })).toBe(-20);
    expect(costsHitPointsPercent(3, { converted: true })).toBe(-15);
    expect(costsHitPointsPercent(2, { converted: true, perSecond: true })).toBe(-20);
    expect(costsHitPointsPercent(0)).toBe(0);
  });

  it("reads the cost back from what the trait was priced at", () => {
    expect(costsHitPointsCost([{ name: "Costs Hit Points", value: -30 }])).toEqual({ hp: 3, perSecond: false });
    expect(costsHitPointsCost([{ name: "Costs Hit Points (per second)", value: -40 }])).toEqual({ hp: 2, perSecond: true });
    expect(costsHitPointsCost([{ name: "Reliable", value: 5 }])).toEqual({ hp: 0, perSecond: false });
  });
});

describe("Hard to Use and Reliable", () => {
  it("give -3 a level, and Hard to Use bars the power Talent", () => {
    const m = abilityRollModifiers([{ name: "Hard to Use", value: -10 }]);
    expect(m).toMatchObject({ penalty: -6, bonus: 0, talentBarred: true });
    expect(abilityRollTotal([{ name: "Hard to Use", value: -10 }], 3)).toBe(-6);
  });

  it("stops Hard to Use at four levels and Reliable at +10", () => {
    expect(abilityRollModifiers([{ name: "Hard to Use", value: -50 }]).penalty).toBe(-12);
    expect(abilityRollModifiers([{ name: "Reliable", value: 75 }]).bonus).toBe(10);
  });

  it("add Reliable to a Talent", () => {
    expect(abilityRollTotal([{ name: "Reliable", value: 10 }], 2)).toBe(4);
  });

  it("flag a trait with both", () => {
    expect(abilityRollModifiers([{ name: "Reliable", value: 5 }, { name: "Hard to Use", value: -5 }]).conflict).toBe(true);
  });
});

describe("Requires rolls", () => {
  it("price an attribute roll, a Quick Contest and an Easy skill", () => {
    expect(requiresAttributePercent("HT")).toBe(-10);
    expect(requiresAttributePercent("Per")).toBe(-5);
    expect(requiresAttributePercent("IQ", true)).toBe(-20);
    expect(requiresSkillPercent("IQ")).toBe(-10);
    expect(requiresSkillPercent("DX", true)).toBe(-5);
    expect(requiresSkillPercent("Will", true)).toBe(0);
  });

  it("reads a modifier's name", () => {
    expect(requiresRollOf({ name: "Requires IQ Roll (Quick Contest)", value: -20 })).toMatchObject({
      kind: "attribute", attribute: "IQ", quickContest: true,
    });
    expect(requiresRollOf({ name: "Requires Active Defense Roll", value: -40 })).toMatchObject({ kind: "activeDefense" });
    expect(requiresRollOf({ name: "Switchable", value: 10 })).toBeNull();
  });

  it("rolls the Active Defense Roll at DX/2 + 3, +1 Combat Reflexes, -4 a further use, -4 stunned", () => {
    expect(activeDefenseRollTarget({ dx: 12 })).toBe(9);
    expect(activeDefenseRollTarget({ dx: 12, combatReflexes: true })).toBe(10);
    expect(activeDefenseRollTarget({ dx: 12, usesThisTurn: 3 })).toBe(1);
    expect(activeDefenseRollTarget({ dx: 11, stunned: true })).toBe(4);
    expect(activeDefenseRollTarget({ dx: 12, noDefense: true })).toBeNull();
  });

  it("gives each Requires modifier's target from the current scores", () => {
    const scores = { dx: 12, iq: 13, ht: 11, will: 14, per: 10 };
    const needs = requiredRolls(
      [{ name: "Requires Will Roll", value: -5 }, { name: "Requires IQ Roll (Quick Contest)", value: -20 }, { name: "Requires Active Defense Roll", value: -40 }],
      scores,
    );
    expect(needs.map((n) => n.target)).toEqual([14, null, 9]);
  });
});

describe("durations", () => {
  it("Fixed Duration figures the margin as 3", () => {
    expect(durationMargin(9, [{ name: "Fixed Duration", value: 0 }])).toBe(3);
    expect(durationMargin(9, [])).toBe(9);
  });

  it("Reduced Duration follows the printed table", () => {
    expect([2, 3, 6, 10, 20, 30, 60].map(reducedDurationPercent)).toEqual([-5, -10, -15, -20, -25, -30, -35]);
    expect(reducedDurationPercent(7)).toBeNull();
    expect(reducedDurationDivisor([{ name: "Reduced Duration (1/6 duration)", value: -15 }])).toBe(6);
    expect(reducedDurationDivisor([{ name: "Reduced Duration", value: -20 }])).toBe(10);
  });

  it("never takes a duration below a second, and never a maintained one", () => {
    expect(mayReduceDuration(60, 60)).toBe(true);
    expect(mayReduceDuration(1, 2)).toBe(false);
    expect(mayReduceDuration(60, 2, true)).toBe(false);
    expect(reducedSeconds(60, 120)).toBe(1);
  });

  it("Maximum Duration runs from -75% under 30 seconds to -0% over 12 hours", () => {
    expect([10, 45, 300, 1200, 3600, 43200, 50000].map(maximumDurationPercent)).toEqual([-75, -65, -50, -25, -10, -5, 0]);
  });

  it("Minimum Duration runs from -0% to -30%, and stops 5% short of Always On", () => {
    expect([600, 8 * 3600, 12 * 3600, 24 * 3600, 7 * 86400, 30 * 86400, 60 * 86400].map((s) => minimumDurationPercent(s)))
      .toEqual([0, -5, -10, -15, -20, -25, -30]);
    expect(minimumDurationPercent(60 * 86400, -20)).toBe(-15);
    expect(minimumWithinMaximum(3600, 1800)).toBe(false);
    expect(minimumWithinMaximum(1800, null)).toBe(true);
  });
});

describe("Game Time, Affects Others and the Nature penalty", () => {
  it("counts uses per game day and week", () => {
    expect(gameTimeUses(6, null)).toEqual({ perGameDay: 6, perGameWeek: null });
    expect(gameTimeUses(null, 3)).toEqual({ perGameDay: null, perGameWeek: 3 });
    expect(gameTimeUses(1, 2, 7)).toEqual({ perGameDay: 7, perGameWeek: 14 });
  });

  it("charges +50% a person, or a flat +50% for a force field over an area", () => {
    expect(affectsOthersPercent(3)).toBe(150);
    expect(affectsOthersPercent(12, true)).toBe(50);
    expect(mayAffectOthers("Flight")).toBe(true);
    expect(mayAffectOthers("Healing")).toBe(false);
    expect(mayAffectOthers("Innate Attack")).toBe(false);
  });

  it("takes half the TL, rounded up, or an implant's whole TL", () => {
    expect(natureTechPenalty(7)).toBe(-4);
    expect(natureTechPenalty(3, 8)).toBe(-8);
  });
});

describe("either/or limitations and limitations on disadvantages", () => {
  it("multiplies the fractions: -20% and -30% make -6%", () => {
    expect(eitherOrPercent(-20, -30)).toBe(-6);
  });
  it("brings a limitation past -80% down to it first", () => {
    expect(eitherOrPercent(-100, -50)).toBe(-40);
  });
  it("subtracts the counter-advantage's limitation from -100%", () => {
    expect(disadvantageLimitation(-30)).toBe(-70);
  });
});

describe("power modifiers", () => {
  it("names the eleven origins with their prices", () => {
    expect(powerModifierOrigin(["Divine"])).toMatchObject({ origin: "Divine", percent: -10, disadvantagePoints: -10 });
    expect(powerModifierOrigin(["Power Modifier: Moral"])).toMatchObject({ percent: -20, disadvantagePoints: -15 });
    expect(powerModifierOrigin(["Spirit (fickle)"])).toMatchObject({ origin: "Spirit" });
    expect(powerModifierOrigin(["Cosmic"])).toMatchObject({ percent: 50 });
    expect(powerModifierOrigin(["Reliable", "Accessibility"])).toBeNull();
  });

  it("files an ability under its origin as a power", () => {
    const powers = powersOf([
      { name: "Insubstantiality", modifiers: ["Chi", "Switchable"] },
      { name: "Flight", modifiers: ["Chi"] },
      { name: "Regeneration", modifiers: ["Biological"] },
      { name: "Mind Reading", modifiers: ["Telepathy"] },
    ]);
    expect(powers.map((p) => p.key)).toEqual(["telepathy", "chi", "biological"]);
    const chi = powers.find((p) => p.key === "chi")!;
    expect(chi).toMatchObject({ psi: null, name: "Chi", abilities: ["Insubstantiality", "Flight"] });
  });
});

describe("Self-Control N/A", () => {
  it("costs 2.5 times the listed cost, fractions dropped", () => {
    expect(modifiedPoints(-10, [], 0)).toBe(-25);
    expect(modifiedPoints(-15, [], 0)).toBe(-37);
    expect(modifiedPoints(-5, [], 0)).toBe(-12);
  });
  it("still takes modifiers after", () => {
    expect(modifiedPoints(-10, [-20], 0)).toBe(-20);
  });
});
