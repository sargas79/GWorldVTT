import { describe, expect, it } from "vitest";

import {
  SPLIT_AGAINST,
  drAgainst,
  drByLocation,
  drProfile,
  splitSummary,
  type ArmorPiece,
} from "../armor.js";
import { DAMAGE_TYPES } from "../types.js";

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

  it("names the damage each DR applies to", () => {
    const { splits, bands } = splitSummary([mail], "torso");
    expect(splits).toBe(true);
    expect(bands.find((b) => b.dr === 2)?.types).toEqual(["cr"]);
    expect(bands.find((b) => b.dr === 4)?.types).toContain("cut");
  });

  it("ignores pieces that do not cover the location asked about", () => {
    const bands = splitSummary([mail], "skull").bands;
    expect(bands.every((b) => b.dr <= 2)).toBe(true);
  });

  /**
   * The skull protects unevenly on its own account, whatever is worn over it:
   * its natural DR stops a blow but not a poison. That is a real split and the
   * sheet is right to say so.
   */
  it("counts the skull as split because toxic bypasses its natural DR", () => {
    const { splits, bands } = splitSummary([], "skull");
    expect(splits).toBe(true);
    expect(bands.find((b) => b.types.includes("tox"))?.dr).toBe(0);
  });
});

describe("drProfile", () => {
  /**
   * The case that showed two passes were not enough: worn together against an
   * impaling attack the mail gives its higher figure and the vest its lower, and
   * that total is neither the all-cutting nor the all-crushing sum.
   */
  it("resolves overlapping pieces whose tables split differently", () => {
    const vest: ArmorPiece = {
      dr: 8,
      drSplit: 2,
      drSplitAppliesTo: SPLIT_AGAINST.highTech,
      locations: ["torso", "vitals"],
    };
    const together = [mail, vest];

    expect(drByLocation(together, "cut").torso).toBe(4 + 8);
    expect(drByLocation(together, "cr").torso).toBe(2 + 2);
    // Mail's higher figure and the vest's lower one.
    expect(drByLocation(together, "imp").torso).toBe(4 + 2);

    const bands = drProfile(together, "torso");
    expect(bands.map((b) => b.dr).sort((a, b) => a - b)).toEqual([4, 6, 12]);
    expect(bands.find((b) => b.dr === 6)?.types).toContain("imp");
  });

  /**
   * A high-tech piece is worth its lower DR against more damage types than its
   * higher one, so ordering the bands by how much they cover would headline a
   * DR 12/5 vest as DR 5. The base figure leads.
   */
  it("leads with the base DR even when the split covers more damage types", () => {
    const vest: ArmorPiece = {
      dr: 12,
      drSplit: 5,
      drSplitAppliesTo: SPLIT_AGAINST.highTech,
      locations: ["torso"],
    };
    const bands = drProfile([vest], "torso");
    expect(bands[0]?.dr).toBe(12);
    expect(bands[0]!.types.length).toBeLessThan(bands[1]!.types.length);
    expect(bands.map((b) => b.dr)).toEqual([12, 5]);
  });

  it("orders every band from the most protective down", () => {
    const vest: ArmorPiece = {
      dr: 8,
      drSplit: 2,
      drSplitAppliesTo: SPLIT_AGAINST.highTech,
      locations: ["torso", "vitals"],
    };
    const drs = drProfile([mail, vest], "torso").map((b) => b.dr);
    expect(drs).toEqual([...drs].sort((a, b) => b - a));
  });

  it("gives one band when nothing splits", () => {
    expect(drProfile([breastplate], "torso")).toEqual([
      { dr: 5, types: [...DAMAGE_TYPES] },
    ]);
  });

  /**
   * computeInjury drops the hit location entirely for fatigue and exempts toxic
   * from natural armour, so a profile that credited the skull against either
   * would tell the GM to subtract DR the injury pipeline never applies.
   */
  it("exempts toxic and fatigue from the skull's own DR, as the injury rules do", () => {
    const bands = drProfile([], "skull");
    expect(bands.find((b) => b.types.includes("tox"))?.dr).toBe(0);
    expect(bands.find((b) => b.types.includes("fat"))?.dr).toBe(0);
    expect(bands.find((b) => b.types.includes("cr"))?.dr).toBeGreaterThan(0);
  });

  it("still lets worn armour stop fatigue, which only the location's own DR skips", () => {
    const vest: ArmorPiece = {
      dr: 6,
      drSplit: null,
      drSplitAppliesTo: [],
      locations: ["skull"],
    };
    expect(drByLocation([vest], "fat").skull).toBe(6);
    expect(drByLocation([], "fat").skull).toBe(0);
  });
});
