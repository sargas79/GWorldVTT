import { describe, expect, it } from "vitest";

import {
  assistanceLines,
  assistanceOutcome,
  assistanceTarget,
  assistanceType,
  ASSISTANCE_TYPES,
  baseAssistanceRoll,
  cashAmount,
  cashModifier,
  consultationSkill,
  costWithinTables,
  facilitiesBonus,
  generalizedAssistanceBonus,
  isPrivilegeTrait,
  keyRank,
  licenseModifier,
  patronRangeForCost,
  rankCostPerLevel,
  rankUsed,
  responderCount,
} from "../pulling-rank.js";

/** The Assistance Rolls Table (p. 339): [cost per level, Patron value] -> Rank 0 to 8. */
const TABLE: Array<[number, number, number[]]> = [
  [2, 10, [-1, 1, 3, 5, 7, 9, 10, 11, 12]],
  [3, 10, [3, 5, 7, 9, 10, 11, 12, 13, 14]],
  [3, 15, [-1, 1, 3, 5, 7, 9, 10, 11, 12]],
  [3, 20, [-3, -1, 1, 3, 5, 7, 9, 10, 11]],
  [4, 10, [5, 7, 9, 10, 11, 12, 13, 14, 15]],
  [4, 15, [3, 5, 7, 9, 10, 11, 12, 13, 14]],
  [4, 20, [-1, 1, 3, 5, 7, 9, 10, 11, 12]],
  [4, 25, [-3, -1, 1, 3, 5, 7, 9, 10, 11]],
  [5, 10, [5, 7, 9, 10, 11, 12, 13, 14, 15]],
  [5, 15, [3, 5, 7, 9, 10, 11, 12, 13, 14]],
  [5, 20, [1, 3, 5, 7, 9, 10, 11, 12, 13]],
  [5, 25, [-1, 1, 3, 5, 7, 9, 10, 11, 12]],
  [5, 30, [-3, -1, 1, 3, 5, 7, 9, 10, 11]],
  [6, 15, [5, 7, 9, 10, 11, 12, 13, 14, 15]],
  [6, 20, [3, 5, 7, 9, 10, 11, 12, 13, 14]],
  [6, 25, [1, 3, 5, 7, 9, 10, 11, 12, 13]],
  [6, 30, [-1, 1, 3, 5, 7, 9, 10, 11, 12]],
  [7, 15, [5, 7, 9, 10, 11, 12, 13, 14, 15]],
  [7, 20, [5, 7, 9, 10, 11, 12, 13, 14, 15]],
  [7, 25, [3, 5, 7, 9, 10, 11, 12, 13, 14]],
  [7, 30, [1, 3, 5, 7, 9, 10, 11, 12, 13]],
  [8, 20, [5, 7, 9, 10, 11, 12, 13, 14, 15]],
  [8, 25, [3, 5, 7, 9, 10, 11, 12, 13, 14]],
  [8, 30, [3, 5, 7, 9, 10, 11, 12, 13, 14]],
  [9, 20, [5, 7, 9, 10, 11, 12, 13, 14, 15]],
  [10, 25, [5, 7, 9, 10, 11, 12, 13, 14, 15]],
  [9, 30, [3, 5, 7, 9, 10, 11, 12, 13, 14]],
  [10, 30, [3, 5, 7, 9, 10, 11, 12, 13, 14]],
];

describe("base Assistance Roll", () => {
  it("reproduces the Assistance Rolls Table", () => {
    for (const [cost, value, row] of TABLE) {
      const computed = row.map((_, rank) => baseAssistanceRoll(rank, value, cost));
      expect(computed, `${cost}/level, ${value} points`).toEqual(row);
    }
  });

  it("finds the key Rank by dropping fractions", () => {
    expect(keyRank(10, 4)).toBe(2);
    expect(keyRank(20, 5)).toBe(4);
    expect(keyRank(20, 0)).toBe(0);
  });
});

describe("Rank pricing", () => {
  it("prices Capricious Assistance at 3 points a level", () => {
    expect(rankCostPerLevel(5, [-50])).toBe(3);
    expect(rankCostPerLevel(5)).toBe(5);
    expect(rankCostPerLevel(5, [50])).toBe(8);
    expect(rankCostPerLevel(5, [100])).toBe(10);
  });

  it("reads the two tables", () => {
    expect(costWithinTables(10, 4)).toBe(true);
    expect(costWithinTables(10, 6)).toBe(false);
    expect(costWithinTables(30, 5)).toBe(true);
    expect(patronRangeForCost(2)).toEqual([10, 10]);
    expect(patronRangeForCost(7)).toEqual([15, 30]);
    expect(patronRangeForCost(9)).toEqual([20, 30]);
    expect(patronRangeForCost(11)).toBeNull();
  });
});

