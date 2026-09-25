import { afterEach, describe, expect, it, vi } from "vitest";

import { chargeBattleFatigue } from "../battle-fatigue.js";
import { checkInfection, exposeToDisease } from "../disease.js";
import { rollExposure, survivalAgainstWeather } from "../environment.js";
import { spendFatigue } from "../extra-effort.js";
import { controlVehicle } from "../hazards.js";
import { advancePoison, POISON_FLAG } from "../poison.js";
import { PROCEDURE_HOOKS, fatigueCost, reactionModifiers, wornClothing } from "../procedure-extensions.js";
import { rollReaction } from "../reactions.js";
import { resuscitate } from "../recovery.js";
import { diseaseNamed } from "../../rules/disease.js";

const globals = globalThis as Record<string, unknown>;

afterEach(() => {
  for (const key of ["ChatMessage", "CONST", "foundry", "game", "Hooks", "Roll", "ui", "canvas"]) delete globals[key];
  vi.restoreAllMocks();
});

/** A character the procedures read and write. */
function character(name: string, options: { ht?: number; per?: number; fp?: number; items?: any[]; tl?: number } = {}) {
  const flags: Record<string, unknown> = {};
  return {
    name,
    uuid: `Actor.${name}`,
    id: name,
    isOwner: true,
    system: {
      hp: { value: 10, max: 10 },
      fp: { value: options.fp ?? 10, max: 10 },
      tl: options.tl ?? 8,
      derived: { attributes: { HT: options.ht ?? 10, DX: 10, IQ: 10 }, per: options.per ?? 10, will: 10, encumbrance: { level: 0 } },
      sm: 0,
    },
    items: options.items ?? [],
    statuses: new Set<string>(),
    effects: [],
    getFlag: (_scope: string, key: string) => flags[key],
    setFlag: async (_scope: string, key: string, value: unknown) => { flags[key] = value; },
    unsetFlag: async (_scope: string, key: string) => { delete flags[key]; },
    update: async function (this: any, data: Record<string, unknown>) {
      if (typeof data["system.hp.value"] === "number") this.system.hp.value = data["system.hp.value"];
      if (typeof data["system.fp.value"] === "number") this.system.fp.value = data["system.fp.value"];
    },
    toggleStatusEffect: async () => {},
  };
}

type Listener = (event: string, context: any) => void;

