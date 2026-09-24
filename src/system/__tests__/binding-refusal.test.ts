import { afterEach, describe, expect, it, vi } from "vitest";

import { bind, bindingOf, breakFreeFromBinding, unbind } from "../entangling.js";
import { PROCEDURE_HOOKS } from "../procedure-extensions.js";
import { rollSuccess } from "../roll.js";

/** A Binding from the API, and a card for a roll refused below 3 (sargas79/GWorldVTT#701). */

const globals = globalThis as Record<string, unknown>;

afterEach(() => {
  for (const key of ["ChatMessage", "CONST", "CONFIG", "foundry", "game", "Hooks", "Roll", "ui"]) delete globals[key];
  vi.restoreAllMocks();
});

/** A character whose updates land on it, with its statuses kept. */
function character(name: string, options: { st?: number; escape?: number; fp?: number } = {}) {
  const actor: any = {
    name,
    uuid: `Actor.${name}`,
    isOwner: true,
    system: {
      hp: { value: 10, max: 10 },
      fp: { value: options.fp ?? 10, max: 10 },
      attributes: { ST: options.st ?? 10 },
      derived: { attributes: { ST: options.st ?? 10, DX: 10, IQ: 10, HT: 10 }, traitEffects: {} },
      entangled: { kind: "", successes: 0, failures: 0, mustBeCut: false, where: "", running: false, st: 0, label: "", source: "" },
    },
    items: options.escape === undefined ? [] : [{ type: "skill", name: "Escape", system: { derived: { level: options.escape } } }],
    statuses: new Set<string>(),
    effects: [],
    getFlag: () => undefined,
    update: async (changes: Record<string, unknown>) => {
      for (const [path, value] of Object.entries(changes)) {
        const keys = path.split(".");
        let at = actor;
        for (const key of keys.slice(0, -1)) at = at[key];
        at[keys.at(-1)!] = value;
      }
    },
    toggleStatusEffect: async (id: string, { active }: { active: boolean }) => {
      if (active) actor.statuses.add(id);
      else actor.statuses.delete(id);
    },
  };
  return actor;
}

/** Foundry, with dice that come up as given and every hook and card kept. */
function foundryWith(faces: number[]) {
  const cards: any[] = [];
  const heard: Array<{ event: string; context: any }> = [];
  globals.ChatMessage = { implementation: { create: async (data: any, options: any) => { cards.push({ data, options }); return data; }, getSpeaker: () => ({}) } };
  globals.CONST = { CHAT_MESSAGE_STYLES: { OTHER: 0 } };
  globals.CONFIG = { ChatMessage: { modes: { public: {}, gm: {}, blind: {}, self: {} } } };
  globals.foundry = {
    utils: { escapeHTML: (s: string) => s, deepClone: (o: any) => structuredClone(o), mergeObject: (a: any, b: any) => ({ ...a, ...b }) },
    applications: { handlebars: { renderTemplate: async (_path: string, data: any) => JSON.stringify(data) } },
  };
  globals.game = { i18n: { localize: (k: string) => k, format: (k: string, d: any) => `${k}:${JSON.stringify(d)}` }, settings: { get: () => ({}) }, user: { id: "gm" } };
  globals.ui = { notifications: { warn: vi.fn(), info: vi.fn() } };
  const listen = (event: string, context: any) => { heard.push({ event, context }); return true; };
  globals.Hooks = { call: listen, callAll: listen };
  let next = 0;
  globals.Roll = class {
    formula: string;
    total = 0;
    dice: Array<{ results: Array<{ result: number }> }> = [];
    constructor(formula: string) { this.formula = formula; }
    async evaluate() {
      const count = Number(/^(\d+)d6/.exec(this.formula)?.[1] ?? 0);
      const results = Array.from({ length: count }, () => ({ result: faces[next++ % faces.length]! }));
      this.dice = [{ results }];
      this.total = results.reduce((sum, r) => sum + r.result, 0);
      return this;
    }
  };
  return { cards, heard };
}

