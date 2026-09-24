import { afterEach, describe, expect, it, vi } from "vitest";

import {
  addPendingModifier,
  pendingModifierLines,
  pendingModifierMatches,
  pendingModifiers,
  removePendingModifier,
  type PendingModifier,
} from "../pending-modifiers.js";
import { PROCEDURE_HOOKS } from "../procedure-extensions.js";
import { promptForModifier, rollSuccess } from "../roll.js";

/**
 * A bonus held for the actor's next matching success roll, used up by it
 * (sargas79/GWorldVTT#760).
 */

const globals = globalThis as Record<string, unknown>;

afterEach(() => {
  for (const key of ["ChatMessage", "CONST", "CONFIG", "foundry", "game", "Hooks", "Roll", "ui"]) delete globals[key];
  vi.restoreAllMocks();
});

/** A character with nothing on them that could change a roll, keeping its flags. */
function character(owner = true) {
  const flags: Record<string, unknown> = {};
  return {
    name: "Surveyor",
    uuid: "Actor.Surveyor",
    isOwner: owner,
    system: {
      hp: { value: 10, max: 10 },
      fp: { value: 10, max: 10 },
      derived: { attributes: { ST: 10, DX: 10, IQ: 10, HT: 10 }, traitEffects: {} },
    },
    items: [],
    statuses: new Set<string>(),
    effects: [],
    flags,
    getFlag: (scope: string, key: string) => flags[`${scope}.${key}`],
    setFlag: vi.fn(async (scope: string, key: string, value: unknown) => { flags[`${scope}.${key}`] = structuredClone(value); }),
  };
}

/** Foundry, at a world time, with dice that come up as given and every hook and card kept. */
function foundryAt(worldTime: number, faces: number[] = [3, 3, 4]) {
  const cards: any[] = [];
  const heard: Array<{ event: string; context: any }> = [];
  const listeners: Array<(context: any) => void> = [];
  let ids = 0;
  globals.ChatMessage = { implementation: { create: async (data: any, options: any) => { cards.push({ data, options }); return data; }, getSpeaker: () => ({}) } };
  globals.CONST = { CHAT_MESSAGE_STYLES: { OTHER: 0 } };
  globals.CONFIG = { ChatMessage: { modes: { public: {}, gm: {}, blind: {}, self: {} } } };
  globals.foundry = {
    utils: { randomID: () => `held${++ids}`, escapeHTML: (s: string) => s, deepClone: (o: any) => structuredClone(o), mergeObject: (a: any, b: any) => ({ ...a, ...b }) },
    applications: { handlebars: { renderTemplate: async (_path: string, data: any) => JSON.stringify(data) } },
  };
  globals.game = {
    i18n: { localize: (k: string) => k, format: (k: string, d: any) => `${k}:${JSON.stringify(d)}` },
    settings: { get: () => ({}) },
    user: { id: "gm" },
    time: { worldTime },
  };
  globals.ui = { notifications: { warn: vi.fn(), info: vi.fn() } };
  const listen = (event: string, context: any) => {
    heard.push({ event, context });
    if (event === PROCEDURE_HOOKS.successRollModifiers) for (const l of listeners) l(context);
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
      const count = Number(/^(\d+)d6/.exec(this.formula)?.[1] ?? 0);
      const results = Array.from({ length: count }, () => ({ result: faces[next++ % faces.length]! }));
      this.dice = [{ results }];
      this.total = results.reduce((sum, r) => sum + r.result, 0);
      return this;
    }
  };
  return { cards, heard, listeners };
}

function held(overrides: Partial<PendingModifier> = {}): PendingModifier {
  return { id: "a", label: "Survey", value: 2, tags: [], skill: null, expires: null, ...overrides };
}

describe("which rolls take a held bonus", () => {
  it("matches a skill by name, without case or tech level, and a general one any specialty", () => {
    expect(pendingModifierMatches(held({ skill: "Survival" }), { skill: "survival (Desert)", tags: ["skill"] })).toBe(true);
    expect(pendingModifierMatches(held({ skill: "Survival (Desert)" }), { skill: "Survival (Arctic)", tags: ["skill"] })).toBe(false);
    expect(pendingModifierMatches(held({ skill: "Guns (Pistol)" }), { skill: "Guns/TL8 (Pistol)", tags: ["attack"] })).toBe(true);
    expect(pendingModifierMatches(held({ skill: "Survival" }), { skill: "Tracking", tags: ["skill"] })).toBe(false);
    expect(pendingModifierMatches(held({ skill: "Survival" }), { tags: ["attribute", "IQ"] })).toBe(false);
  });

  it("needs every tag it names, the roll's kind among them", () => {
    expect(pendingModifierMatches(held({ tags: ["skill", "IQ"] }), { skill: "Navigation", tags: ["skill", "IQ"] })).toBe(true);
    expect(pendingModifierMatches(held({ tags: ["skill", "IQ"] }), { skill: "Climbing", tags: ["skill", "DX"] })).toBe(false);
    expect(pendingModifierMatches(held({ skill: "Navigation", tags: ["IQ"] }), { skill: "Navigation", tags: ["skill"] })).toBe(false);
  });

  it("leaves out a lapsed bonus", () => {
    const actor = character();
    actor.flags["gworld.pendingModifiers"] = [held({ id: "old", expires: 100 }), held({ id: "new", expires: 200 })];
    expect(pendingModifiers(actor, 150).map((m) => m.id)).toEqual(["new"]);
    expect(pendingModifierLines(actor, { tags: [] }, 150)).toEqual([{ id: "new", line: { label: "Survey", value: 2, key: "pendingModifier" } }]);
  });
});

