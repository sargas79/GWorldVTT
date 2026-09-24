import { afterEach, describe, expect, it, vi } from "vitest";

import { rollQuickContest, rollRegularContest } from "../contest.js";
import { unarmedBlow } from "../roll.js";

/** Secret contests, and a punch or a kick on gworld.attackModifiers (sargas79/GWorldVTT#708). */

const globals = globalThis as Record<string, unknown>;

afterEach(() => {
  for (const key of ["ChatMessage", "CONST", "CONFIG", "foundry", "game", "Hooks", "Roll", "ui"]) delete globals[key];
  vi.restoreAllMocks();
});

function foundryWith(faces: number[]) {
  const cards: Array<{ data: any; options: any }> = [];
  globals.ChatMessage = { implementation: { create: async (data: any, options: any) => { cards.push({ data, options }); return data; }, getSpeaker: () => ({}) } };
  globals.CONST = { CHAT_MESSAGE_STYLES: { OTHER: 0 } };
  globals.CONFIG = { ChatMessage: { modes: { public: {}, gm: {}, blind: {}, self: {} } } };
  globals.foundry = { utils: { escapeHTML: (s: string) => s }, applications: { handlebars: { renderTemplate: async (_path: string, data: any) => JSON.stringify(data) } } };
  globals.game = { i18n: { localize: (k: string) => k, format: (k: string, d: any) => `${k}:${JSON.stringify(d)}` }, settings: { get: () => ({}) } };
  globals.Hooks = { call: () => true, callAll: () => true };
  let next = 0;
  globals.Roll = class {
    formula: string;
    total = 0;
    dice: Array<{ results: Array<{ result: number; active?: boolean }> }> = [];
    constructor(formula: string) { this.formula = formula; }
    async evaluate() {
      const results = Array.from({ length: 3 }, () => ({ result: faces[next++ % faces.length]! }));
      this.dice = [{ results }];
      this.total = results.reduce((sum, r) => sum + r.result, 0);
      return this;
    }
  };
  return { cards };
}

const side = (name: string, base: number) => ({ actor: { name, items: [], statuses: new Set(), effects: [], getFlag: () => undefined }, base });

describe("a Quick Contest the GM rolls in secret (Campaigns p. 494)", () => {
  it("goes to the GM alone with secret, in the mode given with rollMode, and openly otherwise", async () => {
    const { cards } = foundryWith([3, 4, 5, 2, 2, 2]);
    await rollQuickContest({ label: "Spot the tail", first: side("Spy", 12), second: side("Tail", 11), secret: true });
    await rollQuickContest({ label: "Whisper", first: side("A", 10), second: side("B", 10), rollMode: "gmroll" });
    await rollQuickContest({ label: "Open", first: side("A", 10), second: side("B", 10) });
    expect(cards.map((c) => c.options)).toEqual([{ messageMode: "blind" }, { messageMode: "gm" }, {}]);
  });

  it("works the same for a Regular Contest", async () => {
    const { cards } = foundryWith([3, 3, 3, 6, 6, 6]);
    await rollRegularContest({ label: "Arm wrestle", first: side("A", 12), second: side("B", 12), secret: true });
    expect(cards[0]?.options).toEqual({ messageMode: "blind" });
  });
});

describe("a punch or a kick on the attack (Characters p. 271)", () => {
  it("is read off the row's natural key, and null for anything else", () => {
    expect(unarmedBlow("punch")).toBe("punch");
    expect(unarmedBlow("kick")).toBe("kick");
    expect(unarmedBlow("bite")).toBeNull();
    expect(unarmedBlow("")).toBeNull();
    expect(unarmedBlow(undefined)).toBeNull();
  });
});

describe("the item a side of a Quick Contest names (since API 1.136.0)", () => {
  it("reaches that side's success-roll context and the afterQuickContest report", async () => {
    foundryWith([3, 4, 5, 2, 2, 2]);
    const seen: Array<{ event: string; context: any }> = [];
    globals.Hooks = { call: () => true, callAll: (event: string, context: any) => { seen.push({ event, context: structuredClone({ ...context, actor: undefined, opponent: undefined, first: undefined, second: undefined, item: context.item?.name, firstItem: context.first?.item?.name ?? null, secondItem: context.second?.item?.name ?? null }) }); return true; } };
    const sword = { name: "Sword" };
    await rollQuickContest({ label: "Disarm", tags: ["disarm"], first: { ...side("A", 12), item: sword }, second: side("B", 11) });
    const rolls = seen.filter((s) => s.event === "gworld.successRollModifiers");
    expect(rolls.map((r) => r.context.item ?? null)).toEqual(["Sword", null]);
    const after = seen.find((s) => s.event === "gworld.afterQuickContest");
    expect(after?.context).toMatchObject({ firstItem: "Sword", secondItem: null });
  });
});