describe("a Binding (Characters p. 40)", () => {
  it("holds the victim at its ST on the entangled state", async () => {
    foundryWith([3]);
    const victim = character("Victim");
    expect(await bind(victim, { st: 12, label: "Barbed wire", source: "my-module.wire" })).toBe(true);
    expect(bindingOf(victim)).toEqual({ st: 12, label: "Barbed wire", source: "my-module.wire" });
    expect(victim.statuses.has("entangled")).toBe(true);
    expect(await bind(victim, { st: 0 })).toBe(false);
  });

  it("is broken by winning a Quick Contest of ST, and tells whoever bound them", async () => {
    // The victim rolls 3 (a critical success); the binding rolls 18.
    const { heard, cards } = foundryWith([1, 1, 1, 6, 6, 6]);
    const victim = character("Victim", { st: 10 });
    const onBreak = vi.fn();
    await bind(victim, { st: 14, label: "Net", onBreak });
    expect(await breakFreeFromBinding(victim)).toBe("free");
    expect(bindingOf(victim)).toBeNull();
    expect(victim.statuses.has("entangled")).toBe(false);
    expect(onBreak).toHaveBeenCalledWith(expect.objectContaining({ st: 14, label: "Net", how: "brokeFree" }));
    expect(heard.some((h) => h.event === PROCEDURE_HOOKS.bindingBroken && h.context.how === "brokeFree")).toBe(true);
    // The contest's card, and the one saying they are loose.
    expect(String(cards.at(-1).data.content)).toContain("GWORLD.Entangled.BrokeFree");
  });

  it("costs 1 FP for an attempt that fails, and uses Escape where it is better", async () => {
    // The victim rolls 18; the binding rolls 3.
    const { heard } = foundryWith([6, 6, 6, 1, 1, 1]);
    const victim = character("Victim", { st: 10, escape: 13 });
    await bind(victim, { st: 12 });
    expect(await breakFreeFromBinding(victim)).toBe("held");
    expect(victim.system.fp.value).toBe(9);
    expect(bindingOf(victim)?.st).toBe(12);
    const sides = heard.filter((h) => h.event === PROCEDURE_HOOKS.successRollModifiers).map((h) => h.context);
    expect(sides[0]).toMatchObject({ skill: "Escape", base: 13, tags: expect.arrayContaining(["binding", "quickContest"]) });
    expect(sides[1]).toMatchObject({ base: 12 });
  });

  it("comes off with unbind, without a Contest", async () => {
    const { heard } = foundryWith([3]);
    const victim = character("Victim");
    await bind(victim, { st: 11 });
    expect(await unbind(victim)).toBe(true);
    expect(await unbind(victim)).toBe(false);
    expect(heard.find((h) => h.event === PROCEDURE_HOOKS.bindingBroken)?.context).toMatchObject({ st: 11, how: "unbound" });
  });
});

describe("a roll refused below 3 (Campaigns p. 344)", () => {
  it("posts a card saying so, and rolls no dice", async () => {
    const { cards } = foundryWith([1, 1, 1]);
    const result = await rollSuccess({ actor: character("Clumsy"), base: 5, label: "Climbing", modifiers: [{ label: "Sheer wall", value: -3 }] });
    expect(result).toBeNull();
    const content = JSON.parse(String(cards[0].data.content));
    expect(content).toMatchObject({ refused: true, effective: 2, resultClass: "failure" });
    expect(content.resultLabel).toContain("GWORLD.Roll.TooLowToAttempt");
    expect(cards[0].data.rolls).toBeUndefined();
  });

  it("returns the reason where the caller asks for it", async () => {
    foundryWith([1, 1, 1]);
    const result = await rollSuccess({ actor: character("Clumsy"), base: 2, label: "Lockpicking", returnRefusal: true });
    expect(result).toMatchObject({ refused: true, base: 2, effective: 2 });
    expect((result as { reason: string }).reason).toContain("GWORLD.Roll.TooLowToAttempt");
  });

  it("keeps a secret roll's refusal secret", async () => {
    const { cards } = foundryWith([1, 1, 1]);
    await rollSuccess({ actor: character("Clumsy"), base: 1, label: "Hidden", secret: true });
    expect(cards[0].options).toEqual({ messageMode: "blind" });
  });

  it("still lets a defense be rolled", async () => {
    const result = await (foundryWith([1, 1, 1]), rollSuccess({ actor: character("Clumsy"), base: 2, label: "Dodge", kind: "defense" }));
    expect(result).not.toBeNull();
  });
});
