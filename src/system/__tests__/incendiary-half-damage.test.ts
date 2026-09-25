import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../optional-rules.js", () => ({ isRuleOn: () => false }));

import { applyDamageToActor, type IncomingDamage } from "../damage.js";
import { rollDamage } from "../roll.js";

/**
 * Incendiary once the DR is known, and a roll's own 1/2D
 * (sargas79/GWorldVTT#850; API 1.156.0).
 */

const globals = globalThis as Record<string, unknown>;

afterEach(() => {
  for (const key of ["game", "ui", "CONST", "foundry", "ChatMessage", "Roll", "Hooks", "fromUuidSync"]) delete globals[key];
  vi.restoreAllMocks();
});

/** A character in armour of this DR over the whole body. */
function character(dr: number) {
  const actor = {
    name: "Target",
    isOwner: true,
    statuses: new Set<string>(),
    items: dr > 0 ? [{ id: "plate", type: "armor", name: "Plate", system: { equipped: true, dr, locations: [], drLost: 0 } }] : [],
    system: { hp: { value: 20, max: 20 }, fp: { value: 10, max: 10 }, aim: { turns: 0 }, derived: { status: "ok" } },
    flags: {} as Record<string, unknown>,
    getFlag: (_scope: string, key: string) => actor.flags[key],
    setFlag: async (_scope: string, key: string, value: unknown) => { actor.flags[key] = value; },
    update: async (changes: Record<string, number>) => {
      for (const [path, value] of Object.entries(changes)) if (path === "system.hp.value") actor.system.hp.value = value;
    },
    toggleStatusEffect: async () => {},
  };
  return actor;
}

const blow = (basicDamage: number, extra: Partial<IncomingDamage> = {}): IncomingDamage =>
  ({ basicDamage, type: "pi", armorDivisor: 1, hitLocation: "torso", ...extra }) as IncomingDamage;

/** Listens to one hook. */
function listen(hook: string, fn: (context: any) => void) {
  globals.Hooks = { callAll: (event: string, context: any) => { if (event === hook) fn(context); } };
}

describe("an incendiary blow decided once its DR is known (since API 1.156.0)", () => {
  beforeEach(() => {
    globals.game = { i18n: { localize: (k: string) => k, format: (k: string) => k }, settings: { get: () => ({}) } };
  });

  it("carries the card's incendiary through to the result, and none where the card had none", async () => {
    expect((await applyDamageToActor(character(0), blow(5, { incendiary: true })))?.incendiary).toBe(true);
    expect((await applyDamageToActor(character(0), blow(5)))?.incendiary).toBe(false);
  });

  it("lets a gworld.afterDamage listener make it incendiary where it got through DR 10 or more", async () => {
    const seen: Array<{ dr: number; penetrating: number }> = [];
    listen("gworld.afterDamage", (context) => {
      seen.push({ dr: context.result.effectiveDr, penetrating: context.result.penetrating });
      if (context.result.effectiveDr >= 10 && context.result.penetrating > 0) context.damage.incendiary = true;
    });
    expect((await applyDamageToActor(character(12), blow(15)))?.incendiary).toBe(true);
    // Stopped by the armour, and through light armour: no flame.
    expect((await applyDamageToActor(character(12), blow(8)))?.incendiary).toBe(false);
    expect((await applyDamageToActor(character(2), blow(15)))?.incendiary).toBe(false);
    expect(seen).toEqual([{ dr: 12, penetrating: 3 }, { dr: 12, penetrating: 0 }, { dr: 2, penetrating: 13 }]);
  });

  it("lets a gworld.afterDamage listener take the flame off", async () => {
    listen("gworld.afterDamage", (context) => { context.damage.incendiary = false; });
    expect((await applyDamageToActor(character(0), blow(5, { incendiary: true })))?.incendiary).toBe(false);
  });

  it("lets a gworld.injury listener set it before the blow is worked out", async () => {
    listen("gworld.injury", (context) => { context.damage.incendiary = true; });
    expect((await applyDamageToActor(character(0), blow(5)))?.incendiary).toBe(true);
  });
});

describe("gworld.damageModifiers halfDamage (since API 1.156.0)", () => {
  const created: any[] = [];

  beforeEach(() => {
    created.length = 0;
    globals.game = { i18n: { localize: (k: string) => k, format: (k: string) => k }, settings: { get: () => ({}) }, user: { targets: new Set() } };
    globals.ui = { notifications: { warn: vi.fn() } };
    globals.CONST = { CHAT_MESSAGE_STYLES: { OTHER: 0 } };
    globals.foundry = { applications: { handlebars: { renderTemplate: async () => "" } } };
    globals.ChatMessage = { implementation: { getSpeaker: () => ({}), create: vi.fn(async (data: unknown) => created.push(data)) } };
    globals.Roll = class {
      total = 8;
      constructor(public formula: string) {}
      async evaluate() { return this; }
    };
  });

  const basic = (index: number) => created[index].flags.gworld.damage.basicDamage;

  it("hands the listener the attack's 1/2D, and halves the roll as it leaves it", async () => {
    const seen: unknown[] = [];
    listen("gworld.damageModifiers", (context) => {
      seen.push(context.halfDamage);
      // The first hit has a range of its own: inside its 1/2D, it is whole.
      if (context.label === "First") context.halfDamage = false;
      // And another is past its own 1/2D where the row's isn't.
      if (context.label === "Short") context.halfDamage = true;
    });
    const actor = { name: "Shooter" };
    await rollDamage({ actor, label: "First", formula: "2d", damageType: "pi", halfDamage: true, distanceYards: null });
    await rollDamage({ actor, label: "Rest", formula: "2d", damageType: "pi", halfDamage: true, distanceYards: null });
    await rollDamage({ actor, label: "Short", formula: "2d", damageType: "pi", distanceYards: null });
    expect(seen).toEqual([true, true, false]);
    expect([basic(0), basic(1), basic(2)]).toEqual([8, 4, 4]);
  });

  it("keeps the attack's 1/2D where a listener sets something other than true or false", async () => {
    listen("gworld.damageModifiers", (context) => { context.halfDamage = "no"; });
    await rollDamage({ actor: { name: "Shooter" }, label: "Far", formula: "2d", damageType: "pi", halfDamage: true, distanceYards: null });
    expect(basic(0)).toBe(4);
  });
});
