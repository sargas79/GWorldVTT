import { describe, expect, it } from "vitest";

import { SPLIT_AGAINST, drAgainst, drByLocation, splitSummary, type ArmorPiece } from "../armor.js";

/** A mail hauberk: DR 4, but DR 2 against crushing (low-tech table). */
const mail: ArmorPiece = {
  dr: 4,
  drSplit: 2,
  drSplitAppliesTo: SPLIT_AGAINST.lowTech,
  locations: ["torso", "vitals", "groin"],
};

/** A tactical suit: DR 20, but DR 10 against anything but piercing and cutting. */
const tacticalSuit: ArmorPiece = {
  dr: 20,
  drSplit: 10,
  drSplitAppliesTo: SPLIT_AGAINST.highTech,
  locations: [],
};

/** A plain steel breastplate, with one DR for everything. */
const breastplate: ArmorPiece = {
  dr: 5,
  drSplit: null,
  drSplitAppliesTo: [],
  locations: ["torso", "vitals"],
};

describe("drAgainst", () => {
  it("uses the single DR when the armour does not split", () => {
    for (const type of ["cr", "cut", "imp", "burn"] as const) {
      expect(drAgainst(breastplate, type)).toBe(5);
    }
  });

  it("turns a blade but not a mace, for low-tech armour", () => {
    expect(drAgainst(mail, "cut")).toBe(4);
    expect(drAgainst(mail, "imp")).toBe(4);
    expect(drAgainst(mail, "pi")).toBe(4);
    expect(drAgainst(mail, "cr")).toBe(2);
  });

  it("gives high-tech armour its higher DR only against piercing and cutting", () => {
    expect(drAgainst(tacticalSuit, "cut")).toBe(20);
    expect(drAgainst(tacticalSuit, "pi+")).toBe(20);
    expect(drAgainst(tacticalSuit, "cr")).toBe(10);
    expect(drAgainst(tacticalSuit, "burn")).toBe(10);
  });

  /**
   * The two tables are written from opposite ends, so this pins down the one
   * place they genuinely differ: impaling takes the higher DR under the
   * low-tech footnote and the lower under the high-tech one.
   */
  it("differs between the tables only on the types the low-tech note omits", () => {
    for (const shared of ["cr"] as const) {
      expect(drAgainst(mail, shared)).toBe(mail.drSplit);
      expect(drAgainst(tacticalSuit, shared)).toBe(tacticalSuit.drSplit);
    }
    for (const shared of ["cut", "pi"] as const) {
      expect(drAgainst(mail, shared)).toBe(mail.dr);
      expect(drAgainst(tacticalSuit, shared)).toBe(tacticalSuit.dr);
    }
    expect(drAgainst(mail, "imp")).toBe(mail.dr);
    expect(drAgainst(tacticalSuit, "imp")).toBe(tacticalSuit.drSplit);
  });
});

describe("drByLocation", () => {
  it("protects only what it covers", () => {
    const dr = drByLocation([mail], "cut");
    expect(dr.torso).toBe(4);
    expect(dr.vitals).toBe(4);
    expect(dr.arm).toBe(0);
  });

  it("applies the split per location", () => {
    const cutting = drByLocation([mail], "cut");
    const crushing = drByLocation([mail], "cr");
    expect(cutting.torso).toBe(4);
    expect(crushing.torso).toBe(2);
  });

  it("treats an empty location list as the whole body", () => {
    const dr = drByLocation([tacticalSuit], "cut");
    expect(dr.torso).toBe(20);
    expect(dr.foot).toBe(20);
  });

  it("keeps the skull's own DR, which the body came with", () => {
    const bare = drByLocation([], "cr");
    expect(bare.skull).toBeGreaterThan(0);
    expect(bare.torso).toBe(0);
  });

  it("sums pieces that overlap, each against the same damage", () => {
    const dr = drByLocation([mail, breastplate], "cr");
    expect(dr.torso).toBe(2 + 5);
    expect(dr.groin).toBe(2);
  });
});

describe("splitSummary", () => {
  it("reports nothing to explain when no covering piece splits", () => {
    expect(splitSummary([breastplate], "torso").splits).toBe(false);
  });

  it("names the damage the lower DR applies to", () => {
    const summary = splitSummary([mail], "torso");
    expect(summary.splits).toBe(true);
    expect(summary.against).toEqual(["cr"]);
  });

  it("ignores pieces that do not cover the location asked about", () => {
    expect(splitSummary([mail], "skull").splits).toBe(false);
  });
});
