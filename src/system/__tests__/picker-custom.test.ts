import { describe, expect, it } from "vitest";

import { customItemData } from "../picker-merge.js";

/** What an Add button makes when the list doesn't have what is wanted. */
describe("a custom entry from the picker", () => {
  it("makes a quirk a -1 point disadvantage with no levels (Characters p. 162)", () => {
    expect(customItemData({ itemType: "trait", category: "quirk" }, "Dislikes cats")).toEqual({
      name: "Dislikes cats",
      type: "trait",
      system: { category: "quirk", points: -1, levels: 0, pointsPerLevel: 0 },
    });
  });

  it("makes a perk a 1 point advantage, and anything else blank", () => {
    expect(customItemData({ itemType: "trait", category: "perk" }, "Fur")).toMatchObject({ system: { category: "perk", points: 1 } });
    expect(customItemData({ itemType: "skill" }, "Basket Weaving")).toEqual({ name: "Basket Weaving", type: "skill", system: {} });
  });
});

/**
 * The classic sheet's Add buttons build their item here too, so the button
 * under Quirks and the picker's custom entry cannot drift apart. The button
 * used to set only the category, which left a quirk at the field's initial
 * zero -- a quirk that cost nothing.
 */
describe("the classic sheet's Add buttons", () => {
  /** What the button passes: the type and the category off its dataset. */
  const fromButton = (type: string, category?: string) =>
    customItemData({ itemType: type, ...(category ? { category } : {}) }, `New ${type}`);

  it("prices a quirk at -1 and a perk at 1", () => {
    expect(fromButton("trait", "quirk").system).toMatchObject({ points: -1 });
    expect(fromButton("trait", "perk").system).toMatchObject({ points: 1 });
  });

  it("agrees with the picker's custom entry", () => {
    for (const category of ["quirk", "perk", "advantage", "disadvantage"]) {
      expect(fromButton("trait", category).system)
        .toEqual(customItemData({ itemType: "trait", category }, "x").system);
    }
  });

  it("keeps the category, and leaves a button with none alone", () => {
    expect(fromButton("trait", "disadvantage").system).toEqual({ category: "disadvantage" });
    // A button with no category on its dataset: a plain item of that type.
    expect(fromButton("equipment").system).toEqual({});
  });
});
