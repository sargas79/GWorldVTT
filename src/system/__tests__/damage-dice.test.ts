import { afterEach, describe, expect, it, vi } from "vitest";

import { criticalDiceRow, damageDice, damageDiceRow, diceSetsOf, storedDamageDice } from "../damage-dice.js";
import { MODIFYING_DICE_RULE } from "../modifying-dice.js";
import { OPTIONAL_RULES_KEY } from "../optional-rules.js";
import { rollDamage } from "../roll.js";

/** The dice on the damage card (sargas79/GWorldVTT#813). */

const globals = globalThis as Record<string, unknown>;

afterEach(() => {
  for (const key of ["ChatMessage", "CONST", "foundry", "game", "Hooks", "Roll", "ui"]) delete globals[key];
  vi.restoreAllMocks();
});

/** A roll as Foundry evaluates one: its die terms, each with its results. */
function evaluated(total: number, ...sets: number[][]) {
  return { total, dice: sets.map((faces) => ({ results: faces.map((result) => ({ result, active: true })) })) };
}

/**
 * Foundry with dice that come up as `faces`, one after another, and every card
 * kept. Modifying Dice + Adds is on or off as given.
 */
function foundryWith(faces: number[], modifyingDice = false) {
  const cards: any[] = [];
  const formulas: string[] = [];
  const queue = [...faces];
  globals.ChatMessage = { implementation: { create: async (data: any) => { cards.push(data); return data; }, getSpeaker: () => ({}) } };
  globals.CONST = { CHAT_MESSAGE_STYLES: { OTHER: 0 } };
  globals.foundry = { applications: { handlebars: { renderTemplate: async (_path: string, data: any) => data } } };
  globals.game = {
    i18n: { localize: (k: string) => k, format: (k: string) => k },
    settings: { get: (_system: string, key: string) => (key === OPTIONAL_RULES_KEY ? { [MODIFYING_DICE_RULE]: modifyingDice } : undefined) },
    user: { id: "gm", targets: [] },
  };
  globals.ui = { notifications: { warn: vi.fn(), info: vi.fn() } };
  globals.Hooks = { call: () => true, callAll: () => true };
  globals.Roll = class {
    formula: string;
    total = 0;
    dice: any[] = [];
    constructor(formula: string) {
      this.formula = formula;
      formulas.push(formula);
    }
    async evaluate() {
      const count = Number(/^\(?(\d+)d6/.exec(this.formula)?.[1] ?? 0);
      const adds = /d6 ([+-]) (\d+)/.exec(this.formula);
      const times = Number(/\* (\d+)$/.exec(this.formula)?.[1] ?? 1);
      const rolled = Array.from({ length: count }, () => queue.shift() ?? 1);
      this.dice = count > 0 ? [{ results: rolled.map((result) => ({ result, active: true })) }] : [];
      const sum = rolled.reduce((a, b) => a + b, 0) + (adds ? (adds[1] === "-" ? -1 : 1) * Number(adds[2]) : 0);
      this.total = sum * times;
      return this;
    }
  };
  return { cards, formulas };
}

describe("diceSetsOf", () => {
  it("gives each set's faces, leaving out a die a modifier discarded", () => {
    expect(diceSetsOf(evaluated(8, [3, 5]))).toEqual([[3, 5]]);
    expect(diceSetsOf(evaluated(0, [3, 5], [2]))).toEqual([[3, 5], [2]]);
    expect(diceSetsOf({ dice: [{ results: [{ result: 6, active: false }, { result: 2, active: true }] }] })).toEqual([[2]]);
  });

  it("gives nothing for a roll with no dice, or no roll", () => {
    expect(diceSetsOf({ total: 4, dice: [] })).toEqual([]);
    expect(diceSetsOf(undefined)).toEqual([]);
  });
});

describe("the damage card's dice row", () => {
  it("reads dice + adds = basic damage, the total left to the headline", () => {
    const dice = damageDice({ roll: evaluated(13, [3, 5]), rolled: { dice: 2, adds: 5 }, mass: 1 });
    expect(dice).toEqual({ sets: [[3, 5]], adds: 5, multiplier: 1, mass: 1, total: 13 });
    expect(damageDiceRow(dice, 13, "cut")).toEqual({ sets: [[3, 5]], from: null, adds: "+5", times: [], total: null, floor: null });
  });

  it("shows a negative add with a minus sign, and none for no adds", () => {
    expect(damageDiceRow(damageDice({ roll: evaluated(6, [4, 4]), rolled: { dice: 2, adds: -2 }, mass: 1 }), 6, "cr").adds).toBe("−2");
    expect(damageDiceRow(damageDice({ roll: evaluated(8, [4, 4]), rolled: { dice: 2, adds: 0 }, mass: 1 }), 8, "cr").adds).toBe("");
  });

  it("shows the raw dice where the damage type's minimum raised them (p. 378)", () => {
    const dice = damageDice({ roll: evaluated(-1, [1]), rolled: { dice: 1, adds: -2 }, mass: 1 });
    expect(damageDiceRow(dice, 1, "cut")).toMatchObject({ sets: [[1]], adds: "−2", total: "\u22121", floor: 1 });
    // Crushing may come to nothing at all.
    expect(damageDiceRow(dice, 0, "cr")).toMatchObject({ total: "\u22121", floor: 0 });
  });

  it("shows what the dice came to where 1/2D halved them", () => {
    const dice = damageDice({ roll: evaluated(13, [3, 5]), rolled: { dice: 2, adds: 5 }, mass: 1 });
    expect(damageDiceRow(dice, 6, "cut")).toMatchObject({ total: "13", floor: null });
  });

  it("multiplies by the formula's multiplier and then by a mass of pellets", () => {
    const dice = damageDice({ roll: evaluated(180, [3, 3, 3, 3, 3, 3]), rolled: { dice: 6, adds: 0, multiplier: 10 }, mass: 1 });
    expect(damageDiceRow(dice, 180, "cr")).toMatchObject({ times: ["×10"], total: null });
    const mass = damageDice({ roll: evaluated(5, [2, 2]), rolled: { dice: 2, adds: 1 }, mass: 3 });
    expect(mass.total).toBe(15);
    expect(damageDiceRow(mass, 15, "pi")).toMatchObject({ times: ["×3"], total: null });
  });
});

describe("storedDamageDice", () => {
  it("reads the flag back, and nothing from a card rolled before it was kept", () => {
    const dice = { sets: [[3, 5]], adds: 5, multiplier: 1, mass: 1, total: 13 };
    expect(storedDamageDice(dice)).toEqual(dice);
    expect(storedDamageDice(undefined)).toBeNull();
    expect(storedDamageDice({ adds: 2 })).toBeNull();
  });
});

describe("a critical's dice (Campaigns p. 556)", () => {
  const dice = { sets: [[3, 5]], adds: 5, multiplier: 1, mass: 1, total: 13 };

  it("shows every die at 6 where the critical takes maximum damage", () => {
    expect(criticalDiceRow(dice, 13, { maximum: true })).toEqual({ sets: [[6, 6]], from: null, adds: "+5", times: [], total: null, floor: null });
    expect(criticalDiceRow(dice, 13, { maximum: true, multiplier: 2 })?.times).toEqual(["×2"]);
  });

  it("shows the rolled damage multiplied where it doubles or triples", () => {
    expect(criticalDiceRow(dice, 13, { multiplier: 3 })).toEqual({ sets: [], from: 13, adds: "", times: ["×3"], total: null, floor: null });
  });

  it("shows nothing for a critical that leaves the damage alone, or where the dice were never kept", () => {
    expect(criticalDiceRow(dice, 13, { halfDr: "roundDown" })).toBeNull();
    expect(criticalDiceRow(dice, 13, undefined)).toBeNull();
    expect(criticalDiceRow(null, 13, { maximum: true })).toBeNull();
  });
});

describe("rollDamage", () => {
  it("puts the dice on the card and keeps them on the flag", async () => {
    const { cards } = foundryWith([3, 5]);
    const basic = await rollDamage({ actor: {}, label: "Bastard Sword", formula: "2d+5", damageType: "cut" });
    expect(basic).toBe(13);
    expect(cards[0].content).toMatchObject({ basicDamage: 13, dice: { sets: [[3, 5]], adds: "+5", times: [], total: null, floor: null } });
    expect(cards[0].flags.gworld.damage.dice).toEqual({ sets: [[3, 5]], adds: 5, multiplier: 1, mass: 1, total: 13 });
  });

  it("shows the dice actually rolled under Modifying Dice + Adds (p. 269), with the modifiers in the adds", async () => {
    const { cards } = foundryWith([2, 4, 6], true);
    await rollDamage({ actor: {}, label: "Axe", formula: "1d+5", damageType: "cut", modifiers: [{ label: "Bonus", value: 4 }] });
    expect(cards[0].content).toMatchObject({ formula: "3d+2", modifiedFrom: "1d+9", basicDamage: 14, dice: { sets: [[2, 4, 6]], adds: "+2" } });
  });

  it("keeps the raw dice where the minimum raises the total", async () => {
    const { cards } = foundryWith([1]);
    await rollDamage({ actor: {}, label: "Knife", formula: "1d-3", damageType: "cut" });
    expect(cards[0].content).toMatchObject({ basicDamage: 1, dice: { sets: [[1]], total: "\u22122", floor: 1 } });
    expect(cards[0].flags.gworld.damage.dice.total).toBe(-2);
  });

  it("shows a mass of pellets as a multiplier on the dice", async () => {
    const { cards } = foundryWith([2, 3]);
    await rollDamage({ actor: {}, label: "Shotgun", formula: "1d+1", damageType: "pi", massMultiplier: 2 });
    expect(cards[0].content).toMatchObject({ basicDamage: 6, dice: { sets: [[2]], adds: "+1", times: ["×2"], total: null } });
  });
});