/** Foundry, as far as the procedures reach: dice that come up as given, and one listener on every hook. */
function foundryWith(faces: number[], listener: Listener = () => {}) {
  const cards: any[] = [];
  const rolled: Array<{ tags: string[]; kind: string; skill: string; base: number; context: any }> = [];
  globals.ChatMessage = {
    implementation: { create: async (data: any) => { cards.push(data); return data; }, getSpeaker: () => ({}), getWhisperRecipients: () => [] },
  };
  globals.CONST = { CHAT_MESSAGE_STYLES: { OTHER: 0 } };
  globals.foundry = {
    utils: { escapeHTML: (s: string) => s, randomID: () => "id1" },
    applications: { handlebars: { renderTemplate: async (_path: string, data: any) => JSON.stringify(data) } },
  };
  globals.game = {
    i18n: { localize: (k: string) => k, format: (k: string, d: any) => `${k}:${JSON.stringify(d)}` },
    settings: { get: () => ({}) },
    user: { id: "gm" },
  };
  globals.ui = { notifications: { warn: vi.fn(), info: vi.fn() } };
  const listen = (event: string, context: any) => {
    if (event === PROCEDURE_HOOKS.successRollModifiers) {
      rolled.push({ tags: [...context.tags], kind: context.kind, skill: context.skill, base: context.base, context });
    }
    listener(event, context);
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

const card = (cards: any[], i = 0) => JSON.parse(String(cards[i]?.content ?? "{}"));

/** Rolls that used to bypass gworld.successRollModifiers (sargas79/GWorldVTT#599). */
describe("weather exposure", () => {
  it("takes the clothing from a worn-gear listener, and is tagged with the weather", async () => {
    const { cards, rolled } = foundryWith([4, 4, 4], (event, context) => {
      if (event === PROCEDURE_HOOKS.weatherClothing) { context.clothing = "arctic"; context.label = "Parka"; }
      if (event === PROCEDURE_HOOKS.successRollModifiers && context.tags.includes("cold")) context.modifiers.push({ label: "Frostbitten", value: -1 });
    });
    const actor = character("Scout");
    await rollExposure({ actor, heat: false, temperatureF: 20, wetClothes: false, windMph: 0, modifier: 0 });
    expect(rolled[0]).toMatchObject({ tags: ["exposure", "cold", "HT"], kind: "attribute", base: 10 });
    expect(rolled[0]!.context.weather).toEqual({ heat: false, temperatureF: 20, clothing: "arctic", wetClothes: false, windMph: 0 });
    // HT 10, arctic +5, the listener's -1: 14.
    const posted = card(cards);
    expect(posted.target).toBe(14);
    expect(posted.extras.join(" ")).toContain("Parka");
    expect(posted.extras).toContain("Frostbitten -1");
  });

  it("keeps the clothing the GM picked", async () => {
    const { cards } = foundryWith([4, 4, 4], (event, context) => {
      if (event === PROCEDURE_HOOKS.weatherClothing) context.clothing = "arctic";
    });
    await rollExposure({ actor: character("Scout"), heat: false, temperatureF: 20, clothing: "light", wetClothes: false, windMph: 0, modifier: 0 });
    expect(card(cards).target).toBe(5);
  });

  it("assumes winter clothing where nobody says, and ignores a class it doesn't know", async () => {
    const { cards } = foundryWith([4, 4, 4], (event, context) => {
      if (event === PROCEDURE_HOOKS.weatherClothing) context.clothing = "fur";
    });
    expect(wornClothing(character("Scout"))).toBe(null);
    await rollExposure({ actor: character("Scout"), heat: false, temperatureF: 20, wetClothes: false, windMph: 0, modifier: 0 });
    expect(card(cards).target).toBe(10);
  });

  it("rolls HT-based Survival where it beats HT", async () => {
    const survival = { type: "skill", name: "Survival (Arctic)", system: { attribute: "Per", derived: { level: 14 } } };
    const { rolled, cards } = foundryWith([4, 4, 4]);
    const actor = character("Trapper", { ht: 10, per: 12, items: [survival] });
    expect(survivalAgainstWeather(actor, false)).toEqual({ skill: "Survival (Arctic)", level: 12 });
    expect(survivalAgainstWeather(actor, true)).toBe(null);
    await rollExposure({ actor, heat: false, temperatureF: 20, clothing: "winter", wetClothes: false, windMph: 0, modifier: 0 });
    expect(rolled[0]).toMatchObject({ tags: ["exposure", "cold", "survival"], kind: "skill", skill: "Survival (Arctic)", base: 12 });
    expect(card(cards).target).toBe(12);
  });

  it("charges what a fatigue-cost listener says", async () => {
    const { cards } = foundryWith([6, 5, 4], (event, context) => {
      if (event === PROCEDURE_HOOKS.fatigueCost && context.reason === "exposure" && context.details.heat) {
        context.fp += 1;
        context.sources.push("Heavy pack");
      }
    });
    const actor = character("Scout");
    const lost = await rollExposure({ actor, heat: true, temperatureF: 95, wetClothes: false, windMph: 0, modifier: 0 });
    expect(lost).toBe(2);
    expect(actor.system.fp.value).toBe(8);
    expect(card(cards).lost).toBe(2);
  });
});

describe("fatigue costs", () => {
  it("are asked of the listeners, and never go below zero", () => {
    foundryWith([4], (event, context) => {
      if (event === PROCEDURE_HOOKS.fatigueCost) context.fp -= 5;
    });
    expect(fatigueCost({ actor: character("A"), fp: 2, reason: "hiking", exertion: true })).toEqual({ fp: 0, sources: [], parts: [] });
  });

  it("weigh extra effort's changed price against the FP left", async () => {
    foundryWith([4], (event, context) => {
      if (event === PROCEDURE_HOOKS.fatigueCost && context.reason === "extraEffort") context.fp += 2;
    });
    const actor = character("Brawler", { fp: 2 });
    expect(await spendFatigue(actor, 1, "Mighty Blows")).toBe(false);
    expect(actor.system.fp.value).toBe(2);
    actor.system.fp.value = 5;
    expect(await spendFatigue(actor, 1, "Mighty Blows")).toBe(true);
    expect(actor.system.fp.value).toBe(2);
  });

  it("reach a battle's fatigue, and the card names who paid more", async () => {
    const { cards } = foundryWith([4], (event, context) => {
      if (event === PROCEDURE_HOOKS.fatigueCost && context.reason === "battle" && context.details.seconds === 30) {
        context.fp += 1;
        context.sources.push("A hot day");
      }
    });
    const hot = character("Knight");
    // An attack or defense roll in the combat (Campaigns p. 426).
    await hot.setFlag("gworld", "combatState.gworld.foughtIn", { value: ["C1"], lifetime: "combat" });
    await chargeBattleFatigue({ id: "C1", round: 30, combatants: [{ actor: hot }] });
    expect(hot.system.fp.value).toBe(8);
    expect(String(cards[0]?.content)).toContain("GWORLD.BattleFatigue.Changed");
    expect(String(cards[0]?.content)).toContain("A hot day");
  });
});

describe("illness and poison", () => {
  it("tags contagion and infection", async () => {
    const { rolled } = foundryWith([3, 4, 4], (event, context) => {
      if (event === PROCEDURE_HOOKS.successRollModifiers && context.tags.includes("contagion")) context.modifiers.push({ label: "Mask", value: 2 });
    });
    const actor = character("Traveller");
    const flu = diseaseNamed("Influenza")!;
    await exposeToDisease({ actor, disease: flu, exposures: ["spokeCloseQuarters"] });
    expect(rolled[0]).toMatchObject({ tags: ["disease", "contagion", "HT"], kind: "attribute", base: 10 });
    expect(rolled[0]!.context.disease.name).toBe("Influenza");
    await checkInfection({ actor, dirt: ["clean"] });
    expect(rolled[1]).toMatchObject({ tags: ["disease", "infection", "HT"] });
    expect(rolled[1]!.context.disease.name).toBe("Infection");
  });

  it("tags a poison's cycle, with the dose", async () => {
    const { rolled, cards } = foundryWith([4, 4, 4, 1], (event, context) => {
      if (event === PROCEDURE_HOOKS.successRollModifiers && context.tags.includes("poison")) context.modifiers.push({ label: "Antitoxin", value: 3 });
    });
    const actor = character("Victim");
    await actor.setFlag("gworld", POISON_FLAG, [{
      id: "d1", name: "Venom", resistanceModifier: -2, damage: "toxic", dice: 1, adds: 0, damageMultiplier: 1,
      intervalSeconds: 60, cycles: 3, cyclesSuffered: 0, delaySeconds: 0, treatment: 0, reference: "",
    }]);
    await advancePoison({ actor, id: "d1" });
    expect(rolled[0]).toMatchObject({ tags: ["poison", "HT"], base: 10 });
    expect(rolled[0]!.context.poison).toMatchObject({ id: "d1", name: "Venom" });
    // HT 10, -2 for the venom, +3 from the listener: 11 against a 12.
    expect(card(cards).target).toBe(11);
  });
});

describe("resuscitation and vehicle control", () => {
  it("tags resuscitation with the cause and the patient", async () => {
    const physician = { type: "skill", name: "Physician", system: { derived: { level: 13 } } };
    const { rolled } = foundryWith([3, 3, 3]);
    const healer = character("Doc", { items: [physician] });
    const patient = character("Drowned");
    await resuscitate({ healer, patient, cause: "drowning", cpr: true, modifier: 0 });
    expect(rolled[0]).toMatchObject({ tags: ["resuscitation", "drowning"], kind: "skill", skill: "Physician", base: 13 });
    expect(rolled[0]!.context.opponent).toBe(patient);
  });

  it("tags a control roll with the vehicle", async () => {
    const driving = { type: "skill", name: "Driving (Automobile)", system: { derived: { level: 12 } } };
    const { rolled, cards } = foundryWith([3, 3, 3], (event, context) => {
      if (event === PROCEDURE_HOOKS.successRollModifiers && context.tags.includes("vehicleControl")) context.modifiers.push({ label: "Stabilizer", value: 2 });
    });
    const car = { name: "Sedan", system: { vehicle: { skill: "Driving (Automobile)", handling: -1, stability: 4, locomotion: "wheels", topSpeed: 50 } } };
    await controlVehicle({ actor: character("Driver", { items: [driving] }), vehicle: car, modifier: 0 });
    expect(rolled[0]).toMatchObject({ tags: ["vehicleControl"], kind: "skill", skill: "Driving (Automobile)", base: 12 });
    expect(rolled[0]!.context.vehicle).toBe(car);
    // 12, -1 handling, +2 from the listener.
    expect(card(cards).target).toBe(13);
  });
});

describe("reaction modifiers", () => {
  it("add a listener's lines to a reaction roll, told who reacts", async () => {
    const heard: any[] = [];
    const { cards } = foundryWith([3, 3, 3], (event, context) => {
      if (event !== PROCEDURE_HOOKS.reactionModifiers) return;
      heard.push({ ...context });
      context.modifiers.push({ label: "Uniform", value: 2 }, { label: "broken", value: Number.NaN });
    });
    const face = character("Face");
    const guard = character("Guard");
    await rollReaction({ actor: face, modifier: 1, reactor: guard });
    expect(heard[0]).toMatchObject({ actor: face, reactor: guard, tags: ["reaction"], modifier: 1 });
    const posted = card(cards);
    expect(posted.modifier).toBe(1);
    expect(posted.lines).toEqual(["Uniform +2"]);
    expect(posted.total).toBe(12);
  });

  it("gives back only well-formed lines", () => {
    foundryWith([3], (event, context) => {
      if (event === PROCEDURE_HOOKS.reactionModifiers) context.modifiers.push({ label: "Badge", value: 1.4 }, { value: 3 });
    });
    expect(reactionModifiers({ actor: {}, reactor: null, tags: ["reaction"], modifier: 0 })).toEqual([{ label: "Badge", value: 1 }]);
  });
});
