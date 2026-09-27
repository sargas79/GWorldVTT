import { afterEach, describe, expect, it, vi } from "vitest";

import { restForADay, restForFatigue } from "../recovery.js";

const globals = globalThis as Record<string, unknown>;

afterEach(() => {
  for (const key of ["ChatMessage", "CONST", "foundry", "game", "Roll", "ui"]) delete globals[key];
  vi.restoreAllMocks();
});

/** A resting character, Regeneration at `level` (1 Slow, 2 Regular, 3 Fast; 0 none). */
function character(options: { level?: number; hp?: number; maxHp?: number; fp?: number; maxFp?: number } = {}) {
  return {
    name: "Troll",
    isOwner: true,
    system: {
      hp: { value: options.hp ?? 1, max: options.maxHp ?? 40 },
      fp: { value: options.fp ?? 0, max: options.maxFp ?? 10 },
      derived: { attributes: { HT: 10 }, traitEffects: { regeneration: options.level ?? 0 } },
    },
    items: [],
    statuses: new Set<string>(),
    effects: [],
    update: async function (this: any, data: Record<string, number>) {
      if (typeof data["system.hp.value"] === "number") this.system.hp.value = data["system.hp.value"];
      if (typeof data["system.fp.value"] === "number") this.system.fp.value = data["system.fp.value"];
    },
  };
}

/** Foundry, as far as a rest reaches: every die comes up `face`, and each card's context is kept. */
function foundryWith(face: number) {
  const cards: any[] = [];
  globals.ChatMessage = { implementation: { create: async (data: any) => data, getSpeaker: () => ({}) } };
  globals.CONST = { CHAT_MESSAGE_STYLES: { OTHER: 0 } };
  globals.foundry = { applications: { handlebars: { renderTemplate: async (_path: string, data: any) => { cards.push(data); return ""; } } } };
  globals.game = { i18n: { localize: (k: string) => k, format: (k: string) => k }, settings: { get: () => ({}) } };
  globals.ui = { notifications: { warn: vi.fn() } };
  globals.Roll = class {
    formula: string;
    total = 0;
    dice: Array<{ results: Array<{ result: number }> }> = [];
    constructor(formula: string) { this.formula = formula; }
    async evaluate() {
      const count = Number(/^(\d+)d6/.exec(this.formula)?.[1] ?? 0);
      this.dice = [{ results: Array.from({ length: count }, () => ({ result: face })) }];
      this.total = count * face;
      return this;
    }
  };
  return cards;
}

/** Regeneration counts through a rest (sargas79/GWorldVTT#870; Characters p. 80). */
describe("Regeneration while resting", () => {
  it("brings back no HP to a regenerator who is dead", async () => {
    foundryWith(3);
    const actor = character({ level: 3, hp: -12, maxHp: 10 });
    actor.statuses.add("dead");
    await restForFatigue({ actor, minutes: 30, meal: false });
    expect(actor.system.hp.value).toBe(-12);
  });

  it("gives a Fast regenerator 30 HP over thirty minutes of rest, beside the FP", async () => {
    const cards = foundryWith(3);
    const actor = character({ level: 3 });
    expect(await restForFatigue({ actor, minutes: 30, meal: false })).toBe(3);
    expect(actor.system.fp.value).toBe(3);
    expect(actor.system.hp.value).toBe(31);
    expect(cards[0].regen).toMatchObject({ gained: 30, pool: "HP", previous: 1, now: 31, max: 40 });
  });

  it("gives the meal's extra FP as well, and caps both pools", async () => {
    const cards = foundryWith(3);
    const actor = character({ level: 3, hp: 20, maxHp: 35, fp: 8, maxFp: 10 });
    expect(await restForFatigue({ actor, minutes: 30, meal: true })).toBe(2);
    expect(actor.system.fp.value).toBe(10);
    expect(actor.system.hp.value).toBe(35);
    expect(cards[0].regen).toMatchObject({ gained: 15, now: 35 });
  });

  it("gives a Fast regenerator +4 FP with a meal when nothing caps it", async () => {
    foundryWith(3);
    const actor = character({ level: 3 });
    expect(await restForFatigue({ actor, minutes: 30, meal: true })).toBe(4);
    expect(actor.system.hp.value).toBe(31);
  });

  it("gives a Slow regenerator no HP over ten minutes, and no line claiming a gain of zero", async () => {
    const cards = foundryWith(3);
    const actor = character({ level: 1, hp: 5 });
    expect(await restForFatigue({ actor, minutes: 10, meal: false })).toBe(1);
    expect(actor.system.hp.value).toBe(5);
    expect(cards[0].regen).toBeNull();
  });

  it("credits a Regular regenerator's full day before a failed HT roll", async () => {
    const cards = foundryWith(6);
    const actor = character({ level: 2, maxHp: 29 });
    expect(await restForADay({ actor, modifier: 0 })).toBe(24);
    expect(actor.system.hp.value).toBe(25);
    expect(cards[0]).toMatchObject({ success: false, gained: 0, previous: 25 });
    expect(cards[0].regen).toMatchObject({ gained: 24, previous: 1, now: 25 });
  });

  it("adds the HT roll's recovery on top of it on a success", async () => {
    // Anyone with room for 24 more HP has 20 or more, and heals two a day on
    // the roll at 29 (Campaigns p. 424): 24 + 2.
    const cards = foundryWith(3);
    const actor = character({ level: 2, maxHp: 29 });
    expect(await restForADay({ actor, modifier: 0 })).toBe(26);
    expect(actor.system.hp.value).toBe(27);
    expect(cards[0]).toMatchObject({ success: true, gained: 2, previous: 25, now: 27 });
  });

  it("gives a Slow regenerator two points a day, capped at max HP", async () => {
    foundryWith(6);
    const slow = character({ level: 1, maxHp: 29 });
    expect(await restForADay({ actor: slow, modifier: 0 })).toBe(2);
    foundryWith(3);
    const nearlyWell = character({ level: 2, hp: 20, maxHp: 29 });
    expect(await restForADay({ actor: nearlyWell, modifier: 0 })).toBe(9);
    expect(nearlyWell.system.hp.value).toBe(29);
  });

  it("changes nothing for someone without Regeneration", async () => {
    const cards = foundryWith(3);
    const actor = character({ hp: 5, maxHp: 19 });
    expect(await restForFatigue({ actor, minutes: 30, meal: false })).toBe(3);
    expect(await restForADay({ actor, modifier: 0 })).toBe(1);
    expect(actor.system.hp.value).toBe(6);
    expect(cards.map((card) => card.regen)).toEqual([null, null]);
  });
});
