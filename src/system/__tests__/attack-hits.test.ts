import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../optional-rules.js", () => ({ isRuleOn: () => false }));

import { handleDamageAction, lineDropped, nextAttackHit, recordAttackRow, rollDamage, weaponStrikeHits } from "../roll.js";

const globals = globalThis as Record<string, unknown>;
const created: any[] = [];

beforeEach(() => {
  created.length = 0;
  globals.game = { i18n: { localize: (k: string) => k, format: (k: string) => k }, settings: { get: () => ({}) }, user: { targets: new Set() } };
  globals.ui = { notifications: { warn: vi.fn(), info: vi.fn() } };
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

/** An actor whose system flags the attack and damage rolls can keep, written a moment later as Foundry does. */
function shooter() {
  const own: Record<string, unknown> = {};
  const later = () => new Promise((resolve) => setTimeout(resolve, 1));
  return {
    name: "Shooter",
    uuid: `Actor.${Math.random()}`,
    isOwner: true,
    system: {},
    items: { get: () => null },
    flags: { gworld: own },
    getFlag: (_scope: string, key: string) => own[key],
    setFlag: async (_scope: string, key: string, value: unknown) => { await later(); own[key] = structuredClone(value); },
    unsetFlag: async (_scope: string, key: string) => { await later(); delete own[key]; },
    update: async (changes: Record<string, unknown>) => {
      await later();
      for (const [path, value] of Object.entries(changes)) {
        const key = path.replace(/^flags\.gworld\./, "");
        own[key] = structuredClone(value);
      }
    },
  };
}

/** Which hit of an attack a damage roll is for (sargas79/GWorldVTT#827; since API 1.154.0). */
describe("the hits of an attack, counted off as their damage is rolled", () => {
  it("numbers each hit of a burst from 0, the first said to be first", async () => {
    const actor = shooter();
    // A burst of 5 at Rcl 2 that made its roll by 4: three hits (Campaigns p. 373).
    const hits = weaponStrikeHits({ success: true, margin: 4 }, { shotsFired: 5, recoil: 2 });
    expect(hits).toBe(3);
    await recordAttackRow(actor, "rifle||0", { hits });

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

  it("gives two quick rolls two hits, not the same one twice", async () => {
    const actor = shooter();
    await recordAttackRow(actor, "rifle||0", { hits: 2 });
    const both = await Promise.all([nextAttackHit(actor, "rifle||0"), nextAttackHit(actor, "rifle||0")]);
    expect(both.map((h) => h?.index)).toEqual([0, 1]);
  });

  it("lets a second line go with the hit rolled last, without counting another", async () => {
    const actor = shooter();
    await recordAttackRow(actor, "rifle||0", { hits: 2 });
    expect(await nextAttackHit(actor, "rifle||0", true)).toEqual({ index: 0, hits: 2 });
    expect(await nextAttackHit(actor, "rifle||0")).toEqual({ index: 0, hits: 2 });
    expect(await nextAttackHit(actor, "rifle||0", true)).toEqual({ index: 0, hits: 2 });
    expect(await nextAttackHit(actor, "rifle||0")).toEqual({ index: 1, hits: 2 });
  });

  it("keeps each row's count: one hand's attack of a Dual-Weapon Attack leaves the other's alone", async () => {
    const actor = shooter();
    await recordAttackRow(actor, "pistol||0", { hits: 2, dropped: { followUp: true, linked: false } });
    await nextAttackHit(actor, "pistol||0");
    await recordAttackRow(actor, "knife||0", { hits: 1 });
    expect(await nextAttackHit(actor, "knife||0")).toEqual({ index: 0, hits: 1 });
    expect(await nextAttackHit(actor, "pistol||0")).toEqual({ index: 1, hits: 2 });
    expect(lineDropped(actor, "pistol||0", "followUp")).toBe(true);
    expect(lineDropped(actor, "knife||0", "followUp")).toBe(false);
    // The row's next attack starts it again.
    await recordAttackRow(actor, "pistol||0", { hits: 1 });
    expect(await nextAttackHit(actor, "pistol||0")).toEqual({ index: 0, hits: 1 });
    expect(lineDropped(actor, "pistol||0", "followUp")).toBe(false);
  });

  it("adds up the hits of every target of a Spraying Fire burst", async () => {
    const actor = shooter();
    await recordAttackRow(actor, "smg||0", { hits: 2, add: false });
    await recordAttackRow(actor, "smg||0", { hits: 0, add: true, dropped: { followUp: false, linked: true } });
    await recordAttackRow(actor, "smg||0", { hits: 3, add: true });
    expect(await nextAttackHit(actor, "smg||0")).toEqual({ index: 0, hits: 5 });
    expect(lineDropped(actor, "smg||0", "linked")).toBe(true);
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
    // Refused is null, which a rolled 0 never is.
    expect(await rollDamage({ actor, label: "Rocket (follow-up)", formula: "6d", damageType: "cr", line: "followUp", distanceYards: null })).toBeNull();
    expect(await rollDamage({ actor, label: "Rocket (linked)", formula: "1d", damageType: "burn", line: "linked", distanceYards: null })).toBe(4);
    expect(seen).toEqual([null, "followUp", "linked"]);
    expect(created).toHaveLength(2);
    expect(created[1].flags.gworld.damage.line).toBe("linked");
    expect((globals.ui as any).notifications.warn).toHaveBeenCalledWith("The charge failed to go off.");
  });

  it("gives back what the attack left when a listener refuses the roll from the sheet", async () => {
    const actor = shooter();
    await recordAttackRow(actor, "rifle||0", { hits: 2 });
    Object.assign(actor.flags.gworld, { calledShot: { hitLocation: "skull", chink: false }, halfDamage: true, shotRange: { yards: 40, row: "rifle||0" } });
    const before = structuredClone(actor.flags.gworld);
    let refuse = true;
    const seen: any[] = [];
    globals.Hooks = {
      callAll: (event: string, context: any) => {
        if (event !== "gworld.damageModifiers") return;
        seen.push({ hit: context.hit, distance: context.distanceYards });
        if (refuse) context.refusal = "Not this time.";
      },
    };
    const row = { dataset: { itemId: "rifle", modeIndex: "0", ranged: "1" } };
    const button = { dataset: { damageFormula: "5d", damageType: "pi", damageLabel: "Rifle" }, closest: () => row };
    await handleDamageAction(actor, { shiftKey: false } as unknown as Event, button as unknown as HTMLElement);
    expect(created).toHaveLength(0);
    expect(actor.flags.gworld).toEqual(before);
    // Rolled this time, it spends them: the first hit, at the range recorded, on the skull.
    refuse = false;
    await handleDamageAction(actor, { shiftKey: false } as unknown as Event, button as unknown as HTMLElement);
    expect(seen.map((s) => s.hit)).toEqual([{ index: 0, first: true, hits: 2 }, { index: 0, first: true, hits: 2 }]);
    expect(created[0].flags.gworld.damage).toMatchObject({ hitLocation: "skull", hit: { index: 0, hits: 2 } });
    expect(actor.flags.gworld.calledShot).toBeUndefined();
    expect(actor.flags.gworld.halfDamage).toBeUndefined();
  });
});
