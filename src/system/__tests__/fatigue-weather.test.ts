import { afterEach, describe, expect, it, vi } from "vitest";

import { createApi } from "../api.js";
import { chargeBattleFatigue } from "../battle-fatigue.js";
import { rollExtraEffort, spendFatigue } from "../extra-effort.js";
import { spendFatigueFor } from "../fatigue.js";
import { hike } from "../hazards.js";
import { PROCEDURE_HOOKS } from "../procedure-extensions.js";
import { TEMPERATURE_KEY, currentTemperature, dayWeather, parseTemperature, setTemperature } from "../weather.js";

const globals = globalThis as Record<string, unknown>;

afterEach(() => {
  for (const key of ["ChatMessage", "CONST", "foundry", "game", "Hooks", "Roll", "ui"]) delete globals[key];
  vi.restoreAllMocks();
});

/** A character the fatigue procedures read and write. */
function character(name: string, options: { fp?: number; hp?: number; veryFit?: boolean; heatToleranceF?: number } = {}) {
  return {
    name,
    uuid: `Actor.${name}`,
    id: name,
    isOwner: true,
    system: {
      hp: { value: options.hp ?? 10, max: 10 },
      fp: { value: options.fp ?? 10, max: 10 },
      derived: {
        attributes: { HT: 10, DX: 10, IQ: 10 },
        will: 10,
        move: 5,
        encumbrance: { level: 0 },
        traitEffects: {
          fatigueLossHalved: options.veryFit === true,
          temperatureTolerance: { coldF: 0, heatF: options.heatToleranceF ?? 0 },
        },
      },
    },
    items: [],
    statuses: new Set<string>(),
    effects: [],
    update: async function (this: any, data: Record<string, unknown>) {
      if (typeof data["system.hp.value"] === "number") this.system.hp.value = data["system.hp.value"];
      if (typeof data["system.fp.value"] === "number") this.system.fp.value = data["system.fp.value"];
    },
    toggleStatusEffect: async () => {},
  };
}

type Heard = { event: string; context: any };

/** Foundry, as far as fatigue reaches: world settings, dice that come up as given, and every hook heard. */
function foundryWith(options: { temperature?: unknown; isGM?: boolean; faces?: number[]; listener?: (event: string, context: any) => void } = {}) {
  const settings: Record<string, unknown> = { [`gworld.${TEMPERATURE_KEY}`]: options.temperature ?? "" };
  const heard: Heard[] = [];
  const cards: any[] = [];
  globals.ChatMessage = {
    implementation: { create: async (data: any) => { cards.push(data); return data; }, getSpeaker: () => ({}) },
  };
  globals.CONST = { CHAT_MESSAGE_STYLES: { OTHER: 0 } };
  globals.foundry = {
    utils: { escapeHTML: (s: string) => s },
    applications: { handlebars: { renderTemplate: async (_path: string, data: any) => JSON.stringify(data) } },
  };
  globals.game = {
    i18n: { localize: (k: string) => k, format: (k: string, d: any) => `${k}:${JSON.stringify(d)}` },
    settings: {
      get: (scope: string, key: string) => settings[`${scope}.${key}`] ?? {},
      set: async (scope: string, key: string, value: unknown) => { settings[`${scope}.${key}`] = value; return value; },
    },
    user: { id: "gm", isGM: options.isGM ?? true },
  };
  globals.ui = { notifications: { warn: vi.fn(), info: vi.fn() } };
  const listen = (event: string, context: any) => {
    heard.push({ event, context });
    options.listener?.(event, context);
    return true;
  };
  globals.Hooks = { call: listen, callAll: listen };
  let next = 0;
  const faces = options.faces ?? [3, 3, 3];
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
  return { settings, heard, cards };
}

const heardOf = (heard: Heard[], event: string) => heard.filter((h) => h.event === event).map((h) => h.context);

