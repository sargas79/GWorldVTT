import { afterEach, describe, expect, it, vi } from "vitest";

import { rollOnce } from "../card-buttons.js";
import { addConsciousnessControls, rollConsciousness } from "../consciousness.js";
import { PROCEDURE_HOOKS } from "../procedure-extensions.js";

/**
 * A card's roll button after a roll that was refused (sargas79/GWorldVTT#753):
 * the button comes back, so the card's roll can still be made.
 */

const globals = globalThis as Record<string, unknown>;

afterEach(() => {
  for (const key of ["ChatMessage", "CONST", "CONFIG", "foundry", "game", "Hooks", "Roll", "ui", "document", "fromUuid"]) delete globals[key];
  vi.restoreAllMocks();
});

/** Resolves once the promises queued so far have run. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

/** A button, as far as the card's controls use one. */
function fakeButton() {
  const listeners: Array<() => unknown> = [];
  return {
    disabled: false,
    listeners,
    addEventListener: (_event: string, listener: () => unknown) => listeners.push(listener),
    click() {
      for (const listener of listeners) void listener();
    },
  };
}

describe("rollOnce", () => {
  it("keeps the button out of use once the roll was made", async () => {
    const button = fakeButton();
    const roll = vi.fn(async () => ({ success: true }));
    await rollOnce(button as any, roll)();
    expect(button.disabled).toBe(true);
    // And a second press does nothing.
    await rollOnce(button as any, roll)();
    expect(roll).toHaveBeenCalledTimes(1);
  });

  it("counts a roll that resolves to nothing as made", async () => {
    const button = fakeButton();
    await rollOnce(button as any, async () => undefined)();
    expect(button.disabled).toBe(true);
  });

  it("gives the button back when the roll was refused", async () => {
    for (const refused of [null, false]) {
      const button = fakeButton();
      await rollOnce(button as any, async () => refused)();
      expect(button.disabled).toBe(false);
    }
  });

  it("holds the button while the roll is made", async () => {
    const button = fakeButton();
    let finish: (value: unknown) => void = () => {};
    const pressed = rollOnce(button as any, () => new Promise((resolve) => { finish = resolve; }))();
    expect(button.disabled).toBe(true);
    finish(null);
    await pressed;
    expect(button.disabled).toBe(false);
  });

  it("gives the button back when the roll threw", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const button = fakeButton();
    await rollOnce(button as any, async () => { throw new Error("no"); })();
    expect(button.disabled).toBe(false);
  });
});

/** A character at 0 HP or less, owed a roll to stay conscious. */
function character() {
  return {
    name: "Victim",
    uuid: "Actor.Victim",
    isOwner: true,
    system: {
      hp: { value: -5, max: 10 },
      fp: { value: 10, max: 10 },
      posture: "standing",
      derived: { attributes: { ST: 10, DX: 10, IQ: 10, HT: 10 }, traitEffects: {} },
    },
    items: [],
    statuses: new Set<string>(),
    effects: [],
    getFlag: () => undefined,
    update: vi.fn(),
  };
}

/** Foundry, with a listener that refuses every success roll while `refusing` says so. */
function foundry(refusing: { now: boolean }) {
  const cards: any[] = [];
  globals.ChatMessage = { implementation: { create: async (data: any) => { cards.push(data); return data; }, getSpeaker: () => ({}) } };
  globals.CONST = { CHAT_MESSAGE_STYLES: { OTHER: 0 } };
  globals.CONFIG = { ChatMessage: { modes: { public: {}, gm: {}, blind: {}, self: {} } } };
  globals.foundry = {
    utils: { escapeHTML: (s: string) => s, deepClone: (o: any) => structuredClone(o), mergeObject: (a: any, b: any) => ({ ...a, ...b }) },
    applications: { handlebars: { renderTemplate: async (_path: string, data: any) => JSON.stringify(data) } },
  };
  globals.game = { i18n: { localize: (k: string) => k, format: (k: string) => k }, settings: { get: () => ({}) }, user: { id: "gm" } };
  globals.ui = { notifications: { warn: vi.fn(), info: vi.fn() } };
  const listen = (event: string, context: any) => {
    if (event === PROCEDURE_HOOKS.successRollModifiers && refusing.now) context.refusal = "Not now";
    return true;
  };
  globals.Hooks = { call: listen, callAll: listen };
  globals.Roll = class {
    total = 9;
    dice = [{ results: [{ result: 3 }, { result: 3 }, { result: 3 }] }];
    async evaluate() { return this; }
  };
  return cards;
}

describe("the roll to stay conscious", () => {
  it("says whether it was made", async () => {
    const refusing = { now: true };
    foundry(refusing);
    expect(await rollConsciousness(character(), -1)).toBe(false);
    refusing.now = false;
    expect(await rollConsciousness(character(), -1)).toBe(true);
    expect(await rollConsciousness({ ...character(), isOwner: false }, -1)).toBe(false);
  });

  it("keeps its button on the card after a refusal, and can then be rolled", async () => {
    const refusing = { now: true };
    const cards = foundry(refusing);
    const actor = character();
    globals.fromUuid = async () => actor;
    const buttons: ReturnType<typeof fakeButton>[] = [];
    const element = () => ({ dataset: {} as Record<string, string>, append: () => {}, textContent: "", className: "", type: "" });
    globals.document = {
      createElement: (tag: string) => {
        if (tag !== "button") return element();
        const button = Object.assign(fakeButton(), element());
        buttons.push(button);
        return button;
      },
    };
    const root = { querySelector: () => null, append: () => {} };
    const html = { querySelector: () => root };
    const message = { getFlag: () => [{ uuid: actor.uuid, name: actor.name, modifier: -1 }] };
    await addConsciousnessControls(message, html as any);
    expect(buttons).toHaveLength(1);
    const button = buttons[0]!;

    button.click();
    await settle();
    expect(JSON.parse(String(cards.at(-1).content)).refused).toBe(true);
    expect(button.disabled).toBe(false);

    refusing.now = false;
    button.click();
    await settle();
    expect(JSON.parse(String(cards.at(-1).content)).outcome).toMatchObject({ success: true });
    expect(button.disabled).toBe(true);
  });
});
