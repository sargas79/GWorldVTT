import { describe, expect, it } from "vitest";

import { asProgressionMode, awardHistory, improvementRows, ledgerCategories, rowsForMode } from "../sheet-v2/progression.js";

const input = {
  unspent: 3,
  attributes: [
    { key: "ST" as const, score: 10, cost: 0 },
    { key: "DX" as const, score: 13, cost: 60 },
  ],
  secondaries: [{ key: "hp" as const, label: "HP", purchased: 0, value: 10, cost: 0 }],
  items: [
    { id: "s", name: "Stealth", type: "skill" as const, attributeScore: 13, item: { type: "skill", system: { points: 4, difficulty: "A", derived: { level: 14, relativeLevel: 1 } } } },
    { id: "b", name: "Bow", type: "skill" as const, attributeScore: 13, item: { type: "skill", system: { points: 1, difficulty: "A", derived: { level: 12, relativeLevel: -1 } } } },
    { id: "u", name: "Acrobatics", type: "skill" as const, attributeScore: 13, item: { type: "skill", system: { points: 0, difficulty: "H", derived: { level: 7, relativeLevel: null } } } },
  ],
  traits: [
    { id: "n", name: "Night Vision", category: "advantage", points: 1, trait: { system: { levels: 1, pointsPerLevel: 1, maxLevels: 9 } } },
    { id: "e", name: "Enemy", category: "disadvantage", points: -10, trait: { system: { levels: 1, pointsPerLevel: -5 } } },
    { id: "c", name: "Combat Reflexes", category: "advantage", points: 15, trait: { system: { points: 15 } } },
  ],
};

describe("the improvements on offer", () => {
  const rows = improvementRows(input);

  it("lists attributes, secondary characteristics, skills by name and levelled advantages", () => {
    expect(rows.map((r) => r.key)).toEqual(["attribute:ST", "attribute:DX", "secondary:hp", "item:u", "item:b", "item:s", "trait:n", "buyoff:e"]);
  });

  it("leaves out a flat advantage, and offers a disadvantage only to buy off", () => {
    expect(rows.some((r) => r.key === "trait:c" || r.key === "trait:e")).toBe(false);
    expect(rows.find((r) => r.key === "buyoff:e")).toMatchObject({ kind: "buyoff", category: "disadvantages", improve: { from: 1, to: 0, cost: 5 } });
  });

  /** An upgrade past the budget is offered and flagged, never hidden from All. */
  it("flags what would overspend", () => {
    expect(rows.find((r) => r.key === "attribute:DX")!.improve).toMatchObject({ cost: 20, overspends: true, overBy: 17 });
    expect(rows.find((r) => r.key === "item:b")!.improve).toMatchObject({ cost: 1, overspends: false, levelTo: 13 });
  });

  it("shows only what fits the budget, or only what is already bought", () => {
    expect(rowsForMode(rows, "affordable").map((r) => r.key)).toEqual(["secondary:hp", "item:u", "item:b", "trait:n"]);
    expect(rowsForMode(rows, "owned").map((r) => r.key)).toEqual(["attribute:ST", "attribute:DX", "item:b", "item:s", "trait:n", "buyoff:e"]);
    expect(rowsForMode(rows, asProgressionMode("bogus"))).toHaveLength(rows.length);
  });
});

describe("buying off and languages", () => {
  it("takes a level off a levelled disadvantage, and removes a flat one or a quirk, at the points each gave", () => {
    const rows = improvementRows({
      unspent: 10, attributes: [], secondaries: [], items: [],
      traits: [
        { id: "b", name: "Bad Temper", category: "disadvantage", points: -10, trait: { system: { points: -10 } } },
        { id: "w", name: "Wealth (Poor)", category: "disadvantage", points: -15, trait: { system: { levels: 3, pointsPerLevel: -5 } } },
        { id: "q", name: "Hums while tracking", category: "quirk", points: -1, trait: { system: { points: -1 } } },
      ],
    });
    expect(rows.map((r) => [r.key, r.category, r.improve.from, r.improve.to, r.improve.cost])).toEqual([
      ["buyoff:b", "disadvantages", 0, 0, 10],
      ["buyoff:q", "quirks", 0, 0, 1],
      ["buyoff:w", "disadvantages", 3, 2, 5],
    ]);
  });

  it("steps each side of a language up a point at a time, free for the native one, and stops at native", () => {
    const rows = improvementRows({
      unspent: 0, attributes: [], secondaries: [], items: [], traits: [],
      languages: [
        { id: "e", name: "Elvish", spoken: "broken", written: "native", isNative: false, points: 4 },
        { id: "c", name: "Common", spoken: "accented", written: "none", isNative: true, points: 0 },
      ],
    });
    expect(rows.map((r) => [r.key, r.improve.from, r.improve.to, r.improve.cost, r.improve.overspends])).toEqual([
      ["language:c:spoken", 2, 3, 0, false],
      ["language:c:written", 0, 1, 0, false],
      ["language:e:spoken", 1, 2, 1, true],
    ]);
  });
});

describe("the ledger's categories", () => {
  it("lists every category in order, with its points", () => {
    const categories = ledgerCategories({ attributes: 60, skills: "30" });
    expect(categories[0]).toEqual({ key: "attributes", points: 60 });
    expect(categories.find((c) => c.key === "skills")?.points).toBe(30);
    expect(categories.find((c) => c.key === "spells")?.points).toBe(0);
  });
});

describe("the award history", () => {
  it("lists awards newest first with their stored index, and counts the sessions named", () => {
    const history = awardHistory([
      { points: 3, at: 100, session: "Session 7" },
      { points: 2, at: 300, session: "Session 8" },
      { points: -1, at: 200, note: "correction" },
    ]);
    expect(history.rows.map((r) => r.index)).toEqual([1, 2, 0]);
    expect(history.sessions).toBe(2);
    expect(history.latestSession).toBe("Session 8");
  });
});