describe("holding and removing a bonus", () => {
  it("keeps what was asked and returns its id", async () => {
    foundryAt(1000);
    const actor = character();
    const id = await addPendingModifier(actor, { label: " Survey ", value: 2, skill: "Geology", tags: ["skill", "skill"], expires: 4600 });
    expect(id).toBe("held1");
    expect(pendingModifiers(actor)).toEqual([{ id: "held1", label: "Survey", value: 2, tags: ["skill"], skill: "Geology", expires: 4600 }]);
  });

  it("refuses a bonus it couldn't hold or that would match anything", async () => {
    foundryAt(1000);
    const actor = character();
    expect(await addPendingModifier(character(false), { label: "Survey", value: 2, skill: "Geology" })).toBeNull();
    expect(await addPendingModifier(actor, { label: "", value: 2, skill: "Geology" })).toBeNull();
    expect(await addPendingModifier(actor, { label: "Survey", value: 0, skill: "Geology" })).toBeNull();
    expect(await addPendingModifier(actor, { label: "Survey", value: 2 })).toBeNull();
    expect(await addPendingModifier(actor, { label: "Survey", value: 2, skill: "Geology", expires: 1000 })).toBeNull();
    expect(actor.setFlag).not.toHaveBeenCalled();
  });

  it("drops lapsed bonuses when it writes, and removes one by id", async () => {
    foundryAt(1000);
    const actor = character();
    actor.flags["gworld.pendingModifiers"] = [held({ id: "old", expires: 500 })];
    const id = await addPendingModifier(actor, { label: "Survey", value: 2, tags: ["skill"] });
    expect((actor.flags["gworld.pendingModifiers"] as PendingModifier[]).map((m) => m.id)).toEqual([id]);
    expect(await removePendingModifier(actor, "nothing")).toBe(false);
    expect(await removePendingModifier(actor, id!)).toBe(true);
    expect(pendingModifiers(actor)).toEqual([]);
  });
});

describe("a roll takes a held bonus", () => {
  it("adds its line to the matching roll and uses it up", async () => {
    const { cards, heard } = foundryAt(1000);
    const actor = character();
    await addPendingModifier(actor, { label: "Survey", value: 2, skill: "Geology" });
    await addPendingModifier(actor, { label: "Scouted", value: 1, tags: ["attack"] });

    const outcome = await rollSuccess({ actor, base: 10, label: "Geology", kind: "skill", skill: "Geology" });
    expect(outcome).toMatchObject({ effectiveSkill: 12 });
    expect(JSON.parse(String(cards[0].data.content)).modifiers).toEqual([{ label: "Survey", value: 2, key: "pendingModifier" }]);
    const context = heard.find((h) => h.event === PROCEDURE_HOOKS.successRollModifiers)?.context;
    expect(context.modifiers).toContainEqual({ label: "Survey", value: 2, key: "pendingModifier" });
    expect(pendingModifiers(actor).map((m) => m.label)).toEqual(["Scouted"]);

    // Used up: the next roll of the skill has nothing held for it.
    const again = await rollSuccess({ actor, base: 10, label: "Geology", kind: "skill", skill: "Geology" });
    expect(again).toMatchObject({ effectiveSkill: 10 });
  });

  it("is not used up by a roll that doesn't match, or one a lapsed bonus missed", async () => {
    foundryAt(1000);
    const actor = character();
    await addPendingModifier(actor, { label: "Survey", value: 2, skill: "Geology" });
    await addPendingModifier(actor, { label: "Brief", value: 1, skill: "Tracking", expires: 1500 });
    (globals.game as any).time.worldTime = 2000;
    expect(await rollSuccess({ actor, base: 10, label: "Tracking", kind: "skill", skill: "Tracking" })).toMatchObject({ effectiveSkill: 10 });
    expect(pendingModifiers(actor).map((m) => m.label)).toEqual(["Survey"]);
  });

  it("is kept when a listener takes its line off, or the roll is refused", async () => {
    const { listeners } = foundryAt(1000);
    const actor = character();
    await addPendingModifier(actor, { label: "Survey", value: 2, skill: "Geology" });

    listeners.push((ctx) => { ctx.modifiers = ctx.modifiers.filter((m: any) => m.key !== "pendingModifier"); });
    expect(await rollSuccess({ actor, base: 10, label: "Geology", kind: "skill", skill: "Geology" })).toMatchObject({ effectiveSkill: 10 });
    expect(pendingModifiers(actor)).toHaveLength(1);

    listeners.length = 0;
    const refused = await rollSuccess({ actor, base: 10, label: "Geology", kind: "skill", skill: "Geology", modifiers: [{ label: "Dark", value: -10 }] });
    expect(refused).toBeNull();
    expect(pendingModifiers(actor)).toHaveLength(1);
  });
});

describe("the modifier dialog", () => {
  it("lists the bonuses held for the roll", async () => {
    foundryAt(1000);
    let content = "";
    (globals.foundry as any).applications.api = { DialogV2: { prompt: async (options: any) => { content = options.content; return 0; } } };
    await promptForModifier([{ label: "Survey", value: 2, key: "pendingModifier" }]);
    expect(content).toContain("GWORLD.Chat.HeldModifiers");
    expect(content).toContain("<li>Survey +2</li>");

    await promptForModifier();
    expect(content).not.toContain("GWORLD.Chat.HeldModifiers");
  });
});
