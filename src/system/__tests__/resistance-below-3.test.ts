import { afterEach, describe, expect, it, vi } from "vitest";

import { rollConsciousness } from "../consciousness.js";
import { PROCEDURE_HOOKS } from "../procedure-extensions.js";
import { rollSuccess } from "../roll.js";

/**
 * A roll to resist, rolled even below an effective 3, where an attempt is
 * refused (Campaigns pp. 344, 348; sargas79/GWorldVTT#752).
 */

const globals = globalThis as Record<string, unknown>;

afterEach(() => {
  for (const key of ["ChatMessage", "CONST", "CONFIG", "foundry", "game", "Hooks", "Roll", "ui"]) delete globals[key];
  vi.restoreAllMocks();
});

/** A victim with nothing on them that could change a roll. */
function victim() {
  return {
    name: "Victim",
    uuid: "Actor.Victim",
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

/** Three dice that come to the total given. */
const DICE: Record<number, number[]> = {
  3: [1, 1, 1],
  4: [1, 1, 2],
  5: [1, 2, 2],
  17: [5, 6, 6],
  18: [6, 6, 6],
};

/** An HT roll at the effective level given, made with the dice given. */
async function resist(effective: number, total: number, how: { resistance?: boolean; tags?: string[] } = { resistance: true }) {
  const { cards, heard } = foundryWith(DICE[total]!);
  const outcome = await rollSuccess({
    actor: victim(),
    base: 10,
    label: "HT to resist",
    kind: "attribute",
    modifiers: [{ label: "Poison", value: effective - 10 }],
    ...how,
  });
  return { outcome, cards, heard };
}

describe("a roll to resist below an effective 3", () => {
  for (const effective of [1, 2]) {
    it(`succeeds on a 3 or 4 at ${effective}`, async () => {
      for (const total of [3, 4]) {
        const { outcome, cards } = await resist(effective, total);
        expect(outcome).toMatchObject({ roll: total, effectiveSkill: effective, success: true });
        expect(JSON.parse(String(cards[0].data.content)).refused).toBeUndefined();
        expect((globals.ui as any).notifications.warn).not.toHaveBeenCalled();
      }
    });

    it(`fails on a 17 or 18 at ${effective}`, async () => {
      for (const total of [17, 18]) {
        const { outcome } = await resist(effective, total);
        expect(outcome).toMatchObject({ roll: total, success: false, criticalFailure: true });
      }
    });

    it(`fails on a 5 at ${effective}`, async () => {
      const { outcome } = await resist(effective, 5);
      expect(outcome).toMatchObject({ roll: 5, success: false, margin: 5 - effective });
    });
  }

  it("counts a roll the caller tags resist as one, and tags one made with the option", async () => {
    const tagged = await resist(2, 4, { tags: ["resist", "affliction"] });
    expect(tagged.outcome).toMatchObject({ success: true });

    const { heard } = await resist(1, 3);
    const context = heard.find((h) => h.event === PROCEDURE_HOOKS.successRollModifiers)?.context;
    expect(context.tags).toContain("resist");
  });

  it("rolls to stay conscious at an effective 2, and a 4 keeps the character up", async () => {
    const { cards, heard } = foundryWith(DICE[4]!);
    const actor = { ...victim(), update: vi.fn() };
    await rollConsciousness(actor, -8);
    const card = JSON.parse(String(cards[0].data.content));
    expect(card.refused).toBeUndefined();
    expect(card.effective).toBe(2);
    expect(card.outcome).toMatchObject({ roll: 4, success: true });
    expect(actor.update).not.toHaveBeenCalled();
    const context = heard.find((h) => h.event === PROCEDURE_HOOKS.successRollModifiers)?.context;
    expect(context.tags).toEqual(expect.arrayContaining(["consciousness", "resist"]));
  });

  it("still refuses an attempt below 3", async () => {
    const { outcome, cards } = await resist(2, 3, {});
    expect(outcome).toBeNull();
    expect(JSON.parse(String(cards[0].data.content)).refused).toBe(true);
  });
});
