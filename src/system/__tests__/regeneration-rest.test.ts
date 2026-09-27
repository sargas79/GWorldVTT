import { afterEach, describe, expect, it, vi } from "vitest";

import { healthStatus } from "../../rules/injury.js";
import { regenerate, restForADay, restForFatigue } from "../recovery.js";

const globals = globalThis as Record<string, unknown>;

afterEach(() => {
  for (const key of ["ChatMessage", "CONST", "foundry", "game", "Roll", "ui"]) delete globals[key];
  vi.restoreAllMocks();
});

/** A resting character, Regeneration at `level` (1 Slow, 2 Regular, 3 Fast; 0 none). */
function character(options: { level?: number; hp?: number; maxHp?: number; fp?: number; maxFp?: number; status?: string } = {}) {
  const actor = {
    name: "Troll",
    uuid: "Actor.troll",
    isOwner: true,
    system: {
      hp: { value: options.hp ?? 1, max: options.maxHp ?? 40 },
      fp: { value: options.fp ?? 0, max: options.maxFp ?? 10 },
      derived: { attributes: { HT: 10 }, traitEffects: { regeneration: options.level ?? 0 }, status: options.status },
    },
    items: [],
    statuses: new Set<string>(),
    effects: [],
    update: async function (this: any, data: Record<string, number>) {
      if (typeof data["system.hp.value"] === "number") this.system.hp.value = data["system.hp.value"];
      if (typeof data["system.fp.value"] === "number") this.system.fp.value = data["system.fp.value"];
      // The status follows the new total by the data model's own rule, so an
      // update to FP leaves a dead total dead rather than resetting it.
      if (typeof this.system.derived.status === "string") {
        this.system.derived.status = healthStatus(this.system.hp.value, this.system.hp.max);
      }
    },
    toggleStatusEffect: async (id: string, { active }: { active: boolean }) => {
      if (active) actor.statuses.add(id);
      else actor.statuses.delete(id);
    },
  };
  return actor;
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

/** The Regenerate button, for time passed outside a rest (Characters p. 80). */
describe("the Regenerate button", () => {
  it("clears reeling once the hit points are back above a third", async () => {
    const cards = foundryWith(3);
    const actor = character({ level: 3, hp: 2, maxHp: 30, status: "reeling" });
    actor.statuses.add("reeling");

    expect(await regenerate({ actor, seconds: 10 * 60 })).toBe(10);

    expect(actor.system.hp.value).toBe(12);
    expect(actor.statuses.has("reeling")).toBe(false);
    expect(cards.at(-1)).toMatchObject({ kind: "GWORLD.Recovery.Regeneration", gained: 10, previous: 2, now: 12 });
  });

  it("leaves reeling on when the time was too short to climb out of it", async () => {
    foundryWith(3);
    const actor = character({ level: 3, hp: 2, maxHp: 30, status: "reeling" });
    actor.statuses.add("reeling");

    await regenerate({ actor, seconds: 3 * 60 });

    expect(actor.system.hp.value).toBe(5);
    expect(actor.statuses.has("reeling")).toBe(true);
  });

  it("brings nothing back to the dead, and says so", async () => {
    const cards = foundryWith(3);
    const actor = character({ level: 3, hp: -12, maxHp: 10 });
    actor.statuses.add("dead");

    expect(await regenerate({ actor, seconds: 60 * 60 })).toBe(0);

    expect(actor.system.hp.value).toBe(-12);
    expect(actor.statuses.has("dead")).toBe(true);
    expect(cards.at(-1)).toMatchObject({ kind: "GWORLD.Recovery.Regeneration", lines: ["GWORLD.Recovery.RegenerationDead"], bad: true });
  });

  // The hit point total can say dead before the condition has been set on
  // the token, so the status alone refuses as well.
  // A total that means the status: -5×HP is dead, -10×HP destroyed (GURPS Lite p. 29).
  it.each([["dead", -60], ["destroyed", -110]] as const)("refuses a %s status without the dead condition", async (status, hp) => {
    const cards = foundryWith(3);
    const actor = character({ level: 3, hp, maxHp: 10, status });

    expect(await regenerate({ actor, seconds: 60 * 60 })).toBe(0);

    expect(actor.system.hp.value).toBe(hp);
    expect(cards.at(-1)).toMatchObject({ lines: ["GWORLD.Recovery.RegenerationDead"], bad: true });
  });
});

describe("a rest for the dead by status alone", () => {
  it.each([["dead", -60], ["destroyed", -110]] as const)("brings back no HP to a %s status without the dead condition", async (status, hp) => {
    // Every die a 6, so the day's HT roll fails and any gain is Regeneration's.
    foundryWith(6);
    const actor = character({ level: 3, hp, maxHp: 10, status });

    await restForFatigue({ actor, minutes: 30, meal: false });
    expect(actor.system.hp.value).toBe(hp);

    await restForADay({ actor, modifier: 0 });
    expect(actor.system.hp.value).toBe(hp);
  });
});
