import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { costsFatigueCost } from "../../rules/addendum-modifiers.js";
import { rangedModifiers, weaponFromDataset } from "../roll.js";
import { abilityCostOf, payAbilityCost } from "../ability-cost.js";
import { spendFatigue } from "../extra-effort.js";
import { adjustReserve, rechargeForRest } from "../reserves.js";
import { restForFatigue } from "../recovery.js";
import { heroicPenalty, pendingQuickReady, consumeQuickReady, QUICK_READY_FLAG } from "../heroic-archer.js";
import { SYSTEM_ID } from "../constants.js";

const globals = globalThis as Record<string, unknown>;

beforeEach(() => {
  globals.game = {
    i18n: { localize: (key: string) => key, format: (key: string) => key },
    settings: { get: () => ({}) },
    user: { isGM: false },
  };
  globals.ui = { notifications: { warn: vi.fn(), info: vi.fn() } };
  globals.ChatMessage = { implementation: { create: vi.fn(async (d: any) => d), getSpeaker: () => ({}) } };
  globals.CONST = { CHAT_MESSAGE_STYLES: { OTHER: 0 } };
  globals.foundry = {
    utils: { escapeHTML: (s: string) => s },
    applications: { handlebars: { renderTemplate: async () => "" } },
  };
});

afterEach(() => {
  for (const key of ["game", "ui", "ChatMessage", "CONST", "foundry"]) delete globals[key];
});

const shot = (over: Partial<Parameters<typeof rangedModifiers>[0]> = {}) => ({
  range: 0, speed: 0, size: 0, modifier: 0, shots: 1, situation: "normal" as const, aimed: false, ...over,
});
const bow = { accuracy: 2, scopeBonus: 0, bulk: -6, heroicArcher: { heroic: true as const } };
const heroicLine = (mods: ReturnType<typeof rangedModifiers>, what: string) =>
  mods.find((m) => m.key === "heroicArcher" && m.heroicArcher === what);

describe("Heroic Archer's quick ready and stunt penalties on the shot", () => {
  it("carries a quick ready's penalty on the attack", () => {
    const mods = rangedModifiers(shot(), { ...bow, quickReady: -3 });
    expect(heroicLine(mods, "quickReady")?.value).toBe(-3);
    const master = rangedModifiers(shot(), { ...bow, quickReady: -1 });
    expect(heroicLine(master, "quickReady")?.value).toBe(-1);
  });

  it("adds nothing without a quick ready, and nothing for anyone but a Heroic Archer", () => {
    expect(heroicLine(rangedModifiers(shot(), bow), "quickReady")).toBeUndefined();
    const plain = { accuracy: 2, scopeBonus: 0, bulk: -6, quickReady: -3 };
    expect(rangedModifiers(shot({ stunt: -6 }), plain).some((m) => m.key === "heroicArcher")).toBe(false);
  });

  it("halves a stunt shot's penalty in the archer's favour", () => {
    expect(heroicLine(rangedModifiers(shot({ stunt: -6 }), bow), "stunt")?.value).toBe(-3);
    expect(heroicLine(rangedModifiers(shot({ stunt: -5 }), bow), "stunt")?.value).toBe(-2);
    expect(heroicLine(rangedModifiers(shot({ stunt: -1 }), bow), "stunt")).toMatchObject({ value: 0 });
    expect(heroicLine(rangedModifiers(shot({ stunt: 0 }), bow), "stunt")).toBeUndefined();
  });

  it("reads a held quick ready off the actor's flag, only with the switch on", () => {
    const actor = {
      system: { derived: { traitEffects: { heroicArcher: true } } },
      getFlag: (scope: string, key: string) => (scope === SYSTEM_ID && key === QUICK_READY_FLAG ? -3 : undefined),
    };
    const withRule = (on: boolean) => {
      globals.game = { ...(globals.game as object), settings: { get: () => ({ heroicArcher: on }) } };
    };
    withRule(true);
    expect(weaponFromDataset(actor, { rollSkill: "Bow" }).quickReady).toBe(-3);
    expect(weaponFromDataset(actor, { rollSkill: "Bow" }).heroicArcher).toEqual({ heroic: true });
    withRule(false);
    expect(weaponFromDataset(actor, { rollSkill: "Bow" }).quickReady).toBe(0);
  });
});

