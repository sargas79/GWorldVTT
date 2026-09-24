import { afterEach, describe, expect, it, vi } from "vitest";

import { PROCEDURE_HOOKS, successRollLines } from "../procedure-extensions.js";
import { rollSuccess } from "../roll.js";

/**
 * A `gworld.successRollModifiers` listener that refuses the roll outright,
 * for a rule that says it can't be made at all (sargas79/GWorldVTT#759).
 */

const globals = globalThis as Record<string, unknown>;

afterEach(() => {
  for (const key of ["ChatMessage", "CONST", "CONFIG", "foundry", "game", "Hooks", "Roll", "ui"]) delete globals[key];
  vi.restoreAllMocks();
});

/** A character with nothing on them that could change a roll. */
function character() {
  return {
    name: "Operator",
    uuid: "Actor.Operator",
    isOwner: true,
    system: {
      hp: { value: 10, max: 10 },
      fp: { value: 10, max: 10 },
      derived: { attributes: { ST: 10, DX: 10, IQ: 10, HT: 10 }, traitEffects: {} },
    },
    items: [],
    statuses: new Set<string>(),
    effects: [],
    getFlag: () => undefined,
  };
}

/**
 * Foundry, with a `gworld.successRollModifiers` listener that does what it is
 * given, and every hook, card and die kept.
 */
function foundryWith(listener: (context: any) => void) {
  const cards: any[] = [];
  const heard: Array<{ event: string; context: any }> = [];
  const dice: string[] = [];
  globals.ChatMessage = { implementation: { create: async (data: any, options: any) => { cards.push({ data, options }); return data; }, getSpeaker: () => ({}) } };
  globals.CONST = { CHAT_MESSAGE_STYLES: { OTHER: 0 } };
  globals.CONFIG = { ChatMessage: { modes: { public: {}, gm: {}, blind: {}, self: {} } } };
  globals.foundry = {
    utils: { escapeHTML: (s: string) => s, deepClone: (o: any) => structuredClone(o), mergeObject: (a: any, b: any) => ({ ...a, ...b }) },
    applications: { handlebars: { renderTemplate: async (_path: string, data: any) => JSON.stringify(data) } },
  };
  globals.game = { i18n: { localize: (k: string) => k, format: (k: string, d: any) => `${k}:${JSON.stringify(d)}` }, settings: { get: () => ({}) }, user: { id: "gm" } };
  globals.ui = { notifications: { warn: vi.fn(), info: vi.fn() } };
  const listen = (event: string, context: any) => {
    heard.push({ event, context });
    if (event === PROCEDURE_HOOKS.successRollModifiers) listener(context);
    return true;
  };
  globals.Hooks = { call: listen, callAll: listen };
  globals.Roll = class {
    formula: string;
    total = 0;
    dice: Array<{ results: Array<{ result: number }> }> = [];
    constructor(formula: string) { this.formula = formula; }
    async evaluate() {
      dice.push(this.formula);
      this.dice = [{ results: [{ result: 3 }, { result: 3 }, { result: 4 }] }];
      this.total = 10;
      return this;
    }
  };
  return { cards, heard, dice };
}

const OUT_OF_RANGE = "The drone is out of the controller's range.";

describe("a success-roll listener that refuses the roll", () => {
  it("stops the roll: no dice, a warning, a card with the reason, and no afterSuccessRoll", async () => {
    const { cards, heard, dice } = foundryWith((context) => { context.refusal = OUT_OF_RANGE; });
    const outcome = await rollSuccess({ actor: character(), base: 14, label: "Electronics Operation", skill: "Electronics Operation" });

    expect(outcome).toBeNull();
    expect(dice).toEqual([]);
    expect((globals.ui as any).notifications.warn).toHaveBeenCalledWith(OUT_OF_RANGE);
    expect(cards).toHaveLength(1);
    const card = JSON.parse(String(cards[0].data.content));
    expect(card).toMatchObject({ refused: true, resultLabel: OUT_OF_RANGE, base: 14, effective: 14 });
    expect(heard.some((h) => h.event === PROCEDURE_HOOKS.afterSuccessRoll)).toBe(false);
  });

  it("resolves to the refusal with returnRefusal, the listener's reason and lines in it", async () => {
    foundryWith((context) => {
      context.modifiers.push({ label: "Bad signal", value: -2 });
      context.refusal = `  ${OUT_OF_RANGE}  `;
    });
    const outcome = await rollSuccess({ actor: character(), base: 14, label: "Piloting", skill: "Piloting", returnRefusal: true });
    expect(outcome).toMatchObject({ refused: true, reason: OUT_OF_RANGE, base: 14, effective: 12 });
    expect((outcome as any).modifiers).toContainEqual({ label: "Bad signal", value: -2 });
  });

  it("shows the listener's reason rather than the one below 3", async () => {
    const { cards } = foundryWith((context) => { context.refusal = OUT_OF_RANGE; });
    const outcome = await rollSuccess({ actor: character(), base: 2, label: "Piloting", returnRefusal: true });
    expect(outcome).toMatchObject({ refused: true, reason: OUT_OF_RANGE });
    expect(JSON.parse(String(cards[0].data.content)).resultLabel).toBe(OUT_OF_RANGE);
  });

  it("posts the refusal in the roll's own message mode", async () => {
    const { cards } = foundryWith((context) => { context.refusal = OUT_OF_RANGE; });
    await rollSuccess({ actor: character(), base: 14, label: "Piloting", secret: true });
    expect(cards[0].options).toEqual({ messageMode: "blind" });
  });

  it("offers refusal as null, and rolls as usual where it is left so, blank, or not text", async () => {
    for (const refusal of [undefined, null, "", "   ", 5, true]) {
      const offered: unknown[] = [];
      const { heard, dice } = foundryWith((context) => {
        offered.push(context.refusal);
        if (refusal !== undefined) context.refusal = refusal;
      });
      const outcome = await rollSuccess({ actor: character(), base: 14, label: "Piloting" });
      expect(offered).toEqual([null]);
      expect(outcome).toMatchObject({ roll: 10, success: true });
      expect(dice).toEqual(["3d6"]);
      expect(heard.some((h) => h.event === PROCEDURE_HOOKS.afterSuccessRoll)).toBe(true);
    }
  });

  it("can't refuse an active defense, whose context has no refusal", async () => {
    const offered: unknown[] = [];
    const { dice } = foundryWith((context) => {
      offered.push("refusal" in context);
      context.refusal = OUT_OF_RANGE;
    });
    const outcome = await rollSuccess({ actor: character(), base: 10, label: "Dodge", kind: "defense", tags: ["dodge"] });
    expect(offered).toEqual([false]);
    expect(outcome).toMatchObject({ roll: 10 });
    expect(dice).toEqual(["3d6"]);
  });

  it("isn't offered to the rolls made outside roll.success", () => {
    const offered: boolean[] = [];
    foundryWith((context) => { offered.push("refusal" in context); });
    successRollLines({ actor: character(), label: "Fright Check", kind: "attribute", skill: "", base: 10, tags: ["fright", "will"], modifiers: [] });
    expect(offered).toEqual([false]);
  });
});
