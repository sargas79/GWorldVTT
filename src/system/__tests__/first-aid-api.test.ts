import { afterEach, describe, expect, it, vi } from "vitest";

import { createApi } from "../api.js";
import { PROCEDURE_HOOKS } from "../procedure-extensions.js";

const globals = globalThis as Record<string, unknown>;

afterEach(() => {
  for (const key of ["ChatMessage", "CONST", "foundry", "game", "Hooks", "Roll", "ui", "canvas"]) delete globals[key];
  vi.restoreAllMocks();
});

/** A character First Aid reads and writes, bleeding where asked. */
function character(name: string, options: { hp?: number; bleeding?: boolean } = {}) {
  const statuses = new Set<string>(options.bleeding ? ["bleeding"] : []);
  return {
    name,
    uuid: `Actor.${name}`,
    id: name,
    isOwner: true,
    system: { hp: { value: options.hp ?? 10, max: 10 }, tl: 8, derived: { attributes: { HT: 10, IQ: 10 }, recovery: { firstAid: 12 } }, sm: 0 },
    items: [],
    statuses,
    effects: [],
    getFlag: () => undefined,
    setFlag: async () => {},
    unsetFlag: async () => {},
    update: async function (this: any, data: Record<string, unknown>) {
      if (typeof data["system.hp.value"] === "number") this.system.hp.value = data["system.hp.value"];
    },
    toggleStatusEffect: async (id: string, { active }: { active: boolean }) => { if (active) statuses.add(id); else statuses.delete(id); },
  };
}

/**
 * Foundry, as far as First Aid reaches: every die comes up 3, and `onFirstAid`
 * is a gworld.firstAid listener.
 */
function foundryWith(onFirstAid: (context: any) => void = () => {}) {
  const heard: any[] = [];
  const cards: any[] = [];
  globals.ChatMessage = { implementation: { create: async (data: any) => { cards.push(data); return data; }, getSpeaker: () => ({}) } };
  globals.CONST = { CHAT_MESSAGE_STYLES: { OTHER: 0 } };
  globals.foundry = { utils: { escapeHTML: (s: string) => s }, applications: { handlebars: { renderTemplate: async (_path: string, data: any) => JSON.stringify(data) } } };
  globals.game = { i18n: { localize: (k: string) => k, format: (k: string, d: any) => `${k}:${JSON.stringify(d)}` }, settings: { get: () => ({}) }, user: { id: "gm" } };
  globals.ui = { notifications: { warn: vi.fn(), info: vi.fn() } };
  const listen = (event: string, context: any) => {
    if (event === PROCEDURE_HOOKS.firstAid) {
      heard.push({ ...context });
      onFirstAid(context);
    }
    return true;
  };
  globals.Hooks = { call: listen, callAll: listen };
  globals.Roll = class {
    formula: string;
    total = 0;
    dice: Array<{ results: Array<{ result: number }> }> = [];
    constructor(formula: string) { this.formula = formula; }
    async evaluate() {
      const count = Number(/^(\d+)d6/.exec(this.formula)?.[1] ?? 0);
      const results = Array.from({ length: count }, () => ({ result: 3 }));
      this.dice = [{ results }];
      this.total = results.reduce((sum, r) => sum + r.result, 0) + Number(/([+-])\s*(\d+)$/.exec(this.formula)?.slice(1).join("") ?? 0);
      return this;
    }
  };
  return { heard, cards };
}

/** actors.firstAid makes the sheet button's whole attempt (sargas79/GWorldVTT#733). */
describe("First Aid from the API", () => {
  it("fires gworld.firstAid, starting at the TL the caller gave, and treats at the TL a listener sets", async () => {
    const { heard, cards } = foundryWith((context) => { context.techLevel = 5; });
    const healer = character("Medic");
    const patient = character("Patient", { hp: 4 });
    const restored = await createApi().actors.firstAid({ healer, patient, techLevel: 9 });
    expect(heard).toHaveLength(1);
    expect(heard[0]).toMatchObject({ healer, patient, techLevel: 9, refusal: null, stopsBleeding: true });
    expect(restored).toBeGreaterThan(0);
    // The card's detail names the TL it was given at: the listener's, not the caller's.
    expect(String(cards[0]?.content)).toContain('\\"tl\\":5');
  });

  it("starts the listeners at the healer's own TL where the caller gave none", async () => {
    const { heard } = foundryWith();
    await createApi().actors.firstAid({ healer: character("Medic"), patient: character("Patient", { hp: 4 }) });
    expect(heard[0]?.techLevel).toBe(8);
  });

  it("rolls nothing where a listener refuses, and says why", async () => {
    const { cards } = foundryWith((context) => { context.refusal = "No supplies"; });
    const patient = character("Patient", { hp: 4 });
    const restored = await createApi().actors.firstAid({ healer: character("Medic"), patient });
    expect(restored).toBe(0);
    expect(cards).toHaveLength(0);
    expect(patient.system.hp.value).toBe(4);
    expect((globals.ui as any).notifications.warn).toHaveBeenCalledWith("No supplies");
  });

  it("stops the bleeding on a success, as the button does", async () => {
    foundryWith();
    const patient = character("Patient", { hp: 4, bleeding: true });
    await createApi().actors.firstAid({ healer: character("Medic"), patient });
    expect(patient.statuses.has("bleeding")).toBe(false);
  });

  it("leaves the bleeding where a listener says the bandage won't stop it", async () => {
    foundryWith((context) => { context.stopsBleeding = false; });
    const patient = character("Patient", { hp: 4, bleeding: true });
    await createApi().actors.firstAid({ healer: character("Medic"), patient });
    expect(patient.statuses.has("bleeding")).toBe(true);
    expect((globals.ui as any).notifications.info).toHaveBeenCalled();
  });
});