describe("the halved penalty of a Fast-Draw (Arrow) or stunt", () => {
  it("leaves another character's penalty alone", () => {
    expect(heroicPenalty({ system: { derived: { traitEffects: {} } } }, -4)).toBe(-4);
    expect(heroicPenalty({ system: { derived: { traitEffects: {} } } }, 3)).toBe(0);
  });
});

describe("a held quick ready", () => {
  it("is spent by the attack that follows", async () => {
    let held: number | undefined = -3;
    const actor = {
      isOwner: true,
      getFlag: () => held,
      unsetFlag: vi.fn(async () => { held = undefined; }),
    };
    expect(pendingQuickReady(actor)).toBe(-3);
    await consumeQuickReady(actor);
    expect(actor.unsetFlag).toHaveBeenCalledWith(SYSTEM_ID, QUICK_READY_FLAG);
    expect(pendingQuickReady(actor)).toBe(0);
  });
});

describe("Costs Fatigue read back from the trait", () => {
  it("is -5% per FP, doubled per second", () => {
    expect(costsFatigueCost([{ name: "Costs Fatigue", value: -15 }])).toEqual({ fp: 3, perSecond: false });
    expect(costsFatigueCost([{ name: "Costs Fatigue (per second)", value: -20 }])).toEqual({ fp: 2, perSecond: true });
    expect(costsFatigueCost([{ name: "Costs Hit Points", value: -10 }])).toEqual({ fp: 0, perSecond: false });
  });
});

/** A character with a Magical Energy Reserve of `max`, `spent` of it used. */
function character(options: { fp?: number; er?: number; spent?: number; interval?: number | null; abilities?: unknown[] } = {}) {
  const er = options.er ?? 6;
  const actor: any = {
    name: "Mage",
    isOwner: true,
    system: {
      hp: { value: 10, max: 10 },
      fp: { value: options.fp ?? 10, max: 10 },
      session: { reserves: options.spent ? { magical: { spent: options.spent, carry: 0 } } : {} },
      derived: {
        traitEffects: {},
        abilityRolls: options.abilities ?? [],
        reserves: [],
      },
    },
    items: [],
    statuses: new Set<string>(),
    effects: [],
    toggleStatusEffect: async () => undefined,
    update: async function (this: any, data: Record<string, unknown>) {
      if (typeof data["system.fp.value"] === "number") this.system.fp.value = data["system.fp.value"];
      if (typeof data["system.hp.value"] === "number") this.system.hp.value = data["system.hp.value"];
      if (data["system.session.reserves"]) {
        this.system.session.reserves = data["system.session.reserves"];
        this.refresh();
      }
    },
    refresh() {
      const spent = this.system.session.reserves?.magical?.spent ?? 0;
      this.system.derived.reserves = er > 0
        ? [{ key: "magical", origin: "Magical", max: er, value: er - spent, interval: options.interval === undefined ? 600 : options.interval }]
        : [];
    },
  };
  actor.refresh();
  return actor;
}

describe("extra effort with a power of an origin", () => {
  it("draws from the matching reserve before FP", async () => {
    const actor = character({ fp: 10, er: 6 });
    expect(await spendFatigue(actor, 2, "Extra effort with a power", "magical")).toBe(true);
    expect(actor.system.session.reserves.magical.spent).toBe(2);
    expect(actor.system.fp.value).toBe(10);
  });

  it("splits a cost the reserve cannot cover, and counts the reserve toward what can be afforded", async () => {
    const actor = character({ fp: 1, er: 2 });
    expect(await spendFatigue(actor, 3, "Extra effort with a power", "magical")).toBe(true);
    expect(actor.system.session.reserves.magical.spent).toBe(2);
    expect(actor.system.fp.value).toBe(0);
  });

  it("refuses when reserve and FP together fall short", async () => {
    const actor = character({ fp: 1, er: 1 });
    expect(await spendFatigue(actor, 3, "Extra effort with a power", "magical")).toBe(false);
    expect(actor.system.fp.value).toBe(1);
  });

  it("uses no reserve for ordinary extra effort or another origin", async () => {
    const actor = character({ fp: 10, er: 6 });
    await spendFatigue(actor, 1, "Extra effort");
    expect(actor.system.fp.value).toBe(9);
    await spendFatigue(actor, 1, "Extra effort with a power", "psionic");
    expect(actor.system.fp.value).toBe(8);
    expect(actor.system.session.reserves.magical).toBeUndefined();
  });
});