describe("Assistance Roll modifiers", () => {
  it("clamps appropriateness to +5 and -10 and counts prior requests", () => {
    const lines = assistanceLines({ inWorld: 9, meta: -15, previousRequests: 2, charisma: 1 });
    expect(lines).toEqual([
      { key: "inWorld", value: 5 },
      { key: "meta", value: -10 },
      { key: "previous", value: -2 },
      { key: "charisma", value: 1 },
    ]);
  });

  it("refuses an attempt under 3", () => {
    expect(assistanceTarget(5, { inWorld: -3 })).toEqual({ target: 2, attempt: false });
    expect(assistanceTarget(5, { inWorld: -2 })).toEqual({ target: 3, attempt: true });
  });

  it("picks the Rank used", () => {
    expect(rankUsed({ own: 2 })).toBe(2);
    expect(rankUsed({ own: 2, group: 4 })).toBe(4);
    expect(rankUsed({ own: 2, group: 4, groupHasLeader: true })).toBe(5);
    expect(rankUsed({ own: 2, group: 4, npc: 6 })).toBe(6);
  });
});

describe("outcome ladder", () => {
  it("brings aid on success and none on failure", () => {
    expect(assistanceOutcome({ success: true, margin: 0 })).toBe("aid");
    expect(assistanceOutcome({ success: false, margin: 3 })).toBe("none");
  });

  it("adds disciplinary action for a bad failure of an inappropriate request", () => {
    expect(assistanceOutcome({ success: false, margin: 10, inWorldPenalty: true })).toBe("disciplinary");
    expect(assistanceOutcome({ success: false, margin: 2, criticalFailure: true, inWorldPenalty: true })).toBe("disciplinary");
    expect(assistanceOutcome({ success: false, margin: 10, inWorldPenalty: false })).toBe("none");
  });

  it("follows the Capricious Assistance ladder", () => {
    const capricious = { capricious: true } as const;
    expect(assistanceOutcome({ success: true, margin: 5, ...capricious })).toBe("aid");
    expect(assistanceOutcome({ success: true, margin: 4, ...capricious })).toBe("aidComplicated");
    expect(assistanceOutcome({ success: false, margin: 4, ...capricious })).toBe("noneDrawback");
    expect(assistanceOutcome({ success: false, margin: 5, ...capricious })).toBe("disaster");
    expect(assistanceOutcome({ success: false, margin: 1, criticalFailure: true, ...capricious })).toBe("disaster");
  });
});

describe("sample assistance", () => {
  it("lists every type once", () => {
    const keys = ASSISTANCE_TYPES.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(assistanceType("cash")?.byPatron).toBe(true);
    expect(assistanceType("nope")).toBeNull();
  });

  it("works out Cash", () => {
    expect(cashAmount(1000, 0)).toBe(5);
    expect(cashAmount(1000, 4)).toBe(500);
    expect(cashAmount(1000, 8)).toBe(50000);
    expect(cashAmount(1000, 2, true)).toBe(500);
    expect(cashAmount(1000, 12)).toBe(50000);
    expect([10, 15, 20, 25, 30].map(cashModifier)).toEqual([-4, 0, 2, 4, 6]);
  });

  it("works out the numeric rows", () => {
    expect(consultationSkill(10)).toBe(17);
    expect(consultationSkill(30)).toBe(21);
    expect(facilitiesBonus(10, 8)).toBe(2);
    expect(facilitiesBonus(30, 8)).toBe(4);
    expect(facilitiesBonus(30, 12)).toBe(6);
    expect(responderCount(10)).toBe(5);
    expect(responderCount(25)).toBe(12);
    expect(licenseModifier(3, 2)).toBe(-1);
  });

  it("gives Generalized Assistance a bonus by margin", () => {
    expect(generalizedAssistanceBonus(20, { success: true, criticalSuccess: true })).toBe(4);
    expect(generalizedAssistanceBonus(20, { success: true })).toBe(2);
    expect(generalizedAssistanceBonus(10, { success: true })).toBe(1);
    expect(generalizedAssistanceBonus(20, { success: false })).toBe(-1);
    expect(generalizedAssistanceBonus(20, { success: false, criticalFailure: true })).toBe(-2);
  });

  it("names the privileges that need no roll", () => {
    expect(isPrivilegeTrait("Legal Immunity")).toBe(true);
    expect(isPrivilegeTrait("Security Clearance (Top secret)")).toBe(true);
    expect(isPrivilegeTrait("Patron")).toBe(false);
  });
});
