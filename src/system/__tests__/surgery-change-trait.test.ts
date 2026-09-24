import { afterEach, describe, expect, it, vi } from "vitest";

import { PROCEDURE_HOOKS } from "../procedure-extensions.js";
import { operate } from "../recovery.js";
import { changeTrait } from "../trait-change.js";

/** An operation's outcome, and a module changing a character's traits (sargas79/GWorldVTT#709). */

const globals = globalThis as Record<string, unknown>;

afterEach(() => {
  for (const key of ["ChatMessage", "CONST", "foundry", "game", "Hooks", "Roll", "ui"]) delete globals[key];
  vi.restoreAllMocks();
});

function foundryWith(faces: number[], options: { gm?: boolean; packs?: any[] } = {}) {
  const heard: Array<{ event: string; context: any }> = [];
  globals.ChatMessage = { implementation: { create: async (data: any) => data, getSpeaker: () => ({}) } };
  globals.CONST = { CHAT_MESSAGE_STYLES: { OTHER: 0 } };
  globals.foundry = {
    utils: { escapeHTML: (s: string) => s, deepClone: (o: any) => structuredClone(o) },
    applications: { handlebars: { renderTemplate: async (_path: string, data: any) => JSON.stringify(data) } },
  };
  globals.game = {
    i18n: { localize: (k: string) => k, format: (k: string, d: any) => `${k}:${JSON.stringify(d)}` },
    settings: { get: () => ({}) },
    user: { isGM: options.gm !== false },
    packs: options.packs ?? [],
  };
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
      const results = Array.from({ length: 3 }, () => ({ result: faces[next++ % faces.length]! }));
      this.dice = [{ results }];
      this.total = results.reduce((sum, r) => sum + r.result, 0);
      return this;
    }
  };
  return { heard };
}

function character(name: string, traits: any[] = []) {
  const items: any[] = traits.map((t, i) => ({
    id: `t${i}`, type: "trait", ...t,
    update: async function (this: any, changes: Record<string, number>) { if (typeof changes["system.levels"] === "number") this.system.levels = changes["system.levels"]; },
  }));
  return {
    name, uuid: `Actor.${name}`, isOwner: true,
    system: { hp: { value: 10, max: 10 }, tl: 8, derived: { attributes: { IQ: 10, HT: 10 } } },
    items,
    statuses: new Set<string>(),
    effects: [],
    getFlag: () => undefined,
    update: async () => {},
    createEmbeddedDocuments: vi.fn(async (_type: string, data: any[]) => data.map((d, i) => { const made = { id: `new${i}`, ...d }; items.push(made); return made; })),
    deleteEmbeddedDocuments: vi.fn(async (_type: string, ids: string[]) => { for (const id of ids) items.splice(items.findIndex((i) => i.id === id), 1); }),
  };
}

describe("an operation's outcome (Campaigns p. 424)", () => {
  it("is returned, and gworld.afterSuccessRoll hears it tagged surgery", async () => {
    const { heard } = foundryWith([1, 1, 2]);
    const result = await operate({ surgeon: character("Doc"), patient: character("Patient"), anesthetic: true, repairingCrippled: false, equipmentQuality: 0, modifier: 0, skill: 14, techLevel: 8 });
    expect(result).toMatchObject({ success: true, criticalSuccess: true, roll: 4, techLevel: 8 });
    const after = heard.find((h) => h.event === PROCEDURE_HOOKS.afterSuccessRoll)?.context;
    expect(after).toMatchObject({ skill: "Surgery", tags: ["surgery"], outcome: { success: true } });
  });

  it("resolves to null where the patient can't be changed", async () => {
    foundryWith([3]);
    expect(await operate({ surgeon: character("Doc"), patient: { ...character("P"), isOwner: false }, anesthetic: true, repairingCrippled: false, equipmentQuality: 0, modifier: 0 })).toBeNull();
  });
});

describe("changing a character's traits", () => {
  const charisma = { name: "Charisma", system: { levels: 2, maxLevels: 0, costTable: [] } };
  const appearance = { name: "Appearance (Attractive)", system: { levels: 1, maxLevels: 0, costTable: [] } };

  it("sets a level, held within the trait's cap", async () => {
    foundryWith([3]);
    const actor = character("A", [charisma, { name: "Intolerance", system: { levels: 1, maxLevels: 2, costTable: [] } }]);
    expect(await changeTrait(actor, { name: "charisma", level: 4 })).toEqual({ itemId: "t0", from: { name: "Charisma", levels: 2 }, to: { name: "Charisma", levels: 4 }, replaced: false });
    expect((await changeTrait(actor, { id: "t1", level: 7 }))?.to.levels).toBe(2);
  });

  it("swaps a trait for another from the compendia, or from data", async () => {
    const pack = {
      metadata: { type: "Item" },
      getIndex: async () => [{ _id: "p1", name: "Appearance (Beautiful)", type: "trait" }],
      getDocument: async () => ({ toObject: () => ({ _id: "p1", name: "Appearance (Beautiful)", type: "trait", system: { levels: 0 } }) }),
    };
    foundryWith([3], { packs: [pack] });
    const actor = character("A", [appearance]);
    const swapped = await changeTrait(actor, { name: "Appearance (Attractive)", replaceWith: "Appearance (Beautiful)" });
    expect(swapped).toMatchObject({ from: { name: "Appearance (Attractive)" }, to: { name: "Appearance (Beautiful)" }, replaced: true });
    expect(actor.items.map((i: any) => i.name)).toEqual(["Appearance (Beautiful)"]);
    const again = await changeTrait(actor, { name: "Appearance (Beautiful)", replaceWith: { name: "Appearance (Ugly)", type: "trait", system: {} } });
    expect(again?.to.name).toBe("Appearance (Ugly)");
    expect(await changeTrait(actor, { name: "Appearance (Ugly)", replaceWith: "Nothing Like It" })).toBeNull();
  });

  it("is the GM's alone, and needs a trait the character has", async () => {
    foundryWith([3], { gm: false });
    expect(await changeTrait(character("A", [charisma]), { name: "Charisma", level: 3 })).toBeNull();
    foundryWith([3]);
    expect(await changeTrait(character("A", [charisma]), { name: "Magery", level: 3 })).toBeNull();
  });
});
