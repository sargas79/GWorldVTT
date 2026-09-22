import { afterEach, describe, expect, it, vi } from "vitest";

import { createApi } from "../api.js";
import { POISON_FLAG } from "../poison.js";
import { PROCEDURE_HOOKS } from "../procedure-extensions.js";

const globals = globalThis as Record<string, unknown>;

afterEach(() => {
  for (const key of ["ChatMessage", "CONST", "foundry", "game", "Hooks", "Roll", "ui", "canvas"]) delete globals[key];
  vi.restoreAllMocks();
});

/** A character the treatments read and write. */
function character(name: string, options: { items?: any[]; tl?: number } = {}) {
  const flags: Record<string, unknown> = {};
  const statuses = new Set<string>();
  return {
    name,
    uuid: `Actor.${name}`,
    id: name,
    isOwner: true,
    system: { hp: { value: 10, max: 10 }, fp: { value: 10, max: 10 }, tl: options.tl ?? 8, derived: { attributes: { HT: 10, DX: 10, IQ: 10 } }, sm: 0 },
    items: options.items ?? [],
    statuses,
    effects: [],
    getFlag: (_scope: string, key: string) => flags[key],
    setFlag: async (_scope: string, key: string, value: unknown) => { flags[key] = value; },
    unsetFlag: async (_scope: string, key: string) => { delete flags[key]; },
    update: async () => {},
    toggleStatusEffect: async (id: string, { active }: { active: boolean }) => { if (active) statuses.add(id); else statuses.delete(id); },
  };
}

/** A dose already at work, for the treatments to act on. */
function dosed(actor: ReturnType<typeof character>, illness = false) {
  return actor.setFlag("gworld", POISON_FLAG, [{
    id: "d1", name: "Venom", resistanceModifier: -2, damage: "toxic", dice: 1, adds: 0, damageMultiplier: 1,
    intervalSeconds: 60, cycles: 3, cyclesSuffered: 0, delaySeconds: 0, treatment: 0, reference: "", ...(illness ? { illness: true } : {}),
  }]);
}

