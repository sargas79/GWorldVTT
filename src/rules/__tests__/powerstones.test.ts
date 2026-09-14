import { describe, expect, it } from "vitest";

import {
  POWERSTONE_PRICE_TABLE,
  drawFromStone,
  energyPerPoint,
  powerstoneFormulaPrice,
  powerstonePrice,
  rechargeSeconds,
  rechargeStones,
  stoneCanPay,
} from "../powerstones.js";

/** Powerstones (GURPS Magic pp. 20, 69-70; sargas79/GWorldVTT#190). */
describe("what a Powerstone costs", () => {
  it("prices a capacity the table prints at its row: capacity 10 is $1,900", () => {
    expect(powerstonePrice(10)).toBe(1900);
    expect(powerstonePrice(1)).toBe(70);
    expect(powerstonePrice(100)).toBe(675000);
  });

  it("follows the table's own formula, within the book's rounding, for every printed row", () => {
    for (const [capacity, printed] of POWERSTONE_PRICE_TABLE) {
      expect(Math.abs(powerstoneFormulaPrice(capacity) - printed) / printed).toBeLessThan(0.025);
    }
  });

  it("prices a capacity between rows by the formula, rounded as the rows are", () => {
    // Capacity 11 comes to about $2,250 by the formula, between $1,900 and $2,650.
    expect(powerstonePrice(11)).toBe(2250);
    expect(powerstonePrice(11)).toBeGreaterThan(powerstonePrice(10));
    expect(powerstonePrice(11)).toBeLessThan(powerstonePrice(12));
    expect(powerstonePrice(0)).toBe(0);
  });
});

describe("recharging", () => {
  it("regains a point a day in normal mana, a week in low, and none with no mana", () => {
    expect(rechargeSeconds("normal")).toBe(86400);
    expect(rechargeSeconds("low")).toBe(604800);
    expect(rechargeSeconds("high")).toBe(43200);
    expect(rechargeSeconds("veryHigh")).toBe(21600);
    expect(rechargeSeconds("none")).toBeNull();
  });

  it("stops at capacity", () => {
    expect(rechargeStones([{ capacity: 5, charge: 3, kind: "normal", together: false }], "high", 10 * 86400)).toEqual([5]);
  });

  it("never recharges a Manastone", () => {
    expect(rechargeStones([{ capacity: 5, charge: 0, kind: "manastone", together: false }], "veryHigh", 30 * 86400)).toEqual([0]);
  });

  it("recharges only the largest of stones kept together, and splits it between equals", () => {
    const three = [
      { capacity: 10, charge: 0, kind: "normal" as const, together: true },
      { capacity: 4, charge: 0, kind: "normal" as const, together: true },
      { capacity: 10, charge: 0, kind: "oneCollege" as const, together: true },
    ];
    expect(rechargeStones(three, "normal", 4 * 86400)).toEqual([2, 0, 2]);
  });

  it("does not let a Manastone kept with others hold them back", () => {
    const kept = [
      { capacity: 4, charge: 0, kind: "normal" as const, together: true },
      { capacity: 20, charge: 5, kind: "manastone" as const, together: true },
    ];
    expect(rechargeStones(kept, "normal", 2 * 86400)).toEqual([2, 5]);
  });
});

describe("drawing on a stone", () => {
  it("pays for a spell until the cost is met or the stone is empty", () => {
    expect(drawFromStone({ charge: 10, kind: "normal", cost: 4 })).toEqual({ spent: 4, covered: 4, remaining: 0 });
    expect(drawFromStone({ charge: 2, kind: "normal", cost: 5 })).toEqual({ spent: 2, covered: 2, remaining: 3 });
  });

  it("gives two energy a point from a dedicated stone and three from an exclusive one", () => {
    expect(energyPerPoint("dedicated")).toBe(2);
    expect(drawFromStone({ charge: 5, kind: "dedicated", cost: 5 })).toEqual({ spent: 3, covered: 5, remaining: 0 });
    expect(drawFromStone({ charge: 1, kind: "exclusive", cost: 5 })).toEqual({ spent: 1, covered: 3, remaining: 2 });
  });

  it("offers a One-College stone only for its college's spells", () => {
    const fire = { kind: "oneCollege" as const, college: "Fire", itemName: "", castThrough: null };
    expect(stoneCanPay({ ...fire, spellColleges: ["Fire"] })).toBe(true);
    expect(stoneCanPay({ ...fire, spellColleges: ["Water"] })).toBe(false);
  });

  it("offers a dedicated stone only for spells cast through its item", () => {
    const set = { kind: "dedicated" as const, college: "", itemName: "Wand of Fire", spellColleges: ["Fire"] };
    expect(stoneCanPay({ ...set, castThrough: "Wand of Fire" })).toBe(true);
    expect(stoneCanPay({ ...set, castThrough: null })).toBe(false);
    expect(stoneCanPay({ kind: "normal", college: "", itemName: "", spellColleges: ["Water"], castThrough: null })).toBe(true);
  });
});
