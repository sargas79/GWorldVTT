import { afterEach, describe, expect, it, vi } from "vitest";

import { rollStunRecovery } from "../knockdown.js";
import { isFrightResistance, rollFrightCheckOutcome } from "../fright.js";
import { PROCEDURE_HOOKS } from "../procedure-extensions.js";

const globals = globalThis as Record<string, unknown>;

afterEach(() => {
  for (const key of ["ChatMessage", "CONST", "foundry", "game", "Hooks", "Roll", "ui"]) delete globals[key];
  vi.restoreAllMocks();
});

function character() {
  return {
    name: "Victim",
    isOwner: true,
    system: { hp: { value: 10, max: 10 }, derived: { attributes: { HT: 10, IQ: 10 }, will: 10, traitEffects: {} }, conditions: { stunned: true } },
    items: [],
    statuses: new Set<string>(["stunned"]),
    effects: [],
    getFlag: () => undefined,
    update: async () => {},
    toggleStatusEffect: async () => {},
  };
}

/** Foundry, as far as the rolls reach: dice that come up as given, and the hooks heard. */
function foundryWith(faces: number[]) {
  const heard: any[] = [];
  const cards: any[] = [];
  globals.ChatMessage = { implementation: { create: async (data: any) => { cards.push(data); return data; }, getSpeaker: () => ({}) } };
  globals.CONST = { CHAT_MESSAGE_STYLES: { OTHER: 0 } };
  globals.foundry = { utils: { escapeHTML: (s: string) => s }, applications: { handlebars: { renderTemplate: async (_p: string, data: any) => JSON.stringify(data) } } };
  globals.game = { i18n: { localize: (k: string) => k, format: (k: string) => k }, settings: { get: () => ({}) } };
  globals.ui = { notifications: { info: () => {} } };
  const listen = (event: string, context: any) => {
    if (event === PROCEDURE_HOOKS.successRollModifiers) {
      heard.push([...context.tags]);
      if (context.tags.includes("stunRecovery")) context.modifiers.push({ label: "Psychic noise", value: -5 });
    }
    return true;
  };
  globals.Hooks = { call: listen, callAll: listen };
  let next = 0;
  globals.Roll = class {
    total = 0;
    dice: Array<{ results: Array<{ result: number }> }> = [];
    async evaluate() {
      const results = [0, 1, 2].map(() => ({ result: faces[next++ % faces.length]! }));
      this.dice = [{ results }];
      this.total = results.reduce((sum, r) => sum + r.result, 0);
      return this;
    }
  };
  return { heard, cards };
}

describe("stun recovery a module can modify (since 1.63.0)", () => {
  it("tags the roll and counts what the listeners add", async () => {
    const { heard, cards } = foundryWith([3, 3, 3]);
    // HT 10 - 5 = 5 against a 9: still stunned.
    const recovered = await rollStunRecovery({ actor: character() });
    expect(heard[0]).toEqual(["stunRecovery", "HT"]);
    expect(recovered).toBe(false);
    expect(String(cards[0]?.content)).toContain("\"target\":5");
  });
});

describe("an affliction resisted with a Fright Check (since 1.63.0)", () => {
  it("knows the resistance by name", () => {
    expect(isFrightResistance("Fright")).toBe(true);
    expect(isFrightResistance("HT")).toBe(false);
  });

  it("returns the margin with the table's entry, and passes the resist tags on", async () => {
    const { heard } = foundryWith([6, 6, 5]);
    const outcome = await rollFrightCheckOutcome({ actor: character(), modifier: -5, tags: ["resist", "affliction"] });
    expect(heard[0]).toEqual(["fright", "will", "resist", "affliction"]);
    expect(outcome?.success).toBe(false);
    expect(outcome?.margin).toBeGreaterThan(0);
  });
});
