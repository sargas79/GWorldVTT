import { afterEach, describe, expect, it, vi } from "vitest";

import { createApi } from "../api.js";
import { PROCEDURE_HOOKS } from "../procedure-extensions.js";
import { attendPatient } from "../recovery.js";

const globals = globalThis as Record<string, unknown>;

afterEach(() => {
  for (const key of ["ChatMessage", "CONST", "foundry", "game", "Hooks", "Roll", "ui", "canvas"]) delete globals[key];
  vi.restoreAllMocks();
});

/** A character a physician's rounds read and write: a TL8 doctor with Physician/TL 14 by default. */
function character(name: string, options: { hp?: number; physician?: Record<string, unknown> | null } = {}) {
  const physician = options.physician === undefined ? { type: "skill", name: "Physician/TL", system: { attribute: "IQ", derived: { level: 14 } } } : options.physician;
  return {
    name,
    uuid: `Actor.${name}`,
    id: name,
    isOwner: true,
    system: { hp: { value: options.hp ?? 5, max: 10 }, tl: 8, derived: { attributes: { HT: 10, IQ: 10 } }, sm: 0 },
    items: physician ? [physician] : [],
    statuses: new Set<string>(),
    effects: [],
    getFlag: () => undefined,
    setFlag: async () => {},
    unsetFlag: async () => {},
    update: async function (this: any, data: Record<string, unknown>) {
      if (typeof data["system.hp.value"] === "number") this.system.hp.value = data["system.hp.value"];
    },
  };
}

/**
 * Foundry, as far as the rounds reach: every die comes up 3, the optional
 * rules are all on, `onRounds` is a gworld.physicianRounds listener and
 * `onRoll` a gworld.successRollModifiers one.
 */
function foundryWith(onRounds: (context: any) => void = () => {}, onRoll: (context: any) => void = () => {}) {
  const heard: any[] = [];
  const rolls: any[] = [];
  const cards: any[] = [];
  globals.ChatMessage = { implementation: { create: async (data: any) => { cards.push(data); return data; }, getSpeaker: () => ({}) } };
  globals.CONST = { CHAT_MESSAGE_STYLES: { OTHER: 0 } };
  globals.foundry = { utils: { escapeHTML: (s: string) => s }, applications: { handlebars: { renderTemplate: async (_path: string, data: any) => JSON.stringify(data) } } };
  globals.game = { i18n: { localize: (k: string) => k, format: (k: string, d: any) => `${k}:${JSON.stringify(d)}` }, settings: { get: () => ({}) }, user: { id: "gm" } };
  globals.ui = { notifications: { warn: vi.fn(), info: vi.fn() } };
  const listen = (event: string, context: any) => {
    if (event === PROCEDURE_HOOKS.physicianRounds) {
      heard.push({ ...context });
      onRounds(context);
    }
    if (event === PROCEDURE_HOOKS.successRollModifiers) {
      onRoll(context);
      rolls.push({ tags: [...context.tags], modifiers: context.modifiers.map((line: any) => ({ ...line })) });
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
      this.total = results.reduce((sum, r) => sum + r.result, 0);
      return this;
    }
  };
  return { heard, rolls, cards };
}

const content = (card: any) => String(card?.content);

