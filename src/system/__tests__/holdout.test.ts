import { afterEach, describe, expect, it, vi } from "vitest";

import { PROCEDURE_HOOKS } from "../procedure-extensions.js";
import { holdoutSizes, rollHoldout } from "../holdout.js";
import { createApi } from "../api.js";

/** A Holdout roll for hiding one item (sargas79/GWorldVTT#822; Characters p. 200). */

const globals = globalThis as Record<string, unknown>;

afterEach(() => {
  for (const key of ["ChatMessage", "CONST", "CONFIG", "foundry", "game", "Hooks", "Roll", "ui"]) delete globals[key];
  vi.restoreAllMocks();
});

/** A character with the skills given, as the sheet derives them, and nothing else that changes a roll. */
function character(name: string, skills: Record<string, number> = {}, derived: Record<string, unknown> = {}) {
  return {
    name,
    uuid: `Actor.${name}`,
    isOwner: true,
    system: {
      hp: { value: 10, max: 10 },
      fp: { value: 10, max: 10 },
      derived: { attributes: { ST: 10, DX: 10, IQ: 12, HT: 10 }, per: 12, traitEffects: {}, ...derived },
    },
    items: Object.entries(skills).map(([skill, level]) => ({ type: "skill", name: skill, system: { derived: { level } } })),
    statuses: new Set<string>(),
    effects: [],
    getFlag: () => undefined,
  };
}

/** Foundry, with a successRollModifiers listener, and every card and success-roll context kept. */
function foundryWith(listener: (context: any) => void = () => {}, faces: number[] = [3, 3, 4]) {
  const cards: any[] = [];
  const contexts: any[] = [];
  globals.ChatMessage = { implementation: { create: async (data: any, options: any) => { cards.push({ data, options }); return { id: "card" }; }, getSpeaker: () => ({}) } };
  globals.CONST = { CHAT_MESSAGE_STYLES: { OTHER: 0 } };
  globals.CONFIG = { ChatMessage: { modes: { public: {}, gm: {}, blind: {}, self: {} } } };
  globals.foundry = {
    utils: { escapeHTML: (s: string) => s, deepClone: (o: any) => structuredClone(o), mergeObject: (a: any, b: any) => ({ ...a, ...b }) },
    applications: { handlebars: { renderTemplate: async (_path: string, data: any) => JSON.stringify(data) } },
  };
  globals.game = { i18n: { localize: (k: string) => k, format: (k: string, d: any) => `${k}:${JSON.stringify(d)}` }, settings: { get: () => ({}) }, user: { id: "gm" } };
  globals.ui = { notifications: { warn: vi.fn(), info: vi.fn() } };
  const listen = (event: string, context: any) => {
    if (event === PROCEDURE_HOOKS.successRollModifiers) {
      listener(context);
      contexts.push({ ...context, modifiers: [...context.modifiers] });
    }
    return true;
  };
  globals.Hooks = { call: listen, callAll: listen };
  let next = 0;
  globals.Roll = class {
    formula: string;
    total = 0;
    dice: Array<{ results: Array<{ result: number }> }> = [];
    constructor(formula: string) { this.formula = formula; }
    async evaluate() {
      const results = Array.from({ length: 3 }, () => ({ result: faces[next++ % faces.length]! }));
      this.dice = [{ results }];
      this.total = results.reduce((sum, r) => sum + r.result, 0);
      return this;
    }
  };
  return { cards, contexts };
}

const derringer = { name: "Derringer", uuid: "Item.derringer" };

