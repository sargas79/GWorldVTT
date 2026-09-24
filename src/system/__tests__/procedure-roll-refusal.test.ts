import { afterEach, describe, expect, it, vi } from "vitest";

import { rollQuickContest, rollRegularContest } from "../contest.js";
import { rollFrightCheckOutcome } from "../fright.js";
import { rollStunRecovery } from "../knockdown.js";
import { rollBleeding } from "../bleeding.js";
import { PROCEDURE_HOOKS, procedureRoll } from "../procedure-extensions.js";
import type { PendingModifier } from "../pending-modifiers.js";

/**
 * Refusals and held bonuses on the rolls the system's own procedures make
 * with their own dice (sargas79/GWorldVTT#792).
 */

const globals = globalThis as Record<string, unknown>;

afterEach(() => {
  for (const key of ["ChatMessage", "CONST", "CONFIG", "foundry", "game", "Hooks", "Roll", "ui"]) delete globals[key];
  vi.restoreAllMocks();
});

/** A character with the given bonuses held, keeping its flags. */
function character(name: string, held: PendingModifier[] = []) {
  const flags: Record<string, unknown> = { "gworld.pendingModifiers": held };
  return {
    name,
    uuid: `Actor.${name}`,
    isOwner: true,
    system: {
      hp: { value: 5, max: 10 },
      derived: { attributes: { ST: 10, DX: 10, IQ: 10, HT: 10 }, will: 10, traitEffects: {} },
      conditions: { stunned: true },
    },
    items: [],
    statuses: new Set<string>(["stunned"]),
    effects: [],
    flags,
    getFlag: (scope: string, key: string) => flags[`${scope}.${key}`],
    setFlag: vi.fn(async (scope: string, key: string, value: unknown) => { flags[`${scope}.${key}`] = structuredClone(value); }),
    unsetFlag: vi.fn(async (scope: string, key: string) => { delete flags[`${scope}.${key}`]; }),
    update: vi.fn(async () => {}),
    toggleStatusEffect: vi.fn(async () => {}),
  };
}

function bonus(overrides: Partial<PendingModifier>): PendingModifier {
  return { id: "b1", label: "Steeled", value: 3, tags: [], skill: null, expires: null, ...overrides };
}

/** Foundry, with dice that come up as given, the success-roll contexts heard, and every card and roll kept. */
function foundryWith(faces: number[], listener: (context: any) => void = () => {}) {
  const cards: Array<{ data: any; options: any }> = [];
  const contexts: any[] = [];
  const rolled: any[] = [];
  globals.ChatMessage = { implementation: { create: async (data: any, options: any) => { cards.push({ data, options }); return data; }, getSpeaker: () => ({}) } };
  globals.CONST = { CHAT_MESSAGE_STYLES: { OTHER: 0 } };
  globals.CONFIG = { ChatMessage: { modes: { public: {}, gm: {}, blind: {}, self: {} } } };
  globals.foundry = {
    utils: { escapeHTML: (s: string) => s, deepClone: (o: any) => structuredClone(o), mergeObject: (a: any, b: any) => ({ ...a, ...b }) },
    applications: { handlebars: { renderTemplate: async (_path: string, data: any) => JSON.stringify(data) } },
  };
  globals.game = {
    i18n: { localize: (k: string) => k, format: (k: string, d: any) => `${k}:${JSON.stringify(d)}` },
    settings: { get: () => ({}) },
    user: { id: "gm" },
    time: { worldTime: 0 },
  };
  globals.ui = { notifications: { warn: vi.fn(), info: vi.fn() } };
  const listen = (event: string, context: any) => {
    if (event === PROCEDURE_HOOKS.successRollModifiers) {
      // Whether the roll could be refused, as the context came to the listener.
      contexts.push(Object.assign(context, { refusable: "refusal" in context }));
      listener(context);
    }
    return true;
  };
  globals.Hooks = { call: listen, callAll: listen };
  let next = 0;
  globals.Roll = class {
    formula: string;
    total = 0;
    dice: Array<{ results: Array<{ result: number }> }> = [];
    constructor(formula: string) { this.formula = formula; rolled.push(this); }
    async evaluate() {
      const count = Number(/^(\d+)d6/.exec(this.formula)?.[1] ?? 3);
      const results = Array.from({ length: count }, () => ({ result: faces[next++ % faces.length]! }));
      this.dice = [{ results }];
      this.total = results.reduce((sum, r) => sum + r.result, 0);
      return this;
    }
  };
  return { cards, contexts, rolled };
}

describe("a Fright Check a listener refuses", () => {
  it("rolls no dice, warns, posts the refusal card and makes no check", async () => {
    const { cards, contexts, rolled } = foundryWith([6, 6, 6], (context) => {
      if (context.tags.includes("fright")) context.refusal = "The ward keeps fear out";
    });
    const actor = character("Scout", [bonus({ tags: ["fright"] })]);
    const outcome = await rollFrightCheckOutcome({ actor, modifier: -2 });
    expect(outcome).toBeNull();
    expect(rolled).toHaveLength(0);
    expect(contexts[0].refusable).toBe(true);
    expect((globals.ui as any).notifications.warn).toHaveBeenCalledWith("The ward keeps fear out");
    const card = JSON.parse(cards[0]!.data.content);
    expect(card).toMatchObject({ refused: true, resultLabel: "The ward keeps fear out" });
    // A refused check spent nothing it was holding.
    expect(actor.setFlag).not.toHaveBeenCalled();
  });
});