/** A physician's rounds at another tech level, as First Aid can be (sargas79/GWorldVTT#734). */
describe("a physician's rounds and gworld.physicianRounds", () => {
  it("fires with the healer, the patient and the Physician skill's TL, and rolls as before where nothing moves", async () => {
    const { heard, rolls, cards } = foundryWith();
    const healer = character("Doc");
    const patient = character("Patient");
    await createApi().actors.attendPatient({ healer, patient });
    expect(heard).toHaveLength(1);
    expect(heard[0]).toMatchObject({ healer, patient, refusal: null, techLevel: 8, lines: [] });
    expect(rolls[0]).toEqual({ tags: ["physician"], modifiers: [] });
    expect(content(cards[0])).toContain('"target":14');
    expect(content(cards[0])).not.toContain("AttendAtTl");
  });

  it("works at the TL a listener sets, with the Tech-Level Modifiers table's line and the TL on the card", async () => {
    const { rolls, cards } = foundryWith((context) => { context.techLevel = 5; });
    await createApi().actors.attendPatient({ healer: character("Doc"), patient: character("Patient") });
    // Three TLs back for an IQ-based skill: -5 (Characters p. 168).
    expect(rolls[0].tags).toEqual(["physician", "techLevel"]);
    expect(rolls[0].modifiers).toEqual([expect.objectContaining({ key: "techLevel", value: -5 })]);
    expect(content(cards[0])).toContain('"target":9');
    expect(content(cards[0])).toContain('GWORLD.Recovery.AttendAtTl:{\\"tl\\":5}');
  });

  it("says the TL on the card but takes no penalty with the Tech-Level Modifiers rule off", async () => {
    const { rolls, cards } = foundryWith((context) => { context.techLevel = 5; });
    (globals.game as any).settings.get = () => ({ techLevelModifiers: false });
    await createApi().actors.attendPatient({ healer: character("Doc"), patient: character("Patient") });
    expect(rolls[0]).toEqual({ tags: ["physician"], modifiers: [] });
    expect(content(cards[0])).toContain('"target":14');
    expect(content(cards[0])).toContain("AttendAtTl");
  });

  it("lets a gworld.successRollModifiers listener change the TL line", async () => {
    const { cards } = foundryWith(
      (context) => { context.techLevel = 5; },
      (context) => { for (const line of context.modifiers) if (line.key === "techLevel") line.value = -1; },
    );
    await createApi().actors.attendPatient({ healer: character("Doc"), patient: character("Patient") });
    expect(content(cards[0])).toContain('"target":13');
  });

  it("starts at the TL the caller gives for a stand-in skill", async () => {
    const { heard, rolls } = foundryWith();
    await createApi().actors.attendPatient({ healer: character("Doc", { physician: null }), patient: character("Patient"), skill: 12, techLevel: 10 });
    expect(heard[0]?.techLevel).toBe(10);
    expect(rolls[0].modifiers).toEqual([]);
  });

  it("starts at the TL recorded for the Physician skill, over the healer's own", async () => {
    const { heard } = foundryWith();
    const healer = character("Doc", { physician: { type: "skill", name: "Physician/TL", system: { attribute: "IQ", techLevel: "6", derived: { level: 13 } } } });
    await attendPatient({ healer, patient: character("Patient"), modifier: 0 });
    expect(heard[0]?.techLevel).toBe(6);
  });

  it("puts a listener's lines on the card", async () => {
    const { cards } = foundryWith((context) => { context.lines.push("No antiseptic to hand"); });
    await createApi().actors.attendPatient({ healer: character("Doc"), patient: character("Patient") });
    expect(content(cards[0])).toContain("No antiseptic to hand");
  });

  it("rolls nothing, and asks for no modifier, where a listener refuses", async () => {
    const { cards } = foundryWith((context) => { context.refusal = "No doctor on the ward"; });
    const patient = character("Patient");
    const ask = vi.fn(async () => 0);
    await attendPatient({ healer: character("Doc"), patient, modifier: ask });
    expect(ask).not.toHaveBeenCalled();
    expect(cards).toHaveLength(0);
    expect(patient.system.hp.value).toBe(5);
    expect((globals.ui as any).notifications.warn).toHaveBeenCalledWith("No doctor on the ward");
  });

  it("asks for the modifier once the listeners agree, and stops where it is cancelled", async () => {
    const { cards } = foundryWith();
    await attendPatient({ healer: character("Doc"), patient: character("Patient"), modifier: async () => 2 });
    expect(content(cards[0])).toContain('"target":16');
    await attendPatient({ healer: character("Doc"), patient: character("Patient"), modifier: async () => null });
    expect(cards).toHaveLength(1);
  });

  it("refuses a TL four or more ahead of the skill", async () => {
    const { cards } = foundryWith((context) => { context.techLevel = 12; });
    await createApi().actors.attendPatient({ healer: character("Doc"), patient: character("Patient") });
    expect(cards).toHaveLength(0);
    expect((globals.ui as any).notifications.warn).toHaveBeenCalled();
  });
});
