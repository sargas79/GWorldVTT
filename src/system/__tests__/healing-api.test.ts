import { afterEach, describe, expect, it, vi } from "vitest";

import { rollMortalWound } from "../dying.js";
import { PROCEDURE_HOOKS } from "../procedure-extensions.js";
import { applyFirstAid, attendPatient, operate } from "../recovery.js";

const globals = globalThis as Record<string, unknown>;

afterEach(() => {
  for (const key of ["ChatMessage", "CONST", "foundry", "game", "Hooks", "Roll", "ui", "canvas"]) delete globals[key];
  vi.restoreAllMocks();
});

/** A character the healing procedures read and write. */
function character(name: string, hp = 5, max = 10) {
  return {
    name,
    uuid: `Actor.${name}`,
    isOwner: true,
    system: { hp: { value: hp, max }, tl: 9, derived: { attributes: { HT: 10, IQ: 10 }, recovery: { firstAid: 8 } }, sm: 0 },
    items: [],
    statuses: new Set<string>(),
    effects: [],
    getFlag: () => undefined,
    setFlag: async () => {},
    update: async function (this: any, data: Record<string, unknown>) {
      if (typeof data["system.hp.value"] === "number") this.system.hp.value = data["system.hp.value"];
    },
    toggleStatusEffect: async () => {},
  };
}

/** Foundry, as far as the procedures reach, with dice that come up as given and every hook heard. */
function foundryWith(faces: number[]) {
  const heard: any[] = [];
  const cards: any[] = [];
  globals.ChatMessage = { implementation: { create: async (data: any) => { cards.push(data); return data; }, getSpeaker: () => ({}) } };
  globals.CONST = { CHAT_MESSAGE_STYLES: { OTHER: 0 } };
  globals.foundry = { utils: { escapeHTML: (s: string) => s }, applications: { handlebars: { renderTemplate: async (_path: string, data: any) => JSON.stringify(data) } } };
  globals.game = { i18n: { localize: (k: string) => k, format: (k: string, d: any) => `${k}:${JSON.stringify(d)}` }, settings: { get: () => ({}) } };
  const listen = (event: string, context: any) => {
    if (event === PROCEDURE_HOOKS.successRollModifiers) {
      heard.push({ tags: [...context.tags], skill: context.skill, base: context.base });
      if (context.tags.includes("physician")) context.modifiers.push({ label: "Medical bed", value: 3 });
      if (context.tags.includes("mortalWound")) context.modifiers.push({ label: "Life support", value: 2 });
      if (context.tags.includes("surgery")) context.modifiers.push({ label: "Operating theatre", value: 2 });
    }
    if (event === PROCEDURE_HOOKS.mortalWoundInterval && context.traumaMaintenance) {
      context.minutes = 1440;
      context.label = "Life support";
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
      const count = Number(/^(\d+)d6/.exec(this.formula)?.[1] ?? 0);
      const results = Array.from({ length: count }, () => ({ result: faces[next++ % faces.length]! }));
      this.dice = [{ results }];
      this.total = results.reduce((sum, r) => sum + r.result, 0) + Number(/([+-])\s*(\d+)$/.exec(this.formula)?.slice(1).join("") ?? 0);
      return this;
    }
  };
  return { heard, cards };
}

/** The healing procedures a module runs (sargas79/GWorldVTT#463). */
describe("a module's healing", () => {
  it("gives First Aid at a device's own skill and TL", async () => {
    const { heard, cards } = foundryWith([4, 4, 4, 3]);
    const patient = character("Patient", 5, 10);
    const gained = await applyFirstAid({ healer: patient, patient, modifier: 0, skill: 14, techLevel: 10, label: "Pocket medic" });
    expect(heard[0]).toMatchObject({ tags: ["firstAid"], base: 14 });
    expect(gained).toBeGreaterThan(0);
    expect(String(cards[0]?.content)).toContain("Pocket medic");
  });

  it("tags a physician's rounds, and adds what the modules put there", async () => {
    const { heard, cards } = foundryWith([5, 5, 5]);
    const healer = character("Doc");
    const patient = character("Patient", 5, 10);
    // Physician 12, +3 from the medical bed: 15 against a roll of 15, a success worth 1 HP.
    await attendPatient({ healer, patient, modifier: 0, skill: 12, label: "Suit doc" });
    expect(heard[0]).toMatchObject({ tags: ["physician"], skill: "Physician", base: 12 });
    expect(String(cards[0]?.content)).toContain("\"target\":15");
    expect(String(cards[0]?.content)).toContain("Suit doc");
    expect(patient.system.hp.value).toBe(6);
  });

  it("tags an operation", async () => {
    const { heard } = foundryWith([3, 3, 3]);
    await operate({ surgeon: character("Automed"), patient: character("Patient"), anesthetic: true, repairingCrippled: false, equipmentQuality: 0, modifier: 0, skill: 13, techLevel: 9 });
    expect(heard[0]).toMatchObject({ tags: ["surgery"], skill: "Surgery", base: 13 });
  });

  it("tags the mortal wound check, trauma maintenance and all", async () => {
    const { heard, cards } = foundryWith([4, 4, 4]);
    const actor = character("Dying", -12, 10);
    await rollMortalWound({ actor, physician: 12, traumaMaintenance: true, modifier: 1 });
    expect(heard[0]?.tags).toEqual(["mortalWound", "traumaMaintenance"]);
    // Physician 12 is better than HT 10; +1 given and +2 from the unit.
    expect(String(cards[0]?.content)).toContain("\"target\":15");
    // The unit's care makes the check daily (since 1.63.0).
    expect(String(cards[0]?.content)).toContain("GWORLD.Dying.EveryDays");
    expect(String(cards[0]?.content)).toContain("Life support");
  });
});
