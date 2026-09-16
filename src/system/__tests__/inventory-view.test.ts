import { describe, expect, it } from "vitest";

import { armorByArea, asGearSort, readiedItems, sortGear, totalWeight } from "../sheet-v2/inventory-view.js";

describe("armour by body area", () => {
  const pieces = [
    { id: "a", name: "Leather Armor", dr: 2, locations: ["torso", "vitals", "groin"], equipped: true },
    { id: "b", name: "Leather Helm", dr: 2, locations: ["skull", "face"], equipped: true },
    { id: "c", name: "Mail Shirt", dr: 4, locations: ["torso"], equipped: false },
    { id: "d", name: "Cloak", dr: 1, locations: [], equipped: true },
  ];

  it("lists each worn piece under every area it covers, and a whole-body piece everywhere", () => {
    const areas = armorByArea(pieces);
    expect(areas.map((a) => a.key)).toEqual(["head", "torso", "arms", "hands", "legs", "feet"]);
    expect(areas.find((a) => a.key === "head")!.pieces.map((p) => p.name)).toEqual(["Cloak", "Leather Helm"]);
    expect(areas.find((a) => a.key === "torso")!.pieces.map((p) => p.name)).toEqual(["Cloak", "Leather Armor"]);
    expect(areas.find((a) => a.key === "feet")!.pieces.map((p) => p.name)).toEqual(["Cloak"]);
  });

  it("leaves out what is not worn", () => {
    expect(armorByArea(pieces).some((a) => a.pieces.some((p) => p.name === "Mail Shirt"))).toBe(false);
  });
});

describe("sorting the carried list", () => {
  const rows = [
    { id: "1", name: "Rope", quantity: 1, weight: 1.5, cost: 1 },
    { id: "2", name: "Arrow", quantity: 12, weight: 1.2, cost: 24 },
    { id: "3", name: "Backpack", quantity: 1, weight: 3, cost: 60 },
  ];

  it("sorts by name by default", () => {
    expect(sortGear(rows, asGearSort(undefined)).map((r) => r.name)).toEqual(["Arrow", "Backpack", "Rope"]);
  });

  it("sorts by a number, highest first, and flips on request", () => {
    expect(sortGear(rows, "weight").map((r) => r.name)).toEqual(["Backpack", "Rope", "Arrow"]);
    expect(sortGear(rows, "weight", true).map((r) => r.name)).toEqual(["Arrow", "Rope", "Backpack"]);
    expect(sortGear(rows, "quantity").map((r) => r.name)).toEqual(["Arrow", "Backpack", "Rope"]);
  });

  it("adds up weight", () => {
    expect(totalWeight(rows)).toBe(5.7);
  });
});

describe("what is ready to hand", () => {
  it("lists equipped weapons and shields, then carried consumables, each by name", () => {
    const items = [
      { id: "1", name: "Shortsword", type: "equipment", equipped: true, carried: true, armed: true, category: "weapon" },
      { id: "2", name: "Healing Draught", type: "equipment", equipped: false, carried: true, armed: false, category: "consumable" },
      { id: "3", name: "Buckler", type: "shield", equipped: true, carried: true, armed: true, category: "" },
      { id: "4", name: "Axe", type: "equipment", equipped: false, carried: true, armed: true, category: "weapon" },
      { id: "5", name: "Antidote", type: "equipment", equipped: false, carried: false, armed: false, category: "consumable" },
    ];
    expect(readiedItems(items).map((i) => i.name)).toEqual(["Buckler", "Shortsword", "Healing Draught"]);
  });
});
