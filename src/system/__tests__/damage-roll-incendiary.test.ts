import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../optional-rules.js", () => ({ isRuleOn: () => false }));

import { rollDamage } from "../roll.js";

const globals = globalThis as Record<string, unknown>;
const created: any[] = [];

beforeEach(() => {
  created.length = 0;
  globals.game = { i18n: { localize: (k: string) => k, format: (k: string) => k }, settings: { get: () => ({}) }, user: { targets: new Set() } };
  globals.ui = { notifications: { warn: vi.fn() } };
  globals.CONST = { CHAT_MESSAGE_STYLES: { OTHER: 0 } };
  globals.foundry = { applications: { handlebars: { renderTemplate: async () => "" } } };
  globals.ChatMessage = { implementation: { getSpeaker: () => ({}), create: vi.fn(async (data: unknown) => created.push(data)) } };
  globals.Roll = class {
    total = 4;
    constructor(public formula: string) {}
    async evaluate() { return this; }
  };
});

afterEach(() => {
  for (const key of ["game", "ui", "CONST", "foundry", "ChatMessage", "Roll", "Hooks"]) delete globals[key];
  vi.restoreAllMocks();
});

const flag = (index: number) => created[index].flags.gworld.damage.incendiary;

/** A listener can make one blow incendiary, and leave another as it was (sargas79/GWorldVTT#819). */
describe("gworld.damageModifiers incendiary (since API 1.152.0)", () => {
  it("makes the blow a listener marks incendiary, and only that one", async () => {
    const seen: unknown[] = [];
    globals.Hooks = {
      callAll: (event: string, context: any) => {
        if (event !== "gworld.damageModifiers") return;
        seen.push(context.incendiary);
        // A round that burns only out to 10 yards.
        if (context.distanceYards !== null && context.distanceYards <= 10) context.incendiary = true;
      },
    };
    const actor = { name: "Shooter" };
    await rollDamage({ actor, label: "Close", formula: "2d", damageType: "pi", distanceYards: 5 });
    await rollDamage({ actor, label: "Far", formula: "2d", damageType: "pi", distanceYards: 50 });
    expect(seen).toEqual([false, false]);
    expect(flag(0)).toBe(true);
    expect(flag(1)).toBeUndefined();
  });

  it("hands the listener the mode's own flag, which it may take off", async () => {
    const seen: unknown[] = [];
    globals.Hooks = {
      callAll: (event: string, context: any) => {
        if (event !== "gworld.damageModifiers") return;
        seen.push(context.incendiary);
        if (context.label === "Doused") context.incendiary = false;
      },
    };
    const actor = { name: "Shooter" };
    await rollDamage({ actor, label: "Flare", formula: "1d", damageType: "burn", incendiary: true, distanceYards: null });
    await rollDamage({ actor, label: "Doused", formula: "1d", damageType: "burn", incendiary: true, distanceYards: null });
    expect(seen).toEqual([true, true]);
    expect(flag(0)).toBe(true);
    expect(flag(1)).toBeUndefined();
  });

  it("keeps the mode's flag where a listener sets something other than true or false", async () => {
    globals.Hooks = {
      callAll: (event: string, context: any) => {
        if (event === "gworld.damageModifiers") context.incendiary = "yes";
      },
    };
    const actor = { name: "Shooter" };
    await rollDamage({ actor, label: "Flare", formula: "1d", damageType: "burn", incendiary: true, distanceYards: null });
    await rollDamage({ actor, label: "Bullet", formula: "1d", damageType: "pi", distanceYards: null });
    expect(flag(0)).toBe(true);
    expect(flag(1)).toBeUndefined();
  });
});
