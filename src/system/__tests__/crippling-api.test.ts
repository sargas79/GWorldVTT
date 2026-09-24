import { afterEach, describe, expect, it, vi } from "vitest";

import { SECONDS_PER_MONTH, cripple, crippleableLocation, crippledParts, healCrippled } from "../crippling.js";

/** Lasting crippling injuries a module records (Campaigns p. 422; sargas79/GWorldVTT#717). */

const globals = globalThis as Record<string, unknown>;

afterEach(() => {
  for (const key of ["foundry", "game", "Roll"]) delete globals[key];
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
    system: { hp: { value: hp, max } },
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
