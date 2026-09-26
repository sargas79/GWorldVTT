import { describe, expect, it } from "vitest";

import { itemCardData } from "../item-card-facts.js";

/* The card a player posts to show the table a trait or a piece of gear (GWorldVTT #858). */

describe("itemCardData", () => {
  it("gives a trait its category, its levels and what it cost", () => {
    const card = itemCardData({
      type: "trait",
      name: "Acute Vision",
      system: { category: "advantage", levels: 3, pointsPerLevel: 2, totalPoints: 6 },
    });
    expect(card.name).toBe("Acute Vision");
    expect(card.kinds).toEqual(["TYPES.Item.trait", "GWORLD.SheetV2.Category.advantage"]);
    expect(card.facts).toEqual([
      { label: "GWORLD.ItemCard.Levels", value: "3" },
      { label: "GWORLD.ItemCard.Points", value: "6 CP" },
    ]);
  });

  it("names a trait with its specialty, and gives its self-control and reaction", () => {
    const card = itemCardData({
      type: "trait",
      name: "Phobia",
      system: { category: "disadvantage", specialty: "Heights", selfControl: 12, reactionModifier: -1, points: -10 },
    });
    expect(card.name).toContain("Heights");
    expect(card.facts).toEqual([
      { label: "GWORLD.ItemCard.Reaction", value: "-1" },
      { label: "GWORLD.ItemCard.SelfControl", value: "12" },
      { label: "GWORLD.ItemCard.Points", value: "-10 CP" },
    ]);
  });

  it("gives armor its DR, weight and cost, and more than one its count", () => {
    const card = itemCardData({ type: "armor", name: "Leather Jacket", system: { dr: 1, weight: 4, cost: 50, quantity: 2 } });
    expect(card.kinds).toEqual(["TYPES.Item.armor"]);
    expect(card.facts).toEqual([
      { label: "GWORLD.ItemCard.Dr", value: "1" },
      { label: "GWORLD.ItemCard.Quantity", value: "2" },
      { label: "GWORLD.ItemCard.Weight", value: "4 lb" },
      { label: "GWORLD.ItemCard.Cost", value: "$50" },
    ]);
  });

  it("leaves out the figures gear has none of", () => {
    expect(itemCardData({ type: "equipment", name: "Rock", system: { weight: 0, cost: 0, quantity: 1 } }).facts).toEqual([]);
  });

  it("gives a skill its attribute and difficulty", () => {
    const card = itemCardData({ type: "skill", name: "Stealth", system: { attribute: "DX", difficulty: "A", points: 4 } });
    expect(card.facts).toEqual([
      { label: "", value: "DX/A" },
      { label: "GWORLD.ItemCard.Points", value: "4 CP" },
    ]);
  });
});
