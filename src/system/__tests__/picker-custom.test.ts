import { describe, expect, it } from "vitest";

import { customItemData, customKindKey, namedByPlayer } from "../picker-merge.js";

/**
 * A quirk or a perk is the player's own words, so its name is written in the
 * row; so is a trait that came from nowhere in the compendia. A trait the
 * book prints keeps the book's name.
 */
describe("whose name it is", () => {
  it("is the player's for a quirk or a perk", () => {
    expect(namedByPlayer({ type: "trait", system: { category: "quirk", reference: "" } })).toBe(true);
    expect(namedByPlayer({ type: "trait", system: { category: "perk", reference: "B100" } })).toBe(true);
  });

  it("is the player's for a trait with no compendium source", () => {
    expect(namedByPlayer({ type: "trait", system: { category: "disadvantage", reference: "" } })).toBe(true);
    expect(namedByPlayer({ type: "trait", system: { category: "advantage" } })).toBe(true);
  });

  it("is the book's for a printed trait, and never a skill's", () => {
    expect(namedByPlayer({ type: "trait", system: { category: "disadvantage", reference: "B128" } })).toBe(false);
    expect(namedByPlayer({ type: "skill", system: {} })).toBe(false);
  });
});

/** "New quirk", never "New Trait": the kind a custom entry is named for. */
describe("what a custom entry is called", () => {
  it("names a trait by its category and anything else by its type", () => {
    expect(customKindKey({ itemType: "trait", category: "quirk" })).toBe("GWORLD.Picker.Kind.quirk");
    expect(customKindKey({ itemType: "trait", category: "perk" })).toBe("GWORLD.Picker.Kind.perk");
    expect(customKindKey({ itemType: "skill" })).toBe("TYPES.Item.skill");
  });
});

/** What an Add button makes when the list doesn't have what is wanted. */
describe("a custom entry from the picker", () => {
  it("makes a quirk a -1 point disadvantage with no levels (Characters p. 162)", () => {
    expect(customItemData({ itemType: "trait", category: "quirk" }, "Dislikes cats")).toEqual({
      name: "Dislikes cats",
      type: "trait",
      system: { category: "quirk", points: -1, levels: 0, pointsPerLevel: 0 },
    });
  });

  it("makes a character's first language their free native one (#635)", () => {
    expect(customItemData({ itemType: "language" }, "Native language", { firstLanguage: true })).toEqual({
      name: "Native language",
      type: "language",
      system: { isNative: true },
    });
    expect(customItemData({ itemType: "language" }, "New Language")).toEqual({ name: "New Language", type: "language", system: {} });
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
