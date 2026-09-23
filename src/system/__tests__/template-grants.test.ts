import { describe, expect, it } from "vitest";

import { templateGrants, type ItemLookup } from "../sheet-v2/template-grants.js";
import { boughtForScore } from "../sheet-v2/builder-attributes.js";

const items: Record<string, { name: string; total?: number; points?: number; levels?: number; pointsPerLevel?: number }> = {
  cr: { name: "Combat Reflexes", total: 15, points: 15 },
  guns: { name: "Guns (Pistol)", total: 4, points: 4 },
  status: { name: "Status", total: 10, points: 0, levels: 2, pointsPerLevel: 5 },
};
const itemOf: ItemLookup = (id) => items[id];

describe("what an applied template gave, with prices (#631)", () => {
  it("prices a character template's scores and secondaries on a fresh character (p. 258)", () => {
    const grants = templateGrants(
      {
        kind: "character",
        attributeCost: 0,
        written: { "attributes.ST": 11, "attributes.DX": 13, "purchased.hp": 2, "purchased.basicSpeed": 0.5 },
        previous: { "attributes.ST": 10, "attributes.DX": 10, "purchased.hp": 0, "purchased.basicSpeed": 0 },
        itemIds: ["cr", "guns"],
      },
      itemOf,
    );

    expect(grants.lines).toEqual([
      { kind: "attribute", key: "ST", score: 11, cost: 10 },
      { kind: "attribute", key: "DX", score: 13, cost: 60 },
      { kind: "secondary", key: "hp", change: 2, cost: 4 },
      { kind: "secondary", key: "basicSpeed", change: 0.5, cost: 10 },
      { kind: "item", name: "Combat Reflexes", cost: 15 },
      { kind: "item", name: "Guns (Pistol)", cost: 4 },
    ]);
    expect(grants.total).toBe(103);
  });

  it("bills a stacked template only for what it raised (p. 259)", () => {
    const grants = templateGrants(
      {
        kind: "character",
        written: { "attributes.ST": 13, "attributes.DX": 13 },
        previous: { "attributes.ST": 11, "attributes.DX": 13 },
        raised: [{ id: "status", points: 0, levels: 1 }],
      },
      itemOf,
    );

    expect(grants.lines).toEqual([
      { kind: "attribute", key: "ST", score: 13, cost: 20 },
      { kind: "attribute", key: "DX", score: 13, cost: 0 },
      { kind: "raised", name: "Status", cost: 5 },
    ]);
    expect(grants.total).toBe(25);
  });

  it("prices each racial modifier when the list prices make up the racial cost (p. 261)", () => {
    // Vampire: ST+6, HP+4, Per+3 -- 60 + 8 + 15 = 83.
    const grants = templateGrants(
      { kind: "racial", attributeCost: 83, granted: { ST: 6, hp: 4, per: 3 }, itemIds: ["cr"] },
      itemOf,
    );

    expect(grants.lines).toEqual([
      { kind: "attribute", key: "ST", change: 6, cost: 60 },
      { kind: "secondary", key: "hp", change: 4, cost: 8 },
      { kind: "secondary", key: "per", change: 3, cost: 15 },
      { kind: "item", name: "Combat Reflexes", cost: 15 },
    ]);
    expect(grants.total).toBe(98);
  });

  it("bills a discounted racial cost as a whole rather than pricing each modifier", () => {
    // Dragon: ST+15 is size-discounted, so 150 is not what the list prices add up to.
    const grants = templateGrants(
      { kind: "racial", attributeCost: 150, granted: { ST: 15, will: 3, per: 3, sm: 4 } },
      itemOf,
    );

    expect(grants.lines).toEqual([
      { kind: "attribute", key: "ST", change: 15, cost: null },
      { kind: "secondary", key: "will", change: 3, cost: null },
      { kind: "secondary", key: "per", change: 3, cost: null },
      { kind: "secondary", key: "sm", change: 4, cost: null },
      { kind: "modifiers", cost: 150 },
    ]);
    expect(grants.total).toBe(150);
  });

  it("leaves out an item that has since been deleted", () => {
    const grants = templateGrants({ kind: "character", itemIds: ["gone", "guns"] }, itemOf);
    expect(grants.lines).toEqual([{ kind: "item", name: "Guns (Pistol)", cost: 4 }]);
    expect(grants.total).toBe(4);
  });
});

describe("typing a score into the attribute box", () => {
  it("moves the bought figure by as much as the score moved", () => {
    // ST 11 bought, +2 from a racial template: the box shows 13.
    expect(boughtForScore({ entered: 14, bought: 11, score: 13 })).toBe(12);
    expect(boughtForScore({ entered: 13, bought: 11, score: 13 })).toBe(11);
    expect(boughtForScore({ entered: "10", bought: 10, score: 10 })).toBe(10);
  });

  it("ignores an empty box", () => {
    expect(boughtForScore({ entered: "", bought: 11, score: 13 })).toBeNull();
  });
});
