import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../optional-rules.js", () => ({ isRuleOn: () => true }));
vi.mock("../targets.js", () => ({
  targetedTokens: () => [{ actor: foe }],
  withTargets: (_tokens: unknown[], run: () => Promise<unknown>) => run(),
}));
vi.mock("../roll.js", () => ({
  rollSuccess: vi.fn(async () => ({ success: true, criticalFailure: false })),
  rollDamage: vi.fn(async () => 5),
  damageDistance: () => 1,
}));

import { rollDamage } from "../roll.js";
import { slamOrShove } from "../slam.js";

const globals = globalThis as Record<string, unknown>;
const foe = { name: "Foe", system: { hp: { max: 10 } }, items: [] };
const slammer = {
  name: "Slammer",
  isOwner: true,
  update: vi.fn(async () => {}),
  items: [{ type: "skill", name: "Brawling", system: { derived: { level: 12 } } }],
  system: { hp: { max: 12 }, derived: { thrust: "1d-1", encumbrance: { move: 5 } } },
};

let chosen: Record<string, unknown> = {};
const created: any[] = [];
const hooked: Array<[string, any]> = [];

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  created.length = 0;
  hooked.length = 0;
  globals.game = { i18n: { localize: (k: string) => k, format: (k: string) => k }, settings: { get: () => ({}) } };
  globals.ui = { notifications: { warn: vi.fn() } };
  globals.CONST = { CHAT_MESSAGE_STYLES: { OTHER: 0 } };
  globals.foundry = {
    utils: { escapeHTML: (t: string) => t },
    applications: { api: { DialogV2: { prompt: async () => chosen } } },
  };
  globals.ChatMessage = { implementation: { getSpeaker: () => ({}), create: vi.fn(async (data: unknown) => created.push(data)) } };
  globals.Roll = class {
    total = 0;
    constructor(public formula: string) {}
    async evaluate() { this.total = 3; return this; }
  };
  globals.Hooks = { callAll: (event: string, context: any) => { hooked.push([event, context]); } };
});

afterEach(() => {
  for (const key of ["game", "ui", "CONST", "foundry", "ChatMessage", "Roll", "Hooks"]) delete globals[key];
  vi.mocked(rollDamage).mockClear();
  vi.restoreAllMocks();
});

/** A slam's rolls say they are a slam's (sargas79/GWorldVTT#742). */
describe("slam and shove damage sources (since 1.139.0)", () => {
  it("rolls the slammer's blow as slam and what the slammer takes back as slammed", async () => {
    chosen = { choice: "slam", velocity: 5, oneHanded: false };
    await slamOrShove(slammer, "slam");
    const sources = vi.mocked(rollDamage).mock.calls.map(([options]) => [options.actor?.name, options.source]);
    expect(sources).toEqual([["Slammer", "slam"], ["Foe", "slammed"]]);
  });

  it("puts a shove's roll through gworld.damageModifiers as shove, and rolls what the listeners leave", async () => {
    chosen = { choice: "shove", velocity: 0, oneHanded: false };
    globals.Hooks = {
      callAll: (event: string, context: any) => {
        hooked.push([event, context]);
        if (event === "gworld.damageModifiers" && context.source === "shove") context.modifiers.push({ label: "Shoving pads", value: 2 });
      },
    };
    await slamOrShove(slammer, "shove");
    const damage = hooked.filter(([event]) => event === "gworld.damageModifiers").map(([, context]) => context);
    expect(damage).toHaveLength(1);
    expect(damage[0]).toMatchObject({ actor: slammer, item: null, formula: "1d-1", damageType: "cr", source: "shove" });
    // thr 1d-1 with the pads' +2 is 1d+1, which the shove rolls.
    expect(created.at(-1).rolls[0].formula).toBe("1d6 + 1");
    expect(vi.mocked(rollDamage)).not.toHaveBeenCalled();
  });
});
