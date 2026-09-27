import { afterEach, describe, expect, it, vi } from "vitest";

import { regenerate, restForADay, restForFatigue } from "../recovery.js";

/** Resting counts Regeneration (Characters p. 80) as time passing (sargas79/GWorldVTT#870). */

const globals = globalThis as Record<string, unknown>;

afterEach(() => {
  for (const key of ["ChatMessage", "CONST", "foundry", "game", "Hooks", "Roll", "ui"]) delete globals[key];
  vi.restoreAllMocks();
});

/** A character at some HP and FP, with Regeneration at a level: 0 none, 1 Slow, 2 Regular, 3 Fast. */
function character(options: { regeneration?: number; hp?: number; maxHp?: number; fp?: number } = {}) {
  return {
    name: "Troll",
    uuid: "Actor.troll",
    isOwner: true,
    system: {
      hp: { value: options.hp ?? 5, max: options.maxHp ?? 50 },
      fp: { value: options.fp ?? 5, max: 10 },
      derived: { attributes: { HT: 10 }, traitEffects: { regeneration: options.regeneration ?? 0 } },
    },
    items: [],
    statuses: new Set<string>(),
    effects: [],
    getFlag: () => undefined,
    update: async function (this: any, data: Record<string, unknown>) {
      if (typeof data["system.hp.value"] === "number") this.system.hp.value = data["system.hp.value"];
      if (typeof data["system.fp.value"] === "number") this.system.fp.value = data["system.fp.value"];
    },
    toggleStatusEffect: async () => {},
  };
}

/** Foundry as far as resting reaches, with dice that come up as given and every card kept. */
function foundryWith(faces: number[] = [3, 3, 3]) {
  const cards: any[] = [];
  globals.ChatMessage = { implementation: { create: async (data: any) => { cards.push(JSON.parse(data.content)); return data; }, getSpeaker: () => ({}) } };
  globals.CONST = { CHAT_MESSAGE_STYLES: { OTHER: 0 } };
  globals.foundry = { utils: { escapeHTML: (s: string) => s }, applications: { handlebars: { renderTemplate: async (_path: string, data: any) => JSON.stringify(data) } } };
  globals.game = { i18n: { localize: (k: string) => k, format: (k: string, d: any) => `${k}:${JSON.stringify(d)}` }, settings: { get: () => ({}) } };
  globals.Hooks = { call: () => true, callAll: () => true };
  globals.ui = { notifications: { warn: vi.fn(), info: vi.fn() } };
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
  return cards;
}

describe("resting for a while", () => {
  it("credits a Fast regenerator a point a minute alongside the fatigue", async () => {
    const cards = foundryWith();
    const troll = character({ regeneration: 3 });

    await restForFatigue({ actor: troll, minutes: 30, meal: true });

    expect(troll.system.hp.value).toBe(35);
    expect(troll.system.fp.value).toBe(9);
    expect(cards.map((c) => c.kind)).toEqual(["GWORLD.Recovery.Regeneration", "GWORLD.Recovery.Rest"]);
    expect(cards[0]).toMatchObject({ gained: 30, pool: "HP", previous: 5, now: 35, max: 50 });
    expect(cards[0].detail).toContain("GWORLD.Recovery.RegenerationRested");
    expect(cards[0].detail).toContain("GWORLD.Recovery.Rate.fast");
    expect(cards[0].detail).toContain('"minutes":30');
    expect(cards[1]).toMatchObject({ gained: 4, pool: "FP" });
  });

  it("caps the regeneration at the maximum", async () => {
    foundryWith();
    const troll = character({ regeneration: 3, hp: 40 });

    await restForFatigue({ actor: troll, minutes: 30, meal: false });

    expect(troll.system.hp.value).toBe(50);
  });

  it("posts no hit point card for a Slow regenerator over ten minutes", async () => {
    const cards = foundryWith();
    const troll = character({ regeneration: 1 });

    await restForFatigue({ actor: troll, minutes: 10, meal: false });

    expect(troll.system.hp.value).toBe(5);
    expect(troll.system.fp.value).toBe(6);
    expect(cards.map((c) => c.kind)).toEqual(["GWORLD.Recovery.Rest"]);
  });

  it("posts no hit point card for a regenerator already at full", async () => {
    const cards = foundryWith();
    const troll = character({ regeneration: 3, hp: 50 });

    await restForFatigue({ actor: troll, minutes: 30, meal: false });

    expect(cards.map((c) => c.kind)).toEqual(["GWORLD.Recovery.Rest"]);
  });

  it("changes nothing for someone without Regeneration", async () => {
    const cards = foundryWith();
    const human = character();

    await restForFatigue({ actor: human, minutes: 30, meal: false });

    expect(human.system.hp.value).toBe(5);
    expect(human.system.fp.value).toBe(8);
    expect(cards.map((c) => c.kind)).toEqual(["GWORLD.Recovery.Rest"]);
  });
});

describe("a day's rest", () => {
  it("gives a Regular regenerator the day's 24 HP even when the HT roll fails", async () => {
    const cards = foundryWith([6, 6, 6]);
    const troll = character({ regeneration: 2 });

    await restForADay({ actor: troll, modifier: 0 });

    expect(troll.system.hp.value).toBe(29);
    expect(cards.map((c) => c.kind)).toEqual(["GWORLD.Recovery.Regeneration", "GWORLD.Recovery.Daily"]);
    expect(cards[0]).toMatchObject({ gained: 24, pool: "HP", previous: 5, now: 29 });
    expect(cards[0].detail).toContain("GWORLD.Recovery.RegenerationDaily");
    expect(cards[1]).toMatchObject({ success: false, gained: 0, previous: 29 });
  });

  it("adds the HT roll's natural recovery on top of the day's Regeneration", async () => {
    const cards = foundryWith([3, 3, 3]);
    const troll = character({ regeneration: 2 });

    await restForADay({ actor: troll, modifier: 0 });

    expect(troll.system.hp.value).toBe(34);
    expect(cards[1]).toMatchObject({ success: true, gained: 5, previous: 29, now: 34 });
  });

  it("gives a Slow regenerator two points for the day", async () => {
    foundryWith([6, 6, 6]);
    const troll = character({ regeneration: 1 });

    await restForADay({ actor: troll, modifier: 0 });

    expect(troll.system.hp.value).toBe(7);
  });

  it("is the HT roll alone for someone without Regeneration", async () => {
    const cards = foundryWith([3, 3, 3]);
    const human = character();

    await restForADay({ actor: human, modifier: 0 });

    expect(human.system.hp.value).toBe(10);
    expect(cards.map((c) => c.kind)).toEqual(["GWORLD.Recovery.Daily"]);
  });
});

describe("the Regenerate button", () => {
  it("still heals for time passed outside a rest, in seconds", async () => {
    const cards = foundryWith();
    const troll = character({ regeneration: 3 });

    await regenerate({ actor: troll, seconds: 600 });

    expect(troll.system.hp.value).toBe(15);
    expect(cards[0].detail).toContain("GWORLD.Recovery.RegenerationDetail");
    expect(cards[0].detail).toContain('"seconds":600');
  });
});