/** The day's temperature, a world setting (sargas79/GWorldVTT#740). */
describe("the day's temperature", () => {
  it("reads blank as none set, and a number as the day's", () => {
    foundryWith();
    expect(currentTemperature()).toBeNull();
    expect(dayWeather()).toEqual({ temperatureF: null, hot: false });

    foundryWith({ temperature: "95" });
    expect(dayWeather()).toEqual({ temperatureF: 95, hot: true });
    expect(dayWeather(character("Nomad", { heatToleranceF: 20 }))).toEqual({ temperatureF: 95, hot: false });

    foundryWith({ temperature: "70" });
    expect(dayWeather()).toEqual({ temperatureF: 70, hot: false });
  });

  it("parses what the GM types, and nothing else", () => {
    expect(parseTemperature(" 101 ")).toBe(101);
    expect(parseTemperature(-12.4)).toBe(-12);
    expect(parseTemperature("")).toBeNull();
    expect(parseTemperature("hot")).toBeNull();
    expect(parseTemperature(Number.NaN)).toBeNull();
    // Asked before settings are registered: none set.
    globals.game = { settings: { get: () => { throw new Error("not registered"); } } };
    expect(currentTemperature()).toBeNull();
  });

  it("is set by the GM only, and cleared with null", async () => {
    const { settings } = foundryWith();
    expect(await setTemperature(98.6)).toBe(true);
    expect(settings[`gworld.${TEMPERATURE_KEY}`]).toBe("99");
    expect(await setTemperature(Number.NaN)).toBe(false);
    expect(settings[`gworld.${TEMPERATURE_KEY}`]).toBe("99");
    expect(await setTemperature(null)).toBe(true);
    expect(settings[`gworld.${TEMPERATURE_KEY}`]).toBe("");

    const player = foundryWith({ isGM: false });
    expect(await setTemperature(90)).toBe(false);
    expect(player.settings[`gworld.${TEMPERATURE_KEY}`]).toBe("");
  });

  it("is on the API's world namespace (since 1.138.0)", async () => {
    const { settings } = foundryWith({ temperature: "85" });
    const api = createApi();
    expect(api.world.weather()).toEqual({ temperatureF: 85, hot: true });
    expect(api.world.weather(character("Nomad", { heatToleranceF: 10 }))).toEqual({ temperatureF: 85, hot: false });
    expect(await api.world.setTemperature(20)).toBe(true);
    expect(settings[`gworld.${TEMPERATURE_KEY}`]).toBe("20");
    expect(api.combat.hooks.afterFatigue).toBe("gworld.afterFatigue");
  });
});

describe("the day's temperature reaches the fatigue it costs", () => {
  it("tells a battle's fatigue listeners the temperature and whether it is hot for each fighter", async () => {
    const { heard } = foundryWith({ temperature: "95" });
    const knight = character("Knight");
    const nomad = character("Nomad", { heatToleranceF: 20 });
    await chargeBattleFatigue({ round: 30, combatants: [{ actor: knight }, { actor: nomad }] });
    const costs = heardOf(heard, PROCEDURE_HOOKS.fatigueCost);
    expect(costs[0]).toMatchObject({ reason: "battle", details: { seconds: 30, strained: false, temperatureF: 95, hot: true } });
    expect(costs[1]).toMatchObject({ reason: "battle", details: { temperatureF: 95, hot: false } });
  });

  it("tells them none is set", async () => {
    const { heard } = foundryWith();
    await chargeBattleFatigue({ round: 30, combatants: [{ actor: character("Knight") }] });
    expect(heardOf(heard, PROCEDURE_HOOKS.fatigueCost)[0].details).toMatchObject({ temperatureF: null, hot: false });
  });

  it("charges a march the hot day's extra point off the day's temperature, unless the caller says otherwise", async () => {
    const { heard } = foundryWith({ temperature: "92" });
    const walker = character("Walker", { fp: 20 });
    walker.system.fp.max = 20;
    await hike({ actor: walker, hours: 2, terrain: "average", weather: "fair", modifier: 0 });
    // 1 FP an hour unencumbered, 1 more on a hot day: 4 for two hours.
    expect(walker.system.fp.value).toBe(16);
    expect(heardOf(heard, PROCEDURE_HOOKS.fatigueCost)[0]).toMatchObject({ reason: "hiking", details: { hours: 2, hot: true, temperatureF: 92 } });

    const shaded = character("Shaded", { fp: 20 });
    shaded.system.fp.max = 20;
    await hike({ actor: shaded, hours: 2, terrain: "average", weather: "fair", hot: false, modifier: 0 });
    expect(shaded.system.fp.value).toBe(18);
    expect(heardOf(heard, PROCEDURE_HOOKS.fatigueCost)[1].details).toMatchObject({ hot: false, temperatureF: 92 });
  });
});

