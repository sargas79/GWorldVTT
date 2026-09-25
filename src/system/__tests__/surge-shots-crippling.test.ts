import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../optional-rules.js", () => ({ isRuleOn: () => true }));
vi.mock("../cinematic.js", () => ({ hasInfiniteAmmunition: (actor: any) => actor?.infinite === true }));

import { surgeEffect } from "../../rules/surge.js";
import { noTraitEffects, traitEffects } from "../../rules/trait-effects.js";
import { cripplingMonths, cripplingRelief } from "../../rules/mortal-wounds.js";
import { withinLinkedArea } from "../../rules/linked-effects.js";
import { spendModeShots } from "../ammunition.js";
import { SECONDS_PER_MONTH, cripple, crippledParts, settleCrippling, treatCrippled, treatedMonths } from "../crippling.js";

/**
 * Surge on Electrical, spending a mode's shots, a linked line's own area and
 * a physician's TL on a crippled part (sargas79/GWorldVTT#832, #833, #835,
 * #836; API 1.155.0).
 */

const globals = globalThis as Record<string, unknown>;

describe("Surge against Electrical (Characters pp. 105, 134)", () => {
  it("reads the Electrical disadvantage", () => {
    expect(traitEffects([{ name: "Electrical" }]).electrical).toBe(true);
    expect(noTraitEffects().electrical).toBeUndefined();
  });

  it("knocks out a victim with Electrical on a critical hit, and leaves any other hit to the GM", () => {
    expect(surgeEffect({ surge: true, electrical: true, criticalHit: true })).toBe("shortCircuit");
    expect(surgeEffect({ surge: true, electrical: true, criticalHit: false })).toBe("gmDecides");
  });

  it("does nothing without Surge, or to somebody without Electrical", () => {
    expect(surgeEffect({ surge: false, electrical: true, criticalHit: true })).toBeNull();
    expect(surgeEffect({ surge: true, electrical: false, criticalHit: true })).toBeNull();
  });
});

describe("a linked line's own area (Campaigns p. 381)", () => {
  it("reaches only those within its radius of where the attack landed", () => {
    expect(withinLinkedArea(3, 5)).toBe(true);
    expect(withinLinkedArea(5, 5)).toBe(true);
    expect(withinLinkedArea(6, 5)).toBe(false);
  });

  it("reaches everyone the attack did without a radius, or where nothing was measured", () => {
    expect(withinLinkedArea(50, 0)).toBe(true);
    expect(withinLinkedArea(null, 5)).toBe(true);
  });
});

/** A rifle with a 30-round magazine, and a second mode sharing it. */
function rifle(loaded: number, actor: any = {}) {
  const item: any = {
    isOwner: true,
    name: "Rifle",
    actor,
    system: { rangedModes: [{ shots: "30(3)", loaded }, { shots: "30(3)", loaded }] },
    update: vi.fn(async (data: any) => { item.system.rangedModes = data["system.rangedModes"]; }),
  };
  return item;
}

describe("items.spendShots", () => {
  const heard: any[] = [];
  beforeEach(() => {
    heard.length = 0;
    globals.Hooks = { callAll: (event: string, context: any) => { if (event === "gworld.afterShots") heard.push({ event, context }); } };
    globals.game = { i18n: { localize: (k: string) => k, format: (k: string) => k } };
    globals.ui = { notifications: { info: vi.fn() } };
  });
  afterEach(() => {
    for (const key of ["Hooks", "game", "ui"]) delete globals[key];
  });

  it("takes shots off the mode and the magazine it shares, never below 0", async () => {
    const item = rifle(20);
    expect(await spendModeShots(item, 0, 5, { reason: "barrage" })).toBe(15);
    expect(item.system.rangedModes.map((m: any) => m.loaded)).toEqual([15, 15]);
    expect(await spendModeShots(item, 1, 99)).toBe(0);
    expect((globals.ui as any).notifications.info).toHaveBeenCalled();
  });

  it("tells gworld.afterShots, as kind module with the reason", async () => {
    await spendModeShots(rifle(20), 0, 3, { reason: "barrage" });
    expect(heard).toHaveLength(1);
    expect(heard[0].event).toBe("gworld.afterShots");
    expect(heard[0].context).toMatchObject({ kind: "module", reason: "barrage", shots: 3, fired: 3, modeIndex: 0, targets: 0 });
  });

  it("keeps the count under Infinite Ammunition", async () => {
    const item = rifle(20, { infinite: true });
    expect(await spendModeShots(item, 0, 5)).toBe(20);
    expect(item.update).not.toHaveBeenCalled();
  });

  it("spends nothing for no shots, and refuses a mode with no count or an item the user doesn't own", async () => {
    const item = rifle(20);
    expect(await spendModeShots(item, 0, 0)).toBe(20);
    expect(heard).toHaveLength(0);
    expect(await spendModeShots(item, 3, 5)).toBeNull();
    expect(await spendModeShots({ ...item, isOwner: false }, 0, 5)).toBeNull();
  });
});