describe("rolling Holdout to hide an item", () => {
  it("rolls the skill with the size line, keyed, tagged holdout, with the item on the context", async () => {
    const { contexts } = foundryWith();
    const outcome = await rollHoldout(character("Spy", { Holdout: 13 }), derringer, { size: "dagger" });
    expect(contexts).toHaveLength(1);
    expect(contexts[0]).toMatchObject({ skill: "Holdout", base: 13, item: derringer });
    expect(contexts[0].tags).toContain("holdout");
    expect(contexts[0].modifiers).toEqual([{ label: "GWORLD.Holdout.Size", value: -1, key: "holdoutSize" }]);
    // 10 against 13 - 1.
    expect(outcome).toMatchObject({ success: true, margin: 2 });
  });

  it("lets a module add its own line -- a concealment holster", async () => {
    const { contexts } = foundryWith((context) => {
      if (context.tags.includes("holdout") && context.item?.name === "Derringer") context.modifiers.push({ label: "Holster", value: 1 });
    });
    const outcome = await rollHoldout(character("Spy", { Holdout: 12 }), derringer, { size: -2 });
    expect(contexts[0].modifiers).toContainEqual({ label: "Holster", value: 1 });
    // 10 against 12 - 2 + 1.
    expect(outcome).toMatchObject({ success: true, margin: 1 });
  });

  it("adds clothing and a thing that moves or makes noise", async () => {
    const { contexts } = foundryWith();
    await rollHoldout(character("Spy", { Holdout: 12 }), derringer, { size: 0, clothing: 5, moving: true, modifiers: [{ label: "Hurried", value: -2 }] });
    expect(contexts[0].modifiers).toEqual([
      { label: "GWORLD.Holdout.Clothing", value: 5, key: "clothing" },
      { label: "GWORLD.Holdout.Moving", value: -1, key: "moving" },
      { label: "Hurried", value: -2 },
    ]);
  });

  it("defaults to the better of IQ-5 and Sleight of Hand-3", async () => {
    const { contexts } = foundryWith();
    await rollHoldout(character("Novice"), derringer, { size: 0 });
    await rollHoldout(character("Conjuror", { "Sleight of Hand": 14 }), derringer, { size: 0 });
    expect(contexts.map((c) => c.base)).toEqual([7, 11]);
  });

  it("reads the size off the item's flag where none is given, and rolls nothing without one", async () => {
    const { contexts } = foundryWith();
    await rollHoldout(character("Spy", { Holdout: 12 }), { ...derringer, flags: { gworld: { holdoutSize: -3 } } });
    expect(contexts[0].modifiers).toEqual([{ label: "GWORLD.Holdout.Size", value: -3, key: "holdoutSize" }]);
    // A blank size reads the flag too.
    await rollHoldout(character("Spy", { Holdout: 12 }), { ...derringer, flags: { gworld: { holdoutSize: "handgun" } } }, { size: " " });
    expect(contexts[1].modifiers).toEqual([{ label: "GWORLD.Holdout.Size", value: -2, key: "holdoutSize" }]);
    expect((globals.ui as any).notifications.warn).not.toHaveBeenCalled();
    expect(await rollHoldout(character("Spy", { Holdout: 12 }), derringer)).toBeNull();
    expect((globals.ui as any).notifications.warn).toHaveBeenCalled();
    expect(contexts).toHaveLength(2);
  });

  it("holds clothing to -7..+5", async () => {
    const { contexts } = foundryWith();
    await rollHoldout(character("Spy", { Holdout: 12 }), derringer, { size: 0, clothing: 12 });
    expect(contexts[0].modifiers).toEqual([{ label: "GWORLD.Holdout.Clothing", value: 5, key: "clothing" }]);
  });
});

describe("a searcher's Quick Contest of Search against Holdout", () => {
  it("rolls both sides, tagged holdout with the item, and says whether the item stays hidden", async () => {
    // The hider rolls 10, the searcher 18.
    const { contexts, cards } = foundryWith(() => {}, [3, 3, 4, 6, 6, 6]);
    const result = await rollHoldout(character("Spy", { Holdout: 13 }), derringer, { size: -1, searcher: character("Guard", { Search: 12 }) });
    expect(contexts.map((c) => [c.skill, c.base, c.item?.name, c.tags.includes("holdout")])).toEqual([
      ["Holdout", 13, "Derringer", true],
      ["Search", 12, "Derringer", true],
    ]);
    expect(result).toMatchObject({ hidden: true, outcome: "first" });
    expect(cards).toHaveLength(1);
  });

  it("finds the item where the searcher wins, at Perception-5 without Search", async () => {
    // The hider rolls 18, the searcher 6.
    const { contexts } = foundryWith(() => {}, [6, 6, 6, 2, 2, 2]);
    const result = await rollHoldout(character("Spy", { Holdout: 13 }), derringer, { size: -1, searcher: character("Guard") });
    expect(contexts[1].base).toBe(7);
    expect(result).toMatchObject({ hidden: false, outcome: "second" });
  });

  it("rolls the searcher at Criminology-5 where that is their best", async () => {
    const { contexts } = foundryWith(() => {}, [3, 3, 4, 3, 3, 4]);
    await rollHoldout(character("Spy", { Holdout: 13 }), derringer, { size: 0, searcher: character("Detective", { Criminology: 15 }) });
    expect(contexts[1]).toMatchObject({ skill: "Search", base: 10 });
  });

  it("goes to the GM alone unless the caller says who sees it (p. 219)", async () => {
    const { cards } = foundryWith(() => {}, [3, 3, 4]);
    const spy = character("Spy", { Holdout: 13 });
    await rollHoldout(spy, derringer, { size: 0, searcher: character("Guard") });
    await rollHoldout(spy, derringer, { size: 0, searcher: character("Guard"), rollMode: "public" });
    await rollHoldout(spy, derringer, { size: 0, searcher: character("Guard"), secret: false });
    await rollHoldout(spy, derringer, { size: 0 });
    expect(cards.map((c) => c.options)).toEqual([{ messageMode: "blind" }, { messageMode: "public" }, {}, {}]);
  });

  it("names the hider's default on the card, and keeps the hook's skill Holdout", async () => {
    const { contexts, cards } = foundryWith(() => {}, [3, 3, 4]);
    await rollHoldout(character("Novice"), derringer, { size: 0, searcher: character("Guard") });
    expect(contexts[0].skill).toBe("Holdout");
    expect(JSON.parse(cards[0].data.content).label).toBe('GWORLD.Holdout.SearchLabelDefault:{"item":"Derringer","from":"IQ-5"}');
  });
});

describe("the size table", () => {
  it("lists the rows with their labels, and is on the API", () => {
    foundryWith();
    const rows = holdoutSizes();
    expect(rows[0]).toEqual({ key: "tiny", modifier: 4, label: "GWORLD.Holdout.Sizes.tiny" });
    expect(rows.at(-1)).toMatchObject({ key: "crossbow", modifier: -6 });
    const api = createApi();
    expect(api.roll.holdout).toBe(rollHoldout);
    expect(api.roll.holdoutSizes).toBe(holdoutSizes);
  });
});
