import { describe, expect, it } from "vitest";

import { awardsNewestFirst, earnedPoints, pointsLedger } from "../character-points.js";

describe("what a character has earned", () => {
  it("adds the awards up", () => {
    expect(earnedPoints([{ points: 3 }, { points: 5 }, { points: 2 }])).toBe(10);
  });

  it("is nothing for a character who has played no sessions", () => {
    expect(earnedPoints([])).toBe(0);
  });

  /** A correction is an award that goes the other way, and they do happen. */
  it("subtracts a correction", () => {
    expect(earnedPoints([{ points: 10 }, { points: -4, note: "miscounted" }])).toBe(6);
  });

  it("ignores an award with no number on it", () => {
    expect(earnedPoints([{ points: 5 }, { points: NaN }])).toBe(5);
  });
});

describe("the points ledger", () => {
  const ledger = (starting: number, awards: Array<{ points: number }>, spent: number) =>
    pointsLedger({ starting, awards, spent });

  it("keeps what they started with apart from what they earned", () => {
    const sheet = ledger(150, [{ points: 5 }, { points: 3 }], 152);
    expect(sheet.starting).toBe(150);
    expect(sheet.earned).toBe(8);
    expect(sheet.available).toBe(158);
    expect(sheet.spent).toBe(152);
    expect(sheet.unspent).toBe(6);
  });

  it("has nothing earned before the first session", () => {
    const sheet = ledger(150, [], 150);
    expect(sheet.earned).toBe(0);
    expect(sheet.available).toBe(150);
    expect(sheet.unspent).toBe(0);
  });

  /**
   * Spending past the total is allowed -- a GM may permit it, and a character
   * mid-build is over and under by turns -- so it is reported, not refused.
   */
  it("reports an overspend rather than refusing it", () => {
    const sheet = ledger(150, [], 163);
    expect(sheet.unspent).toBe(-13);
    expect(sheet.overBudget).toBe(true);
  });

  it("is not over budget at exactly the total", () => {
    expect(ledger(150, [], 150).overBudget).toBe(false);
  });

  /** Earned points are spendable: they raise the budget, not just the total. */
  it("lets earned points pay for what starting points could not", () => {
    const before = ledger(150, [], 155);
    const after = ledger(150, [{ points: 5 }], 155);
    expect(before.overBudget).toBe(true);
    expect(after.overBudget).toBe(false);
    expect(after.unspent).toBe(0);
  });

  it("survives a sheet with nothing sensible on it", () => {
    const sheet = pointsLedger({ starting: NaN, awards: [], spent: NaN });
    expect(sheet.available).toBe(0);
    expect(sheet.unspent).toBe(0);
  });
});

describe("reading the award log", () => {
  it("puts the newest award first", () => {
    const sorted = awardsNewestFirst([
      { points: 1, at: 100 },
      { points: 2, at: 300 },
      { points: 3, at: 200 },
    ]);
    expect(sorted.map((a) => a.points)).toEqual([2, 3, 1]);
  });

  /** An award written before this kept dates is older than any that has one. */
  it("puts an undated award last", () => {
    const sorted = awardsNewestFirst([{ points: 1 }, { points: 2, at: 50 }]);
    expect(sorted.map((a) => a.points)).toEqual([2, 1]);
  });

  it("leaves the original list alone", () => {
    const awards = [{ points: 1, at: 1 }, { points: 2, at: 2 }];
    awardsNewestFirst(awards);
    expect(awards.map((a) => a.points)).toEqual([1, 2]);
  });
});
