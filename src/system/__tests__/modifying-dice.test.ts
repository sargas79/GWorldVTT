import { afterEach, describe, expect, it, vi } from "vitest";

import { MODIFYING_DICE_RULE, normalizeDamage, rolledDice, shownDamage } from "../modifying-dice.js";
import { OPTIONAL_RULES_KEY } from "../optional-rules.js";
import { rollDamage } from "../roll.js";

/** Modifying Dice + Adds where the table plays it (Characters p. 269; sargas79/GWorldVTT#762). */

const globals = globalThis as Record<string, unknown>;

afterEach(() => {
  for (const key of ["ChatMessage", "CONST", "foundry", "game", "Hooks", "Roll", "ui"]) delete globals[key];
  vi.restoreAllMocks();
});

/** Foundry with the rule set as given, dice that always come up 3, and every card and roll kept. */
function foundryWith(ruleOn: boolean) {
  const cards: any[] = [];
  const formulas: string[] = [];
  globals.ChatMessage = { implementation: { create: async (data: any) => { cards.push(data); return data; }, getSpeaker: () => ({}) } };
  globals.CONST = { CHAT_MESSAGE_STYLES: { OTHER: 0 } };
  globals.foundry = { applications: { handlebars: { renderTemplate: async (_path: string, data: any) => data } } };
  globals.game = {
    i18n: { localize: (k: string) => k, format: (k: string) => k },
    settings: { get: (_system: string, key: string) => (key === OPTIONAL_RULES_KEY ? { [MODIFYING_DICE_RULE]: ruleOn } : undefined) },
    user: { id: "gm", targets: [] },
  };
  globals.ui = { notifications: { warn: vi.fn(), info: vi.fn() } };
  globals.Hooks = { call: () => true, callAll: () => true };
  globals.Roll = class {
    formula: string;
    total = 0;
    constructor(formula: string) {
      this.formula = formula;
      formulas.push(formula);
    }
    async evaluate() {
      const dice = Number(/^\(?(\d+)d6/.exec(this.formula)?.[1] ?? 0);
      const adds = /([+-]) (\d+)/.exec(this.formula);
      this.total = dice * 3 + (adds ? (adds[1] === "-" ? -1 : 1) * Number(adds[2]) : 0);
      return this;
    }
  };
  return { cards, formulas };
}

describe("normalizeDamage", () => {
  it("gives the raw and the converted formula, and says whether it changed", () => {
    expect(normalizeDamage("1d+9", true)).toEqual({ raw: "1d+9", normalized: "3d+2", converted: true });
    expect(normalizeDamage("2d+3", true)).toEqual({ raw: "2d+3", normalized: "2d+3", converted: false });
  });

  it("changes nothing with the rule off", () => {
    expect(normalizeDamage("1d+9", false)).toEqual({ raw: "1d+9", normalized: "1d+9", converted: false });
  });

  it("leaves a formula that is not dice+adds as it was", () => {
    expect(normalizeDamage("spec.", true)).toEqual({ raw: "spec.", normalized: "spec.", converted: false });
    expect(normalizeDamage("", true)).toEqual({ raw: "", normalized: "", converted: false });
  });

  it("reads the world's setting, which is off until the GM turns it on", () => {
    // No Foundry at all: the defaults, and the rule's default is off.
    expect(normalizeDamage("1d+9").converted).toBe(false);
    foundryWith(true);
    expect(normalizeDamage("1d+9").normalized).toBe("3d+2");
    foundryWith(false);
    expect(normalizeDamage("1d+9").normalized).toBe("1d+9");
  });

  it("shows the converted figure on a sheet", () => {
    foundryWith(true);
    expect(shownDamage("1d+9")).toBe("3d+2");
    expect(shownDamage("2d+5x2")).toBe("3d+1x2");
    expect(shownDamage(undefined)).toBe("");
  });
});

describe("a damage roll with the rule on", () => {
  it("adds the modifiers, then rolls the converted formula and says what it came from", async () => {
    const { cards, formulas } = foundryWith(true);
    await rollDamage({ actor: {}, label: "Axe", formula: "1d+5", damageType: "cut", modifiers: [{ label: "Bonus", value: 4 }] });
    expect(formulas).toEqual(["3d6 + 2"]);
    expect(cards[0].content).toMatchObject({ formula: "3d+2", modifiedFrom: "1d+9", basicDamage: 11 });
    // The most these dice could come to is the converted formula's.
    expect(cards[0].flags.gworld.damage.maxDamage).toBe(20);
  });

  it("rolls the formula as it was where nothing converts", async () => {
    const { cards, formulas } = foundryWith(true);
    await rollDamage({ actor: {}, label: "Axe", formula: "2d+5", damageType: "cr", modifiers: [{ label: "Penalty", value: -2 }] });
    expect(formulas).toEqual(["2d6 + 3"]);
    expect(cards[0].content).toMatchObject({ formula: "2d+5", modifiedFrom: "" });
  });

  it("never converts with the rule off", async () => {
    const { cards, formulas } = foundryWith(false);
    await rollDamage({ actor: {}, label: "Axe", formula: "1d+9", damageType: "cut" });
    expect(formulas).toEqual(["1d6 + 9"]);
    expect(cards[0].content).toMatchObject({ formula: "1d+9", modifiedFrom: "" });
  });
});

/**
 * An explosion reaches 2 yards per die of damage and its fragments 5
 * (Campaigns p. 414). With the rule on, those are the dice rolled: 2d+5 is
 * "equivalent to 3d+1" (Characters p. 269), three dice, and reaches 6 yards.
 */
describe("a blast with the rule on", () => {
  it("counts the dice a formula rolls after the conversion, a multiplier included", () => {
    expect(rolledDice("2d+5", true)).toBe(3);
    expect(rolledDice("2d+5", false)).toBe(2);
    expect(rolledDice("2d+5x2", true)).toBe(6);
    expect(rolledDice("3d-1", true)).toBe(3);
    expect(rolledDice("spec.", true)).toBe(0);
    foundryWith(true);
    expect(rolledDice("1d+9")).toBe(3);
  });

  it("reaches as far as the dice it rolls, on the card and on the flag", async () => {
    const { cards } = foundryWith(true);
    await rollDamage({ actor: {}, label: "Grenade", formula: "2d+5", damageType: "cr", explosive: true, fragmentation: "1d+4" });
    expect(cards[0].content).toMatchObject({ formula: "3d+1", blastRadius: 6, fragmentationRadius: 10 });
    expect(cards[0].flags.gworld.damage.diceOfDamage).toBe(3);
  });

  it("counts a bonus added as the blow is struck once it has turned into dice", async () => {
    const { cards } = foundryWith(true);
    await rollDamage({ actor: {}, label: "Grenade", formula: "2d+1", damageType: "cr", explosive: true, modifiers: [{ label: "Bonus", value: 3 }] });
    expect(cards[0].content).toMatchObject({ formula: "3d", blastRadius: 6 });
    expect(cards[0].flags.gworld.damage.diceOfDamage).toBe(3);
  });

  it("counts the dice as written with the rule off", async () => {
    const { cards } = foundryWith(false);
    await rollDamage({ actor: {}, label: "Grenade", formula: "2d+5", damageType: "cr", explosive: true, fragmentation: "1d+4" });
    expect(cards[0].content).toMatchObject({ formula: "2d+5", blastRadius: 4, fragmentationRadius: 5 });
    expect(cards[0].flags.gworld.damage.diceOfDamage).toBe(2);
  });
});
