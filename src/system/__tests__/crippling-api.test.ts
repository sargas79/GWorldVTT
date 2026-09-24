import { afterEach, describe, expect, it, vi } from "vitest";

import { SECONDS_PER_MONTH, cripple, crippleableLocation, crippledParts, healCrippled, settleCrippling } from "../crippling.js";
import { rollCripplingDuration } from "../dying.js";
import { createApi } from "../api.js";

/** Lasting crippling injuries a module records (Campaigns p. 422; sargas79/GWorldVTT#717). */

const globals = globalThis as Record<string, unknown>;

afterEach(() => {
  for (const key of ["foundry", "game", "Roll", "ChatMessage", "CONST"]) delete globals[key];
  vi.restoreAllMocks();
});

function foundryAt(worldTime: number, die = 4) {
  let n = 0;
  globals.foundry = { utils: { randomID: () => `id${++n}` } };
  globals.game = { time: { worldTime } };
  globals.Roll = class {
    total = 0;
    async evaluate() { this.total = die; return this; }
  };
}

function character(hp = 10, max = 10) {
  const flags: Record<string, unknown> = {};
  return {
    isOwner: true,
    name: "Patient",
    system: { hp: { value: hp, max }, derived: { attributes: { HT: 10 } } },
    getFlag: (_scope: string, key: string) => flags[key],
    setFlag: async (_scope: string, key: string, value: unknown) => { flags[key] = value; },
  };
}

describe("a crippled part kept on a character", () => {
  it("lasts 1d months less a physician's relief, and heals when they are up", async () => {
    foundryAt(1000, 5);
    const actor = character(6, 10);
    const part = await cripple(actor, "arm", { duration: "lasting", label: "Paralysing venom", treatedAtTl: 7 });
    // 5 on the die, -3 for TL7 treatment: two months.
    expect(part).toMatchObject({ location: "arm", duration: "lasting", months: 2, healsAt: 1000 + 2 * SECONDS_PER_MONTH, label: "Paralysing venom" });
    expect(crippledParts(actor)).toHaveLength(1);
    foundryAt(1000 + 2 * SECONDS_PER_MONTH);
    expect(crippledParts(actor)).toHaveLength(0);
  });

  it("takes the months given, never under one", async () => {
    foundryAt(0);
    expect((await cripple(character(), "leg", { duration: "lasting", months: 0 }))?.months).toBe(1);
  });

  it("heals a temporary crippling at full HP, and never a permanent one", async () => {
    foundryAt(0);
    const hurt = character(4, 10);
    await cripple(hurt, "hand", { duration: "temporary" });
    await cripple(hurt, "eye", { duration: "permanent" });
    expect(crippledParts(hurt).map((p) => p.location)).toEqual(["hand", "eye"]);
    hurt.system.hp.value = 10;
    expect(crippledParts(hurt).map((p) => p.location)).toEqual(["eye"]);
  });

  it("comes off by id or by location", async () => {
    foundryAt(0);
    const actor = character(4, 10);
    const arm = await cripple(actor, "arm", { duration: "permanent" });
    await cripple(actor, "leg", { duration: "permanent" });
    expect(await healCrippled(actor, arm!.id)).toBe(true);
    expect(await healCrippled(actor, "leg")).toBe(true);
    expect(await healCrippled(actor, "leg")).toBe(false);
    expect(crippledParts(actor)).toEqual([]);
  });

  it("refuses a part that can't be crippled, a duration that isn't one, or an actor the user can't change", async () => {
    foundryAt(0);
    expect(crippleableLocation("torso")).toBe(false);
    expect(await cripple(character(), "torso", { duration: "lasting" })).toBeNull();
    expect(await cripple(character(), "arm", { duration: "forever" as never })).toBeNull();
    expect(await cripple({ ...character(), isOwner: false }, "arm", { duration: "permanent" })).toBeNull();
  });
});

/**
 * Crippling nobody knows the length of yet, and crippling no injury caused
 * (Campaigns p. 422; sargas79/GWorldVTT#757).
 */