describe("paying a Costs Fatigue ability", () => {
  const ability = { id: "a1", fpCost: 3, hpCost: 0, origin: "Magical" };

  it("finds the cost on the derived list", () => {
    const actor = character({ abilities: [ability] });
    expect(abilityCostOf(actor, "a1")).toEqual({ fp: 3, hp: 0, origin: "Magical" });
    expect(abilityCostOf(actor, "other")).toBeNull();
  });

  it("charges the reserve of the trait's origin first", async () => {
    const actor = character({ fp: 10, er: 2, abilities: [ability] });
    const paid = await payAbilityCost(actor, { id: "a1", name: "Fireball Gift" });
    expect(paid).toEqual({ fp: 1, reserve: 2, hp: 0 });
    expect(actor.system.fp.value).toBe(9);
    expect(actor.system.session.reserves.magical.spent).toBe(2);
  });

  it("charges FP alone for a trait with no origin", async () => {
    const actor = character({ fp: 10, er: 6, abilities: [{ ...ability, origin: "" }] });
    const paid = await payAbilityCost(actor, { id: "a1", name: "Plain Gift" });
    expect(paid).toEqual({ fp: 3, reserve: 0, hp: 0 });
    expect(actor.system.fp.value).toBe(7);
  });

  it("does nothing for a trait that costs nothing", async () => {
    const actor = character({ abilities: [] });
    expect(await payAbilityCost(actor, { id: "a1", name: "Free" })).toBeNull();
  });
});

describe("resting recharges the reserve", () => {
  it("gives a point every ten minutes of rest, beside the FP", async () => {
    const actor = character({ fp: 5, er: 6, spent: 4 });
    const cards: any[] = [];
    (globals.foundry as any).applications.handlebars.renderTemplate = async (_p: string, data: any) => { cards.push(data); return ""; };
    await restForFatigue({ actor, minutes: 30, meal: false });
    expect(actor.system.session.reserves.magical.spent).toBe(1);
    expect(cards[0].reserves).toEqual([{ origin: "Magical", gained: 3, value: 5, max: 6 }]);
  });

  it("leaves a reserve only energy theft refills as it was", async () => {
    const actor = character({ er: 6, spent: 4, interval: null });
    expect(await rechargeForRest(actor, 3600)).toEqual([]);
    expect(actor.system.session.reserves.magical.spent).toBe(4);
  });

  it("recharges nothing for someone with no reserve", async () => {
    const actor = character({ er: 0 });
    expect(await rechargeForRest(actor, 3600)).toEqual([]);
  });
});

describe("the sheet's edit of a reserve", () => {
  it("spends, gives back and refills within the reserve's size", async () => {
    const actor = character({ er: 4, spent: 1 });
    expect(await adjustReserve(actor, "magical", -2)).toBe(2);
    expect(actor.system.session.reserves.magical.spent).toBe(3);
    expect(await adjustReserve(actor, "magical", 1)).toBe(1);
    expect(actor.system.session.reserves.magical.spent).toBe(2);
    expect(await adjustReserve(actor, "magical", "full")).toBe(2);
    expect(actor.system.session.reserves.magical.spent).toBe(0);
  });

  it("cannot spend more than is left, or refill one that is full", async () => {
    const actor = character({ er: 2, spent: 1 });
    expect(await adjustReserve(actor, "magical", -5)).toBe(1);
    expect(await adjustReserve(actor, "magical", 5)).toBe(2);
    expect(await adjustReserve(actor, "magical", 1)).toBe(0);
    expect(await adjustReserve(actor, "psionic", -1)).toBe(0);
  });
});