describe("a bonus held for a procedure's roll", () => {
  it("counts on a Fright Check and is used up by it", async () => {
    // Will 10 + 3 held = 13 against a 12: held.
    const { contexts } = foundryWith([4, 4, 4]);
    const actor = character("Scout", [bonus({ tags: ["fright"] })]);
    const outcome = await rollFrightCheckOutcome({ actor, modifier: 0 });
    expect(contexts[0].modifiers).toContainEqual({ label: "Steeled", value: 3, key: "pendingModifier" });
    expect(outcome?.success).toBe(true);
    expect(actor.flags["gworld.pendingModifiers"]).toEqual([]);
  });

  it("counts on a stun recovery, which can't be refused", async () => {
    const { contexts } = foundryWith([4, 4, 4], (context) => { context.refusal = "no"; });
    const actor = character("Scout", [bonus({ tags: ["stunRecovery"] })]);
    // HT 10 + 3 = 13 against a 12: recovered, though the listener tried to refuse it.
    expect(await rollStunRecovery({ actor })).toBe(true);
    expect(contexts[0].refusable).toBe(false);
    expect(actor.flags["gworld.pendingModifiers"]).toEqual([]);
  });

  it("stays held where the roll doesn't match it", async () => {
    foundryWith([4, 4, 4]);
    const actor = character("Scout", [bonus({ tags: ["fright"] })]);
    await rollBleeding({ actor });
    expect(actor.flags["gworld.pendingModifiers"]).toEqual([bonus({ tags: ["fright"] })]);
  });

  it("stays held when a listener takes its line off", async () => {
    foundryWith([4, 4, 4], (context) => {
      context.modifiers = context.modifiers.filter((line: any) => line.key !== "pendingModifier");
    });
    const actor = character("Scout", [bonus({ tags: ["bleeding"] })]);
    await rollBleeding({ actor });
    expect(actor.flags["gworld.pendingModifiers"]).toEqual([bonus({ tags: ["bleeding"] })]);
  });

  it("goes with each side of a Regular Contest, which now reaches the listeners", async () => {
    // A 12 + 3 against B 12: A succeeds on a 12, B fails on a 18.
    const { contexts } = foundryWith([4, 4, 4, 6, 6, 6]);
    const a = character("A", [bonus({ tags: ["contest"] })]);
    const b = character("B");
    const result = await rollRegularContest({ label: "Arm wrestle", first: { actor: a, base: 12 }, second: { actor: b, base: 12 } });
    expect(contexts.map((c) => c.tags)).toEqual([["contest", "regularContest"], ["contest", "regularContest"]]);
    expect(contexts[0].opponent).toBe(b);
    expect(result.outcome).toBe("first");
    expect(a.flags["gworld.pendingModifiers"]).toEqual([]);
  });
});

describe("a bonus held on an actor the roller doesn't own", () => {
  it("doesn't go on that side's roll, since it could never be used up", async () => {
    const { contexts } = foundryWith([4, 4, 4, 6, 6, 6]);
    const foe = { ...character("Foe", [bonus({ tags: ["contest"] })]), isOwner: false };
    await rollQuickContest({ label: "Grab the gun", first: { actor: character("A"), base: 12 }, second: { actor: foe, base: 12 } });
    expect(contexts[1].modifiers).toEqual([]);
    expect(foe.flags["gworld.pendingModifiers"]).toHaveLength(1);
  });
});

describe("a contest a listener refuses", () => {
  it("resolves to the refusal and rolls nothing, where the caller asked for one", async () => {
    const { cards, contexts, rolled } = foundryWith([4, 4, 4], (context) => {
      if (context.actor.name === "B") context.refusal = "B is asleep";
    });
    const a = character("A", [bonus({ tags: ["contest"] })]);
    const result = await rollQuickContest({ label: "Grab the gun", first: { actor: a, base: 12 }, second: { actor: character("B"), base: 12 }, returnRefusal: true });
    expect(result).toEqual({ refused: true, reason: "B is asleep", side: "second" });
    expect(rolled).toHaveLength(0);
    expect(contexts.every((c) => c.refusable)).toBe(true);
    expect(JSON.parse(cards[0]!.data.content)).toMatchObject({ refused: true, label: "Grab the gun" });
    // Nothing was rolled, so A's bonus is still held.
    expect(a.flags["gworld.pendingModifiers"]).toHaveLength(1);
  });

  it("can't be refused where the caller didn't ask, and the context says so", async () => {
    const { contexts } = foundryWith([4, 4, 4, 6, 6, 6], (context) => { context.refusal = "no"; });
    const result = await rollQuickContest({ label: "Grab the gun", first: { actor: character("A"), base: 12 }, second: { actor: character("B"), base: 12 } });
    expect(result.outcome).toBe("first");
    expect(contexts.some((c) => c.refusable)).toBe(false);
  });
});

describe("procedureRoll", () => {
  it("spends nothing for a refused roll", async () => {
    foundryWith([4, 4, 4], (context) => { context.refusal = "no"; });
    const actor = character("Scout", [bonus({ tags: ["attribute"] })]);
    const hooked = procedureRoll({ actor, label: "x", kind: "attribute", skill: "", base: 10, tags: [], modifiers: [] }, { refusable: true });
    expect(hooked.refusal).toBe("no");
    expect(hooked.added).toEqual([{ label: "Steeled", value: 3, key: "pendingModifier" }]);
    await hooked.spend();
    expect(actor.setFlag).not.toHaveBeenCalled();
  });
});