describe("crippling without an injury or a known duration", () => {
  /** Foundry, as far as the HT roll reaches, with 3d6 and 1d6 coming up as given. */
  function foundryRolling(worldTime: number, faces: number[]) {
    const cards: any[] = [];
    let n = 0;
    let next = 0;
    globals.foundry = {
      utils: { randomID: () => `id${++n}` },
      applications: { handlebars: { renderTemplate: async (_path: string, data: any) => JSON.stringify(data) } },
    };
    globals.game = {
      time: { worldTime },
      i18n: { localize: (k: string) => k, format: (k: string, d: any) => `${k}:${JSON.stringify(d)}` },
    };
    globals.ChatMessage = { implementation: { create: async (data: any) => { cards.push(data); return data; }, getSpeaker: () => ({}) } };
    globals.CONST = { CHAT_MESSAGE_STYLES: { OTHER: 0 } };
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

  it("records an undecided crippling when no duration is given, and keeps it until settled", async () => {
    foundryAt(0);
    const actor = character(4, 10);
    const part = await cripple(actor, "arm", { label: "Sword cut" });
    expect(part).toMatchObject({ duration: "undecided", injury: true, months: null, healsAt: null });
    // Back at full HP, it still waits for the roll that says what it is.
    actor.system.hp.value = 10;
    expect(crippledParts(actor)).toHaveLength(1);
  });

  it("settles as the caller says, the months running from when it was crippled", async () => {
    foundryAt(500);
    const actor = character(4, 10);
    await cripple(actor, "leg", { duration: "undecided" });
    foundryAt(9000);
    const settled = await settleCrippling(actor, "leg", { duration: "lasting", months: 2 });
    expect(settled).toMatchObject({ duration: "lasting", months: 2, since: 500, healsAt: 500 + 2 * SECONDS_PER_MONTH });
    expect(crippledParts(actor)).toEqual([settled]);
    // Only an undecided part is settled, and only to one of the three.
    expect(await settleCrippling(actor, "leg", { duration: "permanent" })).toBeNull();
    await cripple(actor, "arm");
    expect(await settleCrippling(actor, "arm", { duration: "forever" as never })).toBeNull();
  });

  it("settles by the HT roll: a failure is lasting, 1d months less the physician's relief", async () => {
    // 4+4+4 = 12 against HT 10 fails; the 1d comes up 5, less 3 at TL8.
    const cards = foundryRolling(0, [4, 4, 4, 5]);
    const actor = character(4, 10);
    const part = await cripple(actor, "eye", { label: "Thrown sand" });
    const result = await rollCripplingDuration({ actor, part: part!.id, treatedAtTl: 8 });
    expect(result).toMatchObject({ duration: "lasting", months: 2, part: { id: part!.id, duration: "lasting", months: 2 } });
    expect(crippledParts(actor)[0]).toMatchObject({ duration: "lasting", healsAt: 2 * SECONDS_PER_MONTH });
    expect(String(cards[0]?.content)).toContain("Thrown sand");
    // No undecided part by that name: nothing is rolled.
    expect(await rollCripplingDuration({ actor, part: part!.id })).toBeNull();
    expect(cards).toHaveLength(1);
  });

  it("doesn't heal a temporary crippling no injury caused at full HP", async () => {
    // 3+3+3 = 9 against HT 10 succeeds: temporary.
    const cards = foundryRolling(0, [3, 3, 3]);
    const actor = character(10, 10);
    const part = await cripple(actor, "eye", { injury: false, label: "Blinding affliction" });
    expect(part?.injury).toBe(false);
    await rollCripplingDuration({ actor, part: "eye" });
    expect(crippledParts(actor)).toMatchObject([{ duration: "temporary", injury: false, healsAt: null }]);
    expect(String(cards[0]?.content)).toContain("GWORLD.Crippled.TemporaryNoInjury");
    expect(await healCrippled(actor, "eye")).toBe(true);
  });

  it("lasts the seconds given for a temporary crippling no injury caused", async () => {
    foundryAt(100);
    const actor = character(10, 10);
    const part = await cripple(actor, "eye", { duration: "temporary", injury: false, seconds: 60 });
    expect(part).toMatchObject({ healsAt: 160 });
    foundryAt(159);
    expect(crippledParts(actor)).toHaveLength(1);
    foundryAt(160);
    expect(crippledParts(actor)).toHaveLength(0);
  });

  it("settles through the API by the caller's word, or by the roll where none is given", async () => {
    // 6+6+6 = 18: a critical failure, so permanent.
    foundryRolling(0, [6, 6, 6]);
    const actors = createApi().actors;
    const actor = character(4, 10);
    await actors.cripple(actor, "eye");
    await actors.cripple(actor, "hand", { injury: false });
    expect(await actors.settleCrippling(actor, "hand", { duration: "temporary", seconds: 30 })).toMatchObject({ duration: "temporary", healsAt: 30 });
    expect(await actors.settleCrippling(actor, "eye")).toMatchObject({ location: "eye", duration: "permanent" });
    expect(actors.crippled(actor).map((p) => p.duration)).toEqual(["permanent", "temporary"]);
  });

  it("reads a part recorded before injury was kept as an injury", async () => {
    foundryAt(0);
    const actor = character(4, 10);
    await actor.setFlag("gworld", "crippled", [{ id: "old", location: "hand", duration: "temporary", label: "", since: 0, months: null, healsAt: null }]);
    expect(crippledParts(actor)).toMatchObject([{ id: "old", injury: true }]);
    actor.system.hp.value = 10;
    expect(crippledParts(actor)).toEqual([]);
  });
});
