import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { recoveryKind, reserveRecoveryAids } from "../../rules/energy-reserve.js";
import { payAbilityCost } from "../ability-cost.js";
import { readReserveOrigin, recoverReserve, reserveOriginField } from "../reserves.js";
import { spendFatigue } from "../extra-effort.js";

const globals = globalThis as Record<string, unknown>;
const cards: any[] = [];

beforeEach(() => {
  cards.length = 0;
  globals.game = {
    i18n: { localize: (key: string) => key, format: (key: string, data?: any) => `${key} ${JSON.stringify(data ?? {})}` },
    settings: { get: () => ({}) },
    user: { isGM: false },
  };
  globals.ui = { notifications: { warn: vi.fn(), info: vi.fn() } };
  globals.ChatMessage = { implementation: { create: vi.fn(async (d: any) => { cards.push(d); return d; }), getSpeaker: () => ({}) } };
  globals.CONST = { CHAT_MESSAGE_STYLES: { OTHER: 0 } };
  globals.foundry = { utils: { escapeHTML: (s: string) => s } };
});

afterEach(() => {
  for (const key of ["game", "ui", "ChatMessage", "CONST", "foundry"]) delete globals[key];
});

function character(options: { er?: number; spent?: number; abilities?: unknown[]; recoveries?: unknown[] } = {}) {
  const er = options.er ?? 6;
  const actor: any = {
    name: "Mage",
    isOwner: true,
    system: {
      hp: { value: 10, max: 10 },
      fp: { value: 10, max: 10 },
      session: { reserves: options.spent ? { magical: { spent: options.spent, carry: 0 } } : {} },
      derived: { traitEffects: {}, abilityRolls: options.abilities ?? [], reserves: [], reserveRecoveries: options.recoveries ?? [] },
    },
    items: [],
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
      this.system.derived.reserves = [{ key: "magical", origin: "Magical", max: er, value: er - spent, interval: 600 }];
    },
  };
  actor.refresh();
  return actor;
}

describe("the attack dialogs' choice of reserve", () => {
  it("offers a select only to a character with a reserve", () => {
    expect(reserveOriginField(character())).toContain('name="reserveOrigin"');
    expect(reserveOriginField(character())).toContain('value="magical"');
    const none = character();
    none.system.derived.reserves = [];
    expect(reserveOriginField(none)).toBe("");
  });

  it("reads the chosen origin, and blank for FP", () => {
    const form = (value: string | null) => ({ querySelector: () => (value === null ? null : { value }) }) as any;
    expect(readReserveOrigin(form("magical"))).toBe("magical");
    expect(readReserveOrigin(form(""))).toBe("");
    expect(readReserveOrigin(form(null))).toBe("");
  });

  it("pays a dialog's extra effort from the chosen reserve, as spendFatigue does with an origin", async () => {
    const actor = character({ er: 6 });
    expect(await spendFatigue(actor, 2, "Extra effort", "magical")).toBe(true);
    expect(actor.system.fp.value).toBe(10);
    expect(actor.system.session.reserves.magical.spent).toBe(2);
  });
});

describe("Costs Fatigue per second", () => {
  const perSecond = { id: "a1", fpCost: 2, fpCostPerSecond: true, hpCost: 0, origin: "Magical" };

  it("charges the cost for each second of use, from the reserve first", async () => {
    const actor = character({ er: 5, abilities: [perSecond] });
    const paid = await payAbilityCost(actor, { id: "a1", name: "Flame Aura" }, 3);
    expect(paid).toEqual({ fp: 1, reserve: 5, hp: 0 });
    expect(actor.system.fp.value).toBe(9);
    expect(actor.system.session.reserves.magical.spent).toBe(5);
    expect(cards[0].content).toContain("UsedSeconds");
  });

  it("ignores the seconds for a cost per use", async () => {
    const actor = character({ er: 6, abilities: [{ ...perSecond, fpCostPerSecond: false }] });
    const paid = await payAbilityCost(actor, { id: "a1", name: "Zap" }, 10);
    expect(paid).toEqual({ fp: 0, reserve: 2, hp: 0 });
  });

  it("charges one second where none is given", async () => {
    const actor = character({ er: 6, abilities: [perSecond] });
    expect(await payAbilityCost(actor, { id: "a1", name: "Flame Aura" })).toEqual({ fp: 0, reserve: 2, hp: 0 });
  });
});

describe("Recover Energy and Absorption", () => {
  it("names the recovery modifiers", () => {
    expect(recoveryKind(["Magical", "Recover Energy"])).toBe("recoverEnergy");
    expect(recoveryKind(["Absorption (ER)"])).toBe("absorption");
    expect(recoveryKind(["Magical"])).toBeNull();
  });

  it("lists only traits whose origin has a reserve", () => {
    const reserves = [{ key: "magical", origin: "Magical" }];
    const aids = reserveRecoveryAids(
      [
        { id: "a", name: "Mana Drinker", modifiers: ["Recover Energy"], origin: "Magical" },
        { id: "b", name: "Chi Drinker", modifiers: ["Recover Energy"], origin: "Chi" },
        { id: "c", name: "Plain", modifiers: ["Magical"], origin: "Magical" },
        { id: "d", name: "Sponge", modifiers: ["Absorption"], origin: "magic" },
      ],
      reserves,
    );
    expect(aids.map((a) => [a.id, a.kind])).toEqual([["a", "recoverEnergy"], ["d", "absorption"]]);
  });

  it("gives points back to the reserve of the trait's origin, up to what it has spent", async () => {
    const recoveries = [{ id: "a", name: "Mana Drinker", kind: "recoverEnergy", key: "magical", origin: "Magical" }];
    const actor = character({ er: 6, spent: 4, recoveries });
    expect(await recoverReserve(actor, "a", 3)).toBe(3);
    expect(actor.system.session.reserves.magical.spent).toBe(1);
    expect(await recoverReserve(actor, "a", 9)).toBe(1);
    expect(actor.system.session.reserves.magical.spent).toBe(0);
    expect(cards).toHaveLength(2);
  });

  it("does nothing for a trait that is no recovery aid", async () => {
    const actor = character({ er: 6, spent: 4 });
    expect(await recoverReserve(actor, "zzz", 3)).toBe(0);
    expect(actor.system.session.reserves.magical.spent).toBe(4);
    expect(cards).toHaveLength(0);
  });
});