/** Foundry, as far as the treatments reach: dice that come up as given, settings as given. */
function foundryWith(faces: number[], settings: Record<string, unknown> = {}) {
  const cards: any[] = [];
  const rolled: Array<{ tags: string[]; skill: string; base: number }> = [];
  globals.ChatMessage = { implementation: { create: async (data: any) => { cards.push(data); return data; }, getSpeaker: () => ({}) } };
  globals.CONST = { CHAT_MESSAGE_STYLES: { OTHER: 0 } };
  globals.foundry = { utils: { escapeHTML: (s: string) => s }, applications: { handlebars: { renderTemplate: async (_path: string, data: any) => JSON.stringify(data) } } };
  globals.game = {
    i18n: { localize: (k: string) => k, format: (k: string, d: any) => `${k}:${JSON.stringify(d)}` },
    settings: { get: (_scope: string, key: string) => (key in settings ? settings[key] : {}) },
    user: { id: "gm" },
  };
  globals.ui = { notifications: { warn: vi.fn(), info: vi.fn() } };
  const listen = (event: string, context: any) => {
    if (event === PROCEDURE_HOOKS.successRollModifiers) rolled.push({ tags: [...context.tags], skill: context.skill, base: context.base });
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
  return { cards, rolled };
}

const card = (cards: any[], index = 0) => JSON.parse(String(cards[index]?.content));

/** Treating poisons and illness from a module (sargas79/GWorldVTT#600). */
describe("a module's treatments", () => {
  it("gives a module's own treatment its bonus with no roll", async () => {
    const { cards } = foundryWith([6, 6, 6]);
    const patient = character("Patient");
    await dosed(patient);
    const bonus = await createApi().actors.treatPoison(patient, "d1", { bonus: 4, label: "Antitoxin injector" });
    expect(bonus).toBe(4);
    expect((patient.getFlag("gworld", POISON_FLAG) as any[])[0].treatment).toBe(4);
    expect(card(cards).treatment).toBe("Antitoxin injector");
    expect(card(cards).dice).toBeUndefined();
  });

  it("rolls a module's treatment at a stand-in skill, and gives nothing on a failure", async () => {
    const { cards } = foundryWith([5, 5, 5]);
    const patient = character("Patient");
    await dosed(patient);
    // Skill 12, -1: 11 against 15.
    const bonus = await createApi().actors.treatPoison(patient, "d1", { bonus: 3, skill: 12, modifier: -1 });
    expect(bonus).toBe(0);
    expect(card(cards).target).toBe(11);
    expect((patient.getFlag("gworld", POISON_FLAG) as any[])[0].treatment).toBe(0);
  });

  it("runs the book's treatments at the healer's better skill, the best one standing", async () => {
    foundryWith([3, 3, 3]);
    const firstAid = { type: "skill", name: "First Aid", system: { derived: { level: 11 } } };
    const physician = { type: "skill", name: "Physician", system: { derived: { level: 13 } } };
    const patient = character("Patient", { tl: 8 });
    await dosed(patient);
    const api = createApi();
    const medical = await api.actors.treatPoison(patient, "d1", { treatment: "medical", healer: character("Doc", { items: [firstAid, physician] }) });
    // TL8 / 2 = +4.
    expect(medical).toBe(4);
    await api.actors.treatPoison(patient, "d1", { treatment: "suckWound", skill: 14 });
    expect((patient.getFlag("gworld", POISON_FLAG) as any[])[0].treatment).toBe(4);
  });

  it("fails a book's treatment nobody has the skill for", async () => {
    const { cards } = foundryWith([3, 3, 3]);
    const patient = character("Patient");
    await dosed(patient);
    expect(await createApi().actors.treatPoison(patient, "d1", { treatment: "induceVomiting" })).toBe(0);
    expect(card(cards).noSkill).toBe(true);
  });

  it("adds a module's bonus to an illness's antibiotics", async () => {
    const { cards } = foundryWith([3, 3, 3]);
    const patient = character("Patient", { tl: 8 });
    await dosed(patient, true);
    const bonus = await createApi().actors.treatIllness(patient, "d1", { antibiotics: true, bonus: 2, label: "Broad-spectrum course" });
    expect(bonus).toBe(5);
    expect(card(cards).treatment).toBe("Broad-spectrum course");
  });
});

describe("a module's resuscitation", () => {
  it("revives at a device's stand-in skill and TL, as a Physician roll", async () => {
    const { cards, rolled } = foundryWith([4, 4, 4]);
    const patient = character("Drowned");
    patient.statuses.add("unconscious");
    // The device's owner is TL3; its own skill is TL8.
    await createApi().actors.resuscitate({ healer: character("Nurse", { tl: 3 }), patient, cause: "drowning", skill: 12, techLevel: 8, label: "Resuscitator" });
    expect(rolled[0]).toMatchObject({ tags: ["resuscitation", "drowning"], skill: "Physician", base: 12 });
    expect(card(cards).target).toBe(12);
    expect(card(cards).detail).toContain("Resuscitator");
    expect(patient.statuses.has("unconscious")).toBe(false);
  });

  it("takes First Aid's penalty for a stand-in First Aid, and CPR's lesser one", async () => {
    const { cards, rolled } = foundryWith([6, 6, 6]);
    await createApi().actors.resuscitate({ healer: character("Kit"), patient: character("Drowned"), cause: "drowning", cpr: true, skill: 12, skillKind: "firstAid" });
    expect(rolled[0]).toMatchObject({ skill: "First Aid", base: 12 });
    expect(card(cards).target).toBe(10);
  });
});

describe("the Control Rating", () => {
  it("reads the world's rating where the legality rule is on", () => {
    foundryWith([3], { controlRating: "4", optionalRules: { legalityClass: true } });
    expect(createApi().world.controlRating()).toEqual({ rating: 4, inPlay: true });
  });

  it("has none where the rule is off", () => {
    foundryWith([3], { controlRating: "4", optionalRules: { legalityClass: false } });
    expect(createApi().world.controlRating()).toEqual({ rating: null, inPlay: false });
  });
});