describe("gworld.afterFatigue (since 1.138.0)", () => {
  it("fires once the FP is charged, with what Very Fit and the chart made of it", async () => {
    const { heard } = foundryWith({
      listener: (event, context) => {
        if (event === PROCEDURE_HOOKS.fatigueCost) { context.fp += 4; context.sources.push("Heavy pack"); }
      },
    });
    // 4 asked, 8 after the listener, halved to 4 by Very Fit: from 1 FP to -3, and 3 HP past 0.
    const tired = character("Tired", { fp: 1, veryFit: true });
    const spent = await spendFatigueFor(tired, 4, { reason: "hauling", details: { load: 200 } });
    const after = heardOf(heard, PROCEDURE_HOOKS.afterFatigue);
    expect(after).toHaveLength(1);
    expect(after[0]).toEqual({
      actor: tired,
      reason: "hauling",
      details: { load: 200 },
      exertion: true,
      fpLost: spent!.fpLost,
      hpLost: spent!.hpLost,
      fp: spent!.fp,
      hp: spent!.hp,
      sources: ["Heavy pack"],
    });
    expect(after[0].fpLost).toBe(4);
    expect(after[0].hpLost).toBe(3);
    // Fired after the write: the actor already shows it.
    expect(tired.system.fp.value).toBe(-3);
  });

  it("is read-only", async () => {
    const { heard } = foundryWith({
      listener: (event, context) => {
        if (event !== PROCEDURE_HOOKS.afterFatigue) return;
        expect(() => { context.fpLost = 0; }).toThrow();
        expect(() => { context.details.hot = true; }).toThrow();
        expect(() => { context.fp.now = 10; }).toThrow();
        expect(() => { context.sources.push("mine"); }).toThrow();
      },
    });
    const actor = character("Runner");
    await spendFatigueFor(actor, 2, { reason: "running" });
    expect(heardOf(heard, PROCEDURE_HOOKS.afterFatigue)).toHaveLength(1);
    expect(actor.system.fp.value).toBe(8);
  });

  it("doesn't fire where a listener brought the cost to nothing", async () => {
    const { heard } = foundryWith({
      listener: (event, context) => { if (event === PROCEDURE_HOOKS.fatigueCost) context.fp = 0; },
    });
    await spendFatigueFor(character("Spared"), 3, { reason: "running" });
    expect(heardOf(heard, PROCEDURE_HOOKS.fatigueCost)).toHaveLength(1);
    expect(heardOf(heard, PROCEDURE_HOOKS.afterFatigue)).toHaveLength(0);
  });

  it("fires for a battle with the day's weather in its details", async () => {
    const { heard } = foundryWith({ temperature: "100" });
    await chargeBattleFatigue({ round: 30, combatants: [{ actor: character("Knight") }] });
    expect(heardOf(heard, PROCEDURE_HOOKS.afterFatigue)[0]).toMatchObject({
      reason: "battle",
      details: { seconds: 30, temperatureF: 100, hot: true },
      fpLost: 1,
      hpLost: 0,
      fp: { previous: 10, now: 9, max: 10 },
    });
  });

  it("fires for extra effort bought in combat, once, with the listeners' sources", async () => {
    const { heard } = foundryWith({
      listener: (event, context) => {
        if (event === PROCEDURE_HOOKS.fatigueCost) { context.fp += 1; context.sources.push("Tired arms"); }
      },
    });
    const actor = character("Brawler");
    expect(await spendFatigue(actor, 1, "Mighty Blows")).toBe(true);
    expect(heardOf(heard, PROCEDURE_HOOKS.fatigueCost)).toHaveLength(1);
    const after = heardOf(heard, PROCEDURE_HOOKS.afterFatigue);
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({ reason: "extraEffort", details: { what: "Mighty Blows" }, fpLost: 2, hpLost: 0, sources: ["Tired arms"] });
  });

  it("fires for a Will roll's extra effort, the critical failure's HP included", async () => {
    // 6+6+6: a natural 18, a critical failure at any Will.
    const { heard } = foundryWith({ faces: [6, 6, 6] });
    const actor = character("Striver");
    await rollExtraEffort({ actor, percentIncrease: 10, motivated: false });
    const after = heardOf(heard, PROCEDURE_HOOKS.afterFatigue);
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({ reason: "extraEffort", exertion: true, fpLost: 1, hpLost: 1, fp: { previous: 10, now: 9 }, hp: { previous: 10, now: 9 } });
    expect(actor.system.hp.value).toBe(9);
  });
});
