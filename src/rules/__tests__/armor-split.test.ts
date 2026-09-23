import { describe, expect, it } from "vitest";

import { SPLIT_AGAINST } from "../armor.js";
// The data model and the pack validator both ask these two functions, so what
// the validator lets into a pack is always something the model will make.
import { splitDrOmitsCrushing, splitDrProblems } from "../../../tools/armor-split.mjs";

/** Everything but crushing: armour whose higher figure is for blows only. */
const ALL_BUT_CRUSHING = ["burn", "cor", "cut", "fat", "imp", "pi-", "pi", "pi+", "pi++", "tox"];

describe("splitDrProblems", () => {
  it("accepts armour with no split", () => {
    expect(splitDrProblems({ dr: 4, drSplit: null, drSplitAppliesTo: [] })).toEqual([]);
    expect(splitDrProblems({ dr: 4 })).toEqual([]);
  });

  it("accepts either Basic Set table's split", () => {
    expect(splitDrProblems({ dr: 4, drSplit: 2, drSplitAppliesTo: SPLIT_AGAINST.lowTech })).toEqual([]);
    expect(splitDrProblems({ dr: 12, drSplit: 5, drSplitAppliesTo: SPLIT_AGAINST.highTech })).toEqual([]);
  });

  it("accepts a split that leaves crushing on the higher figure", () => {
    expect(splitDrProblems({ dr: 2, drSplit: 1, drSplitAppliesTo: ALL_BUT_CRUSHING })).toEqual([]);
  });

  it("refuses half a pair", () => {
    expect(splitDrProblems({ dr: 4, drSplit: 2, drSplitAppliesTo: [] })).toHaveLength(1);
    expect(splitDrProblems({ dr: 4, drSplit: null, drSplitAppliesTo: ["cr"] })).toHaveLength(1);
  });

  it("refuses a second figure above the first, or one that is not a whole number", () => {
    expect(splitDrProblems({ dr: 2, drSplit: 3, drSplitAppliesTo: ["cr"] })).toHaveLength(1);
    expect(splitDrProblems({ dr: 4, drSplit: 1.5, drSplitAppliesTo: ["cr"] })).toHaveLength(1);
    expect(splitDrProblems({ dr: 4, drSplit: -1, drSplitAppliesTo: ["cr"] })).toHaveLength(1);
  });
});

describe("splitDrOmitsCrushing", () => {
  it("holds a Basic Set record to its tables", () => {
    const armor = { dr: 4, drSplit: 2, drSplitAppliesTo: ["cut"], reference: "Basic Set: Characters p. 283" };
    expect(splitDrOmitsCrushing(armor)).toBe(true);
    expect(splitDrOmitsCrushing({ ...armor, drSplitAppliesTo: SPLIT_AGAINST.lowTech })).toBe(false);
  });

  it("holds a record with no source to them too", () => {
    expect(splitDrOmitsCrushing({ dr: 4, drSplit: 2, drSplitAppliesTo: ["cut"] })).toBe(true);
  });

  it("leaves any other source's armour alone", () => {
    const armor = { dr: 2, drSplit: 1, drSplitAppliesTo: ALL_BUT_CRUSHING, reference: "Another Book p. 59" };
    expect(splitDrOmitsCrushing(armor)).toBe(false);
  });

  it("has nothing to say about armour with no split", () => {
    expect(splitDrOmitsCrushing({ dr: 4, drSplit: null, drSplitAppliesTo: [] })).toBe(false);
  });
});
