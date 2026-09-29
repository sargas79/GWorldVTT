import { describe, expect, it } from "vitest";

import {
  aidDelivery,
  betterRoll,
  costWithinTables,
  enforceRankTables,
  luckLevel,
} from "../pulling-rank.js";
import {
  balancedBonus,
  equipmentGradeWeightFactor,
  presentationReactions,
  pricingOf,
  ruggedObjectStats,
} from "../cost-factors.js";
import { expandedInfluenceReaction } from "../tasks-and-feats.js";

describe("Pulling Rank: the two tables on the item sheet (pp. 337-338)", () => {
  it("leaves a trait with no Patron value alone", () => {
    expect(enforceRankTables(0, 7)).toEqual({ patronValue: 0, costPerLevel: 7, changed: [], outside: false });
  });

  it("keeps a pair the tables allow", () => {
    expect(enforceRankTables(20, 5)).toEqual({ patronValue: 20, costPerLevel: 5, changed: [], outside: false });
  });

  it("holds the level cost to the range of the Patron value", () => {
    expect(enforceRankTables(10, 8)).toMatchObject({ patronValue: 10, costPerLevel: 5, changed: ["costPerLevel"] });
    expect(enforceRankTables(30, 3)).toMatchObject({ patronValue: 30, costPerLevel: 5, changed: ["costPerLevel"] });
  });

  it("snaps a Patron value to one of the five", () => {
    expect(enforceRankTables(14, 5)).toMatchObject({ patronValue: 15, changed: ["patronValue"] });
    expect(enforceRankTables(40, 6)).toMatchObject({ patronValue: 30 });
  });

  it("lets the GM go outside the tables and says the pair is outside", () => {
    const held = enforceRankTables(12, 9, true);
    expect(held).toEqual({ patronValue: 12, costPerLevel: 9, changed: [], outside: true });
    expect(costWithinTables(12, 9)).toBe(false);
  });
});

describe("Pulling Rank: what the aid hands over (pp. 339-341)", () => {
  it("names the delivery of each aid type", () => {
    expect(aidDelivery("cash")).toBe("money");
    expect(aidDelivery("muscle")).toBe("people");
    expect(aidDelivery("theCavalry")).toBe("people");
    expect(aidDelivery("facilities")).toBe("equipment");
    expect(aidDelivery("generalizedAssistance")).toBe("bonus");
    expect(aidDelivery("warrant")).toBe("hours");
    expect(aidDelivery("introduction")).toBe("none");
  });

  it("reads the best Luck a character has", () => {
    expect(luckLevel(["Charisma", "Patron"])).toBe(0);
    expect(luckLevel(["Luck"])).toBe(1);
    expect(luckLevel(["Luck", "Extraordinary Luck"])).toBe(2);
    expect(luckLevel(["Ridiculous Luck", "Luck"])).toBe(3);
    expect(luckLevel(["Lucky Streak"])).toBe(0);
  });

  it("prefers the better of two rolls", () => {
    const fail = { success: false, criticalSuccess: false, criticalFailure: false, margin: 3 };
    const worse = { success: false, criticalSuccess: false, criticalFailure: true, margin: 9 };
    const pass = { success: true, criticalSuccess: false, criticalFailure: false, margin: 1 };
    const crit = { success: true, criticalSuccess: true, criticalFailure: false, margin: 6 };
    expect(betterRoll(fail, pass)).toBe(true);
    expect(betterRoll(pass, fail)).toBe(false);
    expect(betterRoll(worse, fail)).toBe(true);
    expect(betterRoll(pass, crit)).toBe(true);
    expect(betterRoll({ ...fail, margin: 5 }, { ...fail, margin: 2 })).toBe(true);
  });
});

describe("cost factors: effects that reach rolls (p. 342)", () => {
  it("gives Balanced as +1 skill, or +1 Acc for a bow", () => {
    expect(balancedBonus("sword", true)).toEqual({ skill: 1, accuracy: 0 });
    expect(balancedBonus("bow", true)).toEqual({ skill: 0, accuracy: 1 });
    expect(balancedBonus("sword", false)).toEqual({ skill: 0, accuracy: 0 });
  });

  it("makes Rugged +2 HT and DR x2 as an object", () => {
    expect(ruggedObjectStats({ dr: 3, ht: 10, hp: 5 })).toEqual({ dr: 6, ht: 12, hp: 5 });
  });

  it("turns Presentation into reaction sources", () => {
    expect(presentationReactions([
      { name: "Signet ring", presentation: 2 },
      { name: "Boots", presentation: 0 },
      { name: "Crown", presentation: 9 },
    ])).toEqual([
      { label: "Signet ring", value: 2, condition: "" },
      { label: "Crown", value: 3, condition: "" },
    ]);
  });

  it("weighs a grade that adds tools x5 (good) or x20 (fine)", () => {
    expect(equipmentGradeWeightFactor("good", true)).toBe(5);
    expect(equipmentGradeWeightFactor("fine", true)).toBe(20);
    expect(equipmentGradeWeightFactor("fine", false)).toBe(1);
    expect(equipmentGradeWeightFactor("basic", true)).toBe(1);
    expect(pricingOf({ kind: "tool", tl: 8, equipmentQuality: "fine", qualityAddsTools: true, rugged: true }).weightFactor).toBe(24);
    expect(pricingOf({ kind: "tool", tl: 8, equipmentQuality: "good" }).weightFactor).toBe(1);
  });
});

describe("Expanded Influence Rolls: the critical option (p. 571)", () => {
  const none = { influencerSuccess: false, subjectSuccess: false, influencerFailure: false, subjectFailure: false };

  it("reads the margin without the option", () => {
    expect(expandedInfluenceReaction(2)).toBe("good");
    expect(expandedInfluenceReaction(2, null)).toBe("good");
  });

  it("counts an unmatched critical success as a victory by 8", () => {
    expect(expandedInfluenceReaction(2, { ...none, influencerSuccess: true })).toBe("excellent");
    expect(expandedInfluenceReaction(2, { ...none, influencerSuccess: true, subjectSuccess: true })).toBe("good");
  });

  it("counts an unshared critical failure as a loss by 8", () => {
    expect(expandedInfluenceReaction(-1, { ...none, influencerFailure: true })).toBe("disastrous");
    expect(expandedInfluenceReaction(-1, { ...none, influencerFailure: true, subjectFailure: true })).toBe("poor");
  });

  it("changes nothing when the subject rolled the critical", () => {
    expect(expandedInfluenceReaction(-6, { ...none, subjectSuccess: true })).toBe("veryBad");
  });
});