describe("a physician's TL on a crippled part (Campaigns p. 422)", () => {
  afterEach(() => {
    for (const key of ["foundry", "game", "Roll"]) delete globals[key];
  });

  function foundryAt(worldTime: number, die = 5) {
    let n = 0;
    globals.foundry = { utils: { randomID: () => `id${++n}` } };
    globals.game = { time: { worldTime } };
    globals.Roll = class {
      total = 0;
      async evaluate() { this.total = die; return this; }
    };
  }

  function character() {
    const flags: Record<string, unknown> = {};
    return {
      isOwner: true,
      system: { hp: { value: 5, max: 10 } },
      getFlag: (_scope: string, key: string) => flags[key],
      setFlag: async (_scope: string, key: string, value: unknown) => { flags[key] = value; },
    };
  }

  it("keeps the relief in one place", () => {
    expect([null, 4, 5, 6, 7, 10].map((tl) => cripplingRelief(tl))).toEqual([0, 0, 1, 2, 3, 3]);
    expect(cripplingMonths({ roll: 5, treatedAtTl: 7 })).toBe(2);
  });

  it("shortens a lasting crippling a physician takes over, from when it began", async () => {
    foundryAt(1000, 5);
    const actor = character();
    const part = await cripple(actor, "arm", { duration: "lasting" });
    expect(part).toMatchObject({ months: 5, roll: 5 });
    const treated = await treatCrippled(actor, "arm", { treatedAtTl: 6 });
    expect(treated).toMatchObject({ months: 3, treatedAtTl: 6, healsAt: 1000 + 3 * SECONDS_PER_MONTH });
    // A better physician replaces the first; none takes the relief off again.
    expect((await treatCrippled(actor, part!.id, { treatedAtTl: 8 }))?.months).toBe(2);
    expect((await treatCrippled(actor, "arm", { treatedAtTl: null }))?.months).toBe(5);
    expect(crippledParts(actor)[0]).not.toHaveProperty("treatedAtTl");
  });

  it("reads the die back from the months where it wasn't kept, never under a month", () => {
    expect(treatedMonths({ months: 2, treatedAtTl: 7 }, null)).toBe(5);
    expect(treatedMonths({ months: 1 }, 7)).toBe(1);
    expect(treatedMonths({ months: null }, 7)).toBeNull();
  });

  it("keeps the TL on an undecided part for when it is settled", async () => {
    foundryAt(0, 6);
    const actor = character();
    await cripple(actor, "leg");
    expect(await treatCrippled(actor, "leg", { treatedAtTl: 7 })).toMatchObject({ duration: "undecided", treatedAtTl: 7, months: null });
    expect(await settleCrippling(actor, "leg", { duration: "lasting" })).toMatchObject({ months: 3, treatedAtTl: 7 });
  });

  it("refuses a part that isn't there, or an actor the user can't change", async () => {
    foundryAt(0);
    const actor = character();
    expect(await treatCrippled(actor, "arm", { treatedAtTl: 7 })).toBeNull();
    await cripple(actor, "arm", { duration: "lasting" });
    expect(await treatCrippled({ ...actor, isOwner: false }, "arm", { treatedAtTl: 7 })).toBeNull();
  });
});
