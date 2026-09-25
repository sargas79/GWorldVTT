import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../optional-rules.js", () => ({ isRuleOn: () => false }));

import { lineDropped, nextAttackHit, recordAttackHits, recordDroppedLines, rollDamage, weaponStrikeHits } from "../roll.js";

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

/** An actor whose flags the attack and damage rolls can keep. */
function shooter() {
  const flags: Record<string, unknown> = {};
  return {
    name: "Shooter",
    isOwner: true,
    flags,
    getFlag: (_scope: string, key: string) => flags[key],
    setFlag: async (_scope: string, key: string, value: unknown) => { flags[key] = value; },
    unsetFlag: async (_scope: string, key: string) => { delete flags[key]; },
  };
}

/** Which hit of an attack a damage roll is for (sargas79/GWorldVTT#827; since API 1.154.0). */
describe("the hits of an attack, counted off as their damage is rolled", () => {
  it("numbers each hit of a burst from 0, the first said to be first", async () => {
    const actor = shooter();
    // A burst of 5 at Rcl 2 that made its roll by 4: three hits (Campaigns p. 373).
    const hits = weaponStrikeHits({ success: true, margin: 4 }, { shotsFired: 5, recoil: 2 });
    expect(hits).toBe(3);
    await recordAttackHits(actor, "rifle||0", hits);

    const seen: unknown[] = [];
    globals.Hooks = { callAll: (event: string, context: any) => { if (event === "gworld.damageModifiers") seen.push(context.hit); } };
    for (let i = 0; i < 3; i++) {
      const hit = await nextAttackHit(actor, "rifle||0");
      await rollDamage({ actor, label: `Bullet ${i + 1}`, formula: "2d", damageType: "pi", distanceYards: null, ...(hit ? { hit } : {}) });
    }
    expect(seen).toEqual([
      { index: 0, first: true, hits: 3 },
      { index: 1, first: false, hits: 3 },
      { index: 2, first: false, hits: 3 },
    ]);
    // The card keeps it, for the hooks where the blow lands.
    expect(created.map((c) => c.flags.gworld.damage.hit)).toEqual([
      { index: 0, hits: 3 }, { index: 1, hits: 3 }, { index: 2, hits: 3 },
    ]);
  });

  it("lets a second line go with the hit rolled last, without counting another", async () => {
    const actor = shooter();
    await recordAttackHits(actor, "rifle||0", 2);
    expect(await nextAttackHit(actor, "rifle||0", true)).toEqual({ index: 0, hits: 2 });
    expect(await nextAttackHit(actor, "rifle||0")).toEqual({ index: 0, hits: 2 });
    expect(await nextAttackHit(actor, "rifle||0", true)).toEqual({ index: 0, hits: 2 });
    expect(await nextAttackHit(actor, "rifle||0")).toEqual({ index: 1, hits: 2 });
  });

  it("knows nothing of another row's attack, and starts again with the next attack", async () => {
    const actor = shooter();
    await recordAttackHits(actor, "rifle||0", 3);
    await nextAttackHit(actor, "rifle||0");
    expect(await nextAttackHit(actor, "knife||0")).toBeNull();
    await recordAttackHits(actor, "rifle||0", 1);
    expect(await nextAttackHit(actor, "rifle||0")).toEqual({ index: 0, hits: 1 });
  });

  it("tells the hook null for a roll no attack went before", async () => {
    const seen: unknown[] = [];
    globals.Hooks = { callAll: (event: string, context: any) => { if (event === "gworld.damageModifiers") seen.push(context.hit); } };
    await rollDamage({ actor: shooter(), label: "Fall", formula: "1d", damageType: "cr", distanceYards: null });
    expect(seen).toEqual([null]);
    expect(created[0].flags.gworld.damage.hit).toBeUndefined();
  });
});

/** A follow-up or linked line left unrolled for one attack (sargas79/GWorldVTT#826; since API 1.154.0). */
describe("a second line a listener drops", () => {
  it("is dropped for the row's last attack only", async () => {
    const actor = shooter();
    await recordDroppedLines(actor, "gun||0", { followUp: true, linked: false });
    expect(lineDropped(actor, "gun||0", "followUp")).toBe(true);
    expect(lineDropped(actor, "gun||0", "linked")).toBe(false);
    expect(lineDropped(actor, "gun||0", null)).toBe(false);
    expect(lineDropped(actor, "other||0", "followUp")).toBe(false);
    // The next attack, which drops nothing, clears it.
    await recordDroppedLines(actor, "gun||0", { followUp: false, linked: false });
    expect(lineDropped(actor, "gun||0", "followUp")).toBe(false);
  });

  it("isn't rolled where a damage listener refuses it, and the hook is told which line it is", async () => {
    const seen: unknown[] = [];
    globals.Hooks = {
      callAll: (event: string, context: any) => {
        if (event !== "gworld.damageModifiers") return;
        seen.push(context.line);
        if (context.line === "followUp") context.refusal = "The charge failed to go off.";
      },
    };
    const actor = shooter();
    expect(await rollDamage({ actor, label: "Rocket", formula: "6d", damageType: "cr", distanceYards: null })).toBe(4);
    expect(await rollDamage({ actor, label: "Rocket (follow-up)", formula: "6d", damageType: "cr", line: "followUp", distanceYards: null })).toBe(0);
    expect(await rollDamage({ actor, label: "Rocket (linked)", formula: "1d", damageType: "burn", line: "linked", distanceYards: null })).toBe(4);
    expect(seen).toEqual([null, "followUp", "linked"]);
    expect(created).toHaveLength(2);
    expect(created[1].flags.gworld.damage.line).toBe("linked");
    expect((globals.ui as any).notifications.warn).toHaveBeenCalledWith("The charge failed to go off.");
  });
});
