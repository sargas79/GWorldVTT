import { afterEach, describe, expect, it, vi } from "vitest";

import { checkInfection } from "../disease.js";
import { spendFatigueFor } from "../fatigue.js";
import { PROCEDURE_HOOKS, firstAidRules, successRollModifiers } from "../procedure-extensions.js";
import { rollSuccess } from "../roll.js";

/** The tech level of treatment, the dirt in a wound, and fatigue through the chart (sargas79/GWorldVTT#704). */

const globals = globalThis as Record<string, unknown>;

afterEach(() => {
  for (const key of ["ChatMessage", "CONST", "CONFIG", "foundry", "game", "Hooks", "Roll", "ui"]) delete globals[key];
  vi.restoreAllMocks();
});

function character(name: string, options: { tl?: number; fp?: number; veryFit?: boolean } = {}) {
  const actor: any = {
    name,
    uuid: `Actor.${name}`,
    isOwner: true,
    system: {
      tl: options.tl ?? 8,
      hp: { value: 10, max: 10 },
      fp: { value: options.fp ?? 10, max: 10 },
      attributes: { HT: 10 },
      derived: { attributes: { HT: 10, IQ: 10 }, traitEffects: { fatigueLossHalved: options.veryFit === true } },
    },
    items: [],
    statuses: new Set<string>(),
    effects: [],
    getFlag: () => undefined,
    setFlag: async () => {},
    update: async (changes: Record<string, number>) => {
      if (typeof changes["system.fp.value"] === "number") actor.system.fp.value = changes["system.fp.value"];
      if (typeof changes["system.hp.value"] === "number") actor.system.hp.value = changes["system.hp.value"];
    },
    toggleStatusEffect: async () => {},
  };
  return actor;
}

type Listener = (event: string, context: any) => void;

function foundryWith(faces: number[], listener: Listener = () => {}) {
  const cards: any[] = [];
  const heard: Array<{ event: string; context: any }> = [];
  globals.ChatMessage = { implementation: { create: async (data: any) => { cards.push(data); return data; }, getSpeaker: () => ({}) } };
  globals.CONST = { CHAT_MESSAGE_STYLES: { OTHER: 0 } };
  globals.CONFIG = { ChatMessage: { modes: { public: {}, gm: {}, blind: {}, self: {} } } };
  globals.foundry = {
    utils: { escapeHTML: (s: string) => s, deepClone: (o: any) => structuredClone(o), mergeObject: (a: any, b: any) => ({ ...a, ...b }) },
    applications: { handlebars: { renderTemplate: async (_path: string, data: any) => JSON.stringify(data) } },
  };
  globals.game = { i18n: { localize: (k: string) => k, format: (k: string, d: any) => `${k}:${JSON.stringify(d)}` }, settings: { get: () => ({}) }, user: { id: "gm" } };
  globals.ui = { notifications: { warn: vi.fn(), info: vi.fn() } };
  const listen = (event: string, context: any) => { heard.push({ event, context }); listener(event, context); return true; };
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

describe("the tech level of First Aid (Campaigns p. 424)", () => {
  it("starts at the healer's and is the listener's to change", () => {
    foundryWith([3]);
    expect(firstAidRules(character("Medic", { tl: 8 }), character("Patient")).techLevel).toBe(8);
    expect(firstAidRules(character("Medic", { tl: 8 }), character("Patient"), 6).techLevel).toBe(6);
    foundryWith([3], (event, context) => { if (event === PROCEDURE_HOOKS.firstAid) context.techLevel = 4; });
    expect(firstAidRules(character("Medic", { tl: 8 }), character("Patient"))).toMatchObject({ techLevel: 4, refusal: null, stopsBleeding: true });
  });
});

describe("dirt in a wound on the infection roll (Campaigns p. 444)", () => {
  it("is a line keyed woundDirt, and a listener can take it out", async () => {
    const seen: any[] = [];
    const { cards } = foundryWith([1, 1, 1], (event, context) => {
      if (event !== PROCEDURE_HOOKS.successRollModifiers || !context.tags.includes("infection")) return;
      seen.push(context.modifiers.map((m: any) => ({ ...m })));
      const at = context.modifiers.findIndex((m: any) => m.key === "woundDirt");
      if (at >= 0) context.modifiers.splice(at, 1);
    });
    await checkInfection({ actor: character("Wounded"), dirt: ["dung", "specialInfection"] });
    expect(seen[0]).toEqual([{ key: "woundDirt", label: "GWORLD.Illness.WoundDirt", value: -5 }]);
    // HT 10 and +3, and the -5 for the dirt taken out.
    expect(JSON.parse(cards[0].content)).toMatchObject({ target: 13 });
  });

  it("counts against the roll where nobody touches it", async () => {
    const { cards } = foundryWith([1, 1, 1]);
    await checkInfection({ actor: character("Wounded"), dirt: ["dung"] });
    expect(JSON.parse(cards[0].content)).toMatchObject({ target: 11 });
  });
});

describe("a keyed line a listener removes", () => {
  it("leaves the lines the listeners added", () => {
    foundryWith([3], (event, context) => {
      if (event !== PROCEDURE_HOOKS.successRollModifiers) return;
      context.modifiers.splice(0, 1);
      context.modifiers.push({ label: "Gear", value: 2 });
    });
    const added = successRollModifiers({ actor: character("A"), label: "", kind: "skill", skill: "", base: 10, tags: [], modifiers: [{ label: "Given", value: -3 }] });
    expect(added).toEqual([{ label: "Gear", value: 2 }]);
  });

  it("is gone from a roll made through roll.success", async () => {
    const { cards } = foundryWith([3, 3, 3], (event, context) => {
      if (event !== PROCEDURE_HOOKS.successRollModifiers) return;
      const at = context.modifiers.findIndex((m: any) => m.key === "afflictionDr");
      if (at >= 0) context.modifiers.splice(at, 1);
    });
    const outcome = await rollSuccess({ actor: character("Victim"), base: 10, label: "HT", kind: "attribute", modifiers: [{ key: "afflictionDr", label: "DR", value: 4 } as never, { label: "Other", value: 1 }] });
    expect(outcome).not.toBeNull();
    expect(JSON.parse(cards[0].content)).toMatchObject({ effective: 11 });
  });
});

describe("fatigue through the chart (Campaigns p. 426)", () => {
  it("asks gworld.fatigueCost, halves for Very Fit, and injures past 0 FP", async () => {
    const { heard } = foundryWith([3]);
    const tired = character("Tired", { fp: 1 });
    const spent = await spendFatigueFor(tired, 3, { reason: "hauling", details: { load: 200 } });
    expect(heard.find((h) => h.event === "gworld.fatigueCost")?.context).toMatchObject({ fp: 3, reason: "hauling", exertion: true, details: { load: 200 } });
    expect(spent).toMatchObject({ fpLost: 3, hpLost: 2 });
    expect(tired.system.fp.value).toBe(-2);
    expect(tired.system.hp.value).toBe(8);

    const fit = character("Fit", { veryFit: true });
    expect((await spendFatigueFor(fit, 4))?.fpLost).toBe(2);
    expect(heard.filter((h) => h.event === "gworld.fatigueCost").at(-1)?.context.reason).toBe("module");
  });

  it("refuses nothing to spend, or an actor the user can't change", async () => {
    foundryWith([3]);
    expect(await spendFatigueFor(character("A"), 0)).toBeNull();
    expect(await spendFatigueFor({ ...character("B"), isOwner: false }, 2)).toBeNull();
  });
});
