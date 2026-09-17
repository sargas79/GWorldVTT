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
