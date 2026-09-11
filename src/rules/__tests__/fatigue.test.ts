import { describe, expect, it } from "vitest";

import { fatigueStatus, spendFatigue } from "../fatigue.js";

describe("the fatigue chart (Campaigns p. 426)", () => {
  /** "Less than 1/3 your FP left -- you are very tired." */
  it("is very tired below a third", () => {
    expect(fatigueStatus(12, 12)).toBe("fresh");
    expect(fatigueStatus(4, 12)).toBe("fresh");
    expect(fatigueStatus(3, 12)).toBe("veryTired");
  });

  /** "0 FP or less -- you are on the verge of collapse." */
  it("is on the verge of collapse at zero", () => {
    expect(fatigueStatus(0, 12)).toBe("collapsing");
    expect(fatigueStatus(-11, 12)).toBe("collapsing");
  });

  /** "-1xFP -- you fall unconscious." */
  it("is unconscious at -1x fatigue", () => {
    expect(fatigueStatus(-12, 12)).toBe("unconscious");
  });

  it("says nothing about somebody with no fatigue recorded", () => {
    expect(fatigueStatus(0, 0)).toBe("fresh");
  });
});

describe("spending fatigue (Campaigns p. 426)", () => {
  it("costs nothing but fatigue while there is fatigue to spend", () => {
    expect(spendFatigue({ currentFp: 10, maxFp: 12, lost: 4 })).toMatchObject({
      fp: 6,
      hpLost: 0,
    });
  });

  /** "If you suffer further fatigue, each FP you lose also causes 1 HP." */
  it("costs a hit point for each point taken below zero", () => {
    expect(spendFatigue({ currentFp: 0, maxFp: 12, lost: 3 })).toMatchObject({
      fp: -3,
      hpLost: 3,
    });
  });

  /** A loss that straddles zero only injures for the part below it. */
  it("charges only the part of the loss below zero", () => {
    expect(spendFatigue({ currentFp: 2, maxFp: 12, lost: 5 })).toMatchObject({
      fp: -3,
      hpLost: 3,
    });
  });

  /** "Your FP can never fall below this level." */
  it("floors fatigue at -1x, and takes the rest out of hit points", () => {
    const spent = spendFatigue({ currentFp: -10, maxFp: 12, lost: 5 });
    expect(spent.fp).toBe(-12);
    expect(spent.fpLost).toBe(2);
    expect(spent.hpLost).toBe(5);
    expect(spent.status).toBe("unconscious");
  });

  /** A sheet without a fatigue pool is missing a number, not out of energy. */
  it("charges no injury when no fatigue pool is recorded", () => {
    expect(spendFatigue({ currentFp: 0, maxFp: 0, lost: 3 })).toMatchObject({
      fp: -3,
      fpLost: 3,
      hpLost: 0,
    });
  });

  it("spends nothing for a loss of nothing", () => {
    expect(spendFatigue({ currentFp: 5, maxFp: 12, lost: 0 })).toMatchObject({
      fp: 5,
      fpLost: 0,
      hpLost: 0,
    });
  });
});
