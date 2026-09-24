import { afterEach, describe, expect, it, vi } from "vitest";

import { PROCEDURE_HOOKS } from "../procedure-extensions.js";
import { hearingDistanceLine, rollSuccess } from "../roll.js";

/** A Hearing roll made some distance from a sound (Campaigns p. 358; sargas79/GWorldVTT#731). */

const globals = globalThis as Record<string, unknown>;

afterEach(() => {
  for (const key of ["ChatMessage", "CONST", "CONFIG", "foundry", "game", "Hooks", "Roll", "ui"]) delete globals[key];
  vi.restoreAllMocks();
});

/** A listener, with Parabolic Hearing's range multiplier on its hearing row where given. */
function listener(rangeMultiplier?: number) {
  return {
    name: "Listener",
    uuid: "Actor.Listener",
    isOwner: true,
    system: {
      hp: { value: 10, max: 10 },
      fp: { value: 10, max: 10 },
      derived: {
        attributes: { ST: 10, DX: 10, IQ: 10, HT: 10 },
        traitEffects: {},
        senses: [{ sense: "hearing", score: 12, modifier: 0, ...(rangeMultiplier ? { rangeMultiplier } : {}) }],
      },
    },
    items: [],
    statuses: new Set<string>(),
    effects: [],
    getFlag: () => undefined,
  };
}

/** Foundry, with dice that come up as given and every hook and card kept. */
function foundryWith(faces: number[]) {
  const cards: any[] = [];
  const heard: Array<{ event: string; context: any }> = [];
  globals.ChatMessage = { implementation: { create: async (data: any, options: any) => { cards.push({ data, options }); return data; }, getSpeaker: () => ({}) } };
  globals.CONST = { CHAT_MESSAGE_STYLES: { OTHER: 0 } };
  globals.CONFIG = { ChatMessage: { modes: { public: {}, gm: {}, blind: {}, self: {} } } };
  globals.foundry = {
    utils: { escapeHTML: (s: string) => s, deepClone: (o: any) => structuredClone(o), mergeObject: (a: any, b: any) => ({ ...a, ...b }) },
    applications: { handlebars: { renderTemplate: async (_path: string, data: any) => JSON.stringify(data) } },
  };
  globals.game = { i18n: { localize: (k: string) => k, format: (k: string, d: any) => `${k}:${JSON.stringify(d)}` }, settings: { get: () => ({}) }, user: { id: "gm" } };
  globals.ui = { notifications: { warn: vi.fn(), info: vi.fn() } };
  const listen = (event: string, context: any) => { heard.push({ event, context }); return true; };
  globals.Hooks = { call: listen, callAll: listen };
  let next = 0;
  globals.Roll = class {
    formula: string;
    total = 0;
    dice: Array<{ results: Array<{ result: number }> }> = [];
    constructor(formula: string) { this.formula = formula; }
    async evaluate() {
      const count = Number(/^(\d+)d6/.exec(this.formula)?.[1] ?? 0);
      const results = Array.from({ length: count }, () => ({ result: faces[next++ % faces.length]! }));
      this.dice = [{ results }];
      this.total = results.reduce((sum, r) => sum + r.result, 0);
      return this;
    }
  };
  return { cards, heard };
}

describe("a Hearing roll's distance", () => {
  it("adds the table's line, keyed, and tags the roll hearing", async () => {
    const { heard, cards } = foundryWith([3, 3, 3]);
    await rollSuccess({ actor: listener(), base: 12, label: "Hearing", distance: { yards: 8, baseYards: 1 } });
    const card = JSON.parse(String(cards[0].data.content));
    expect(card.modifiers).toContainEqual(expect.objectContaining({ key: "hearingDistance", value: -3 }));
    expect(card.effective).toBe(9);
    const context = heard.find((h) => h.event === PROCEDURE_HOOKS.successRollModifiers)?.context;
    expect(context.tags).toEqual(expect.arrayContaining(["hearing", "detection"]));
    expect(context.modifiers).toContainEqual(expect.objectContaining({ key: "hearingDistance", value: -3 }));
  });

  it("stretches the sound's distance by the listener's Parabolic Hearing", () => {
    foundryWith([3]);
    // Two levels: the 1-yd sound carries 4 yd, so 8 yd is one step out.
    expect(hearingDistanceLine(listener(4), { yards: 8, baseYards: 1 })?.value).toBe(-1);
    expect(hearingDistanceLine(listener(), { yards: 8, baseYards: 1 })?.value).toBe(-3);
  });

  it("keeps a line of 0 at the sound's own distance, for a listener to find", () => {
    foundryWith([3]);
    expect(hearingDistanceLine(listener(), { yards: 1, baseYards: 1 })).toMatchObject({ key: "hearingDistance", value: 0 });
  });

  it("adds nothing, and no tag, without a distance that can be read", async () => {
    const { heard } = foundryWith([3, 3, 3]);
    expect(hearingDistanceLine(listener(), { yards: 0, baseYards: 1 })).toBeNull();
    expect(hearingDistanceLine(listener(), undefined)).toBeNull();
    await rollSuccess({ actor: listener(), base: 12, label: "Climbing", distance: { yards: 8, baseYards: -1 } });
    const context = heard.find((h) => h.event === PROCEDURE_HOOKS.successRollModifiers)?.context;
    expect(context.tags).not.toContain("hearing");
    expect(context.modifiers.some((m: any) => m.key === "hearingDistance")).toBe(false);
  });
});
