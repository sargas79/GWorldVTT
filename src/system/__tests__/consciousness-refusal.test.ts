import { afterEach, describe, expect, it, vi } from "vitest";

import { addConsciousnessControls } from "../consciousness.js";

/** The consciousness roll's button, when the roll is refused below 3 (sargas79/GWorldVTT#753). */

const globals = globalThis as Record<string, unknown>;

afterEach(() => {
  for (const key of ["ChatMessage", "CONST", "CONFIG", "document", "foundry", "fromUuid", "game", "Hooks", "Roll", "ui"]) delete globals[key];
  vi.restoreAllMocks();
});

/** Just enough of an element for the card's controls, with its click handler kept. */
class FakeElement {
  children: FakeElement[] = [];
  dataset: Record<string, string> = {};
  className = "";
  type = "";
  textContent = "";
  disabled = false;
  listener: (() => unknown) | null = null;
  append(...nodes: FakeElement[]) { this.children.push(...nodes); }
  addEventListener(_event: string, listener: () => unknown) { this.listener = listener; }
  querySelector(selector: string) { return selector === ".gworld-chat" ? this : null; }
}

/** A character below 0 HP with the HT given, whose updates land on it. */
function character(ht: number) {
  const actor: any = {
    name: "Hurt",
    uuid: "Actor.hurt",
    isOwner: true,
    system: {
      hp: { value: -5, max: 10 },
      posture: "standing",
      attributes: { HT: ht },
      derived: { attributes: { ST: 10, DX: 10, IQ: 10, HT: ht }, traitEffects: {} },
    },
    items: [],
    statuses: new Set<string>(),
    effects: [],
    getFlag: () => undefined,
    update: async () => actor,
    toggleStatusEffect: async (id: string, { active }: { active: boolean }) => {
      if (active) actor.statuses.add(id);
      else actor.statuses.delete(id);
    },
  };
  return actor;
}

/** Foundry, with dice that always come up 3 and every card kept. */
function foundry(actor: any) {
  const cards: any[] = [];
  globals.ChatMessage = { implementation: { create: async (data: any) => { cards.push(data); return data; }, getSpeaker: () => ({}) } };
  globals.CONST = { CHAT_MESSAGE_STYLES: { OTHER: 0 } };
  globals.CONFIG = { ChatMessage: { modes: { public: {}, gm: {}, blind: {}, self: {} } } };
  globals.document = { createElement: () => new FakeElement() };
  globals.foundry = {
    utils: { escapeHTML: (s: string) => s, deepClone: (o: any) => structuredClone(o), mergeObject: (a: any, b: any) => ({ ...a, ...b }) },
    applications: { handlebars: { renderTemplate: async (_path: string, data: any) => JSON.stringify(data) } },
  };
  globals.fromUuid = async () => actor;
  globals.game = { i18n: { localize: (k: string) => k, format: (k: string) => k }, settings: { get: () => ({}) }, user: { id: "gm" } };
  globals.ui = { notifications: { warn: vi.fn(), info: vi.fn() } };
  globals.Hooks = { call: () => true, callAll: () => true };
  globals.Roll = class {
    total = 3;
    dice = [{ results: [{ result: 1 }, { result: 1 }, { result: 1 }] }];
    async evaluate() { return this; }
  };
  return cards;
}

/** The card's button for the roll, and a press of it that waits for the roll. */
async function buttonFor(actor: any, modifier: number) {
  const root = new FakeElement();
  const entries = [{ uuid: actor.uuid, name: actor.name, modifier }];
  await addConsciousnessControls({ getFlag: () => entries }, root as unknown as HTMLElement);
  const button = root.children[0]!.children[1]!;
  return { button, press: async () => { await button.listener?.(); } };
}

describe("the consciousness roll's button (Campaigns p. 419)", () => {
  it("is usable again after a roll refused below 3", async () => {
    const actor = character(5);
    const cards = foundry(actor);
    const { button, press } = await buttonFor(actor, -4);
    await press();
    expect(JSON.parse(String(cards[0].content))).toMatchObject({ refused: true, effective: 1 });
    expect(button.disabled).toBe(false);
  });

  it("stays pressed once the roll is made", async () => {
    const actor = character(12);
    const cards = foundry(actor);
    const { button, press } = await buttonFor(actor, -1);
    await press();
    expect(cards[0].rolls).toHaveLength(1);
    expect(button.disabled).toBe(true);
  });
});
