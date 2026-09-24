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

/** A damage roll's source reaches the modules' damage lines (sargas79/GWorldVTT#742). */
describe("gworld.damageModifiers source (since 1.139.0)", () => {
  it("hands the listeners the roll's source, or null, and keeps it on the card", async () => {
    const seen: unknown[] = [];
    globals.Hooks = {
      callAll: (event: string, context: any) => {
        if (event !== "gworld.damageModifiers") return;
        seen.push(context.source);
        if (context.source === "slam") context.modifiers.push({ label: "Spiked pauldrons", value: 1 });
      },
    };
    const actor = { name: "Slammer" };
    await rollDamage({ actor, label: "Slam", formula: "1d", damageType: "cr", source: "slam", distanceYards: null });
    await rollDamage({ actor, label: "Punch", formula: "1d", damageType: "cr", distanceYards: null });
    expect(seen).toEqual(["slam", null]);
    expect(created[0].rolls[0].formula).toBe("1d6 + 1");
    expect(created[0].flags.gworld.damage.source).toBe("slam");
    expect(created[1].rolls[0].formula).toBe("1d6");
    expect(created[1].flags.gworld.damage.source).toBeUndefined();
  });
});
