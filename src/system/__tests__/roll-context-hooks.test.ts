import { afterEach, describe, expect, it, vi } from "vitest";

import { DATA_HOOKS } from "../data-extensions.js";
import { controlVehicle } from "../hazards.js";
import { vehicleStats } from "../vehicle-stats.js";
import { legalityClassOf } from "../legality.js";
import { PROCEDURE_HOOKS } from "../procedure-extensions.js";
import { rollInfluence } from "../reactions.js";
import { rollSuccess, successRollMessageMode } from "../roll.js";
import { toolFor } from "../tech-level.js";
import { bestTool } from "../../rules/tech-level.js";
import { drivenRemotely, operatorUuid } from "../../rules/vehicles.js";

/** Influence contests, secret rolls, the item behind a roll, TL on control rolls, and the LC hook (sargas79/GWorldVTT#672). */

const globals = globalThis as Record<string, unknown>;

afterEach(() => {
  for (const key of ["ChatMessage", "CONST", "CONFIG", "foundry", "game", "Hooks", "Roll", "ui", "canvas"]) delete globals[key];
  vi.restoreAllMocks();
});

function character(name: string, options: { will?: number; items?: any[]; tl?: number } = {}) {
  const items = options.items ?? [];
  return {
    name,
    uuid: `Actor.${name}`,
    id: name,
    isOwner: true,
    system: {
      hp: { value: 10, max: 10 },
      fp: { value: 10, max: 10 },
      tl: options.tl ?? 8,
      derived: { attributes: { HT: 10, DX: 10, IQ: 10 }, per: 10, will: options.will ?? 10, encumbrance: { level: 0 }, traitEffects: {} },
      conditions: {},
      maneuver: "move",
    },
    items: Object.assign([...items], { get: (id: string) => items.find((i) => i.id === id) ?? null }),
    statuses: new Set<string>(),
    effects: [],
    getFlag: () => undefined,
    setFlag: async () => {},
    unsetFlag: async () => {},
    update: async () => {},
    toggleStatusEffect: async () => {},
  };
}

type Listener = (event: string, context: any) => void;

function foundryWith(faces: number[], listener: Listener = () => {}) {
  const cards: Array<{ data: any; options: any }> = [];
  const heard: Array<{ event: string; context: any }> = [];
  globals.ChatMessage = {
    implementation: {
      create: async (data: any, options: any) => { cards.push({ data, options }); return data; },
      getSpeaker: () => ({}),
      getWhisperRecipients: () => [],
    },
  };
  globals.CONST = { CHAT_MESSAGE_STYLES: { OTHER: 0 } };
  globals.CONFIG = { ChatMessage: { modes: { public: {}, gm: {}, blind: {}, self: {}, ic: {} } } };
  globals.foundry = {
    utils: { escapeHTML: (s: string) => s, randomID: () => "id1", deepClone: (o: any) => structuredClone(o), mergeObject: (a: any, b: any) => ({ ...a, ...b }) },
    applications: { handlebars: { renderTemplate: async (_path: string, data: any) => JSON.stringify(data) } },
  };
  globals.game = {
    i18n: { localize: (k: string) => k, format: (k: string, d: any) => `${k}:${JSON.stringify(d)}` },
    settings: { get: () => ({}) },
    user: { id: "gm" },
    combat: null,
  };
  globals.ui = { notifications: { warn: vi.fn(), info: vi.fn() } };
  const listen = (event: string, context: any) => {
    heard.push({ event, context });
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
  const rolled = () => heard.filter((h) => h.event === PROCEDURE_HOOKS.successRollModifiers).map((h) => h.context);
  return { cards, heard, rolled };
}

const card = (cards: Array<{ data: any }>, i = 0) => JSON.parse(String(cards[i]?.data?.content ?? "{}"));

describe("influence rolls", () => {
  it("send both sides of the contest through gworld.successRollModifiers", async () => {
    const face = character("Face");
    const mark = character("Mark", { will: 11 });
    const { cards, rolled } = foundryWith([3, 3, 3], (event, context) => {
      if (event !== PROCEDURE_HOOKS.successRollModifiers) return;
      if (context.skill === "Fast-Talk") context.modifiers.push({ label: "Earpiece", value: 2 });
      if (context.tags.includes("will")) context.modifiers.push({ label: "Drugged", value: -3 });
    });
    await rollInfluence({ actor: face, subject: mark, skill: "Fast-Talk", skillLevel: 12, modifier: 1 });
    const [mine, theirs] = rolled();
    expect(mine).toMatchObject({ actor: face, opponent: mark, kind: "contest", skill: "Fast-Talk", base: 13 });
    expect(mine.tags).toEqual(expect.arrayContaining(["contest", "quickContest", "influence"]));
    expect(mine.tags).not.toContain("will");
    expect(theirs).toMatchObject({ actor: mark, opponent: face, kind: "contest", skill: "", base: 11 });
    expect(theirs.tags).toEqual(expect.arrayContaining(["contest", "quickContest", "influence", "will"]));
    const posted = card(cards);
    // 12 + 1 + the earpiece's 2; Will 11 less 3.
    expect(posted.target).toBe(15);
    expect(posted.will).toBe(8);
    expect(posted.lines).toEqual(["Earpiece +2"]);
    expect(posted.willLines).toEqual(["Drugged −3"]);
  });
});

describe("secret rolls", () => {
  it("read a message mode from rollMode or secret", () => {
    foundryWith([3]);
    expect(successRollMessageMode({})).toBeNull();
    expect(successRollMessageMode({ secret: true })).toBe("blind");
    expect(successRollMessageMode({ rollMode: "gmroll" })).toBe("gm");
    expect(successRollMessageMode({ rollMode: "self", secret: true })).toBe("self");
    expect(successRollMessageMode({ rollMode: "whisper-to-the-cat" })).toBeNull();
    expect(successRollMessageMode({ rollMode: "whisper-to-the-cat", secret: true })).toBe("blind");
  });

  it("post roll.success's card in that mode, and openly without one", async () => {
    const { cards } = foundryWith([3, 3, 3]);
    const actor = character("Scout");
    await rollSuccess({ actor, base: 12, label: "Perception", kind: "attribute", secret: true });
    await rollSuccess({ actor, base: 12, label: "Perception", kind: "attribute", rollMode: "gm" });
    await rollSuccess({ actor, base: 12, label: "Perception", kind: "attribute" });
    expect(cards.map((c) => c.options)).toEqual([{ messageMode: "blind" }, { messageMode: "gm" }, {}]);
  });
});

describe("the item behind a roll", () => {
  it("reaches gworld.successRollModifiers and gworld.afterSuccessRoll", async () => {
    const scope = { id: "scope", name: "Scope", system: { tl: "9" } };
    const { heard } = foundryWith([3, 3, 3], (event, context) => {
      if (event === PROCEDURE_HOOKS.successRollModifiers && context.item === scope) context.modifiers.push({ label: "Scope", value: 1 });
    });
    const outcome = await rollSuccess({ actor: character("Scout"), base: 10, label: "Observation", skill: "Observation", item: scope });
    const before = heard.find((h) => h.event === PROCEDURE_HOOKS.successRollModifiers)!.context;
    const after = heard.find((h) => h.event === PROCEDURE_HOOKS.afterSuccessRoll)!.context;
    expect(before.item).toBe(scope);
    expect(after.item).toBe(scope);
    expect(outcome?.success).toBe(true);
  });

  it("is the tool the preparation picked for a skill", () => {
    const kit = { id: "kit", name: "Crash kit" };
    const skill = { type: "skill", name: "First Aid/TL8", system: { derived: { toolItemId: "kit" } } };
    const actor = character("Medic", { items: [kit, skill] });
    expect(toolFor(actor, "First Aid")).toBe(kit);
    expect(toolFor(actor, "Physician")).toBeNull();
  });

  it("keeps the best tool's id", () => {
    expect(bestTool([{ quality: 1, techLevel: 8, id: "a" }, { quality: 2, techLevel: 8, id: "b" }], { skillTechLevel: 8, iqBased: false })).toEqual({ quality: 2, techLevel: 0, id: "b" });
    expect(bestTool([{ quality: 1, techLevel: null }], { skillTechLevel: null, iqBased: false })).toEqual({ quality: 1, techLevel: 0 });
  });
});

describe("tech level on control rolls", () => {
  const driving = { type: "skill", name: "Driving/TL8 (Automobile)", system: { techLevel: "8", attribute: "DX", derived: { level: 12 } } };

  it("puts the vehicle's TL line on the roll, where a listener can change it", async () => {
    const { cards, rolled } = foundryWith([3, 3, 3], (event, context) => {
      if (event !== PROCEDURE_HOOKS.successRollModifiers) return;
      const line = context.modifiers.find((m: any) => m.key === "techLevel");
      if (line) { line.value = -1; line.label = "Old but simple"; }
    });
    const car = { name: "Model T", system: { tl: "6", vehicle: { skill: "Driving/TL8 (Automobile)", handling: 0, stability: 4, locomotion: "wheels", topSpeed: 20 } } };
    await controlVehicle({ actor: character("Driver", { items: [driving] }), vehicle: car, modifier: 0 });
    const context = rolled()[0];
    expect(context.item).toBe(car);
    expect(context.vehicle).toBe(car);
    expect(context.tags).toEqual(["vehicleControl", "techLevel"]);
    const posted = card(cards);
    // 12, and the listener's -1 in place of the table's.
    expect(posted.target).toBe(11);
    expect(posted.lines[0]).toBe("Old but simple −1");
  });

  it("leaves a vehicle of the skill's own TL alone", async () => {
    const { cards, rolled } = foundryWith([3, 3, 3]);
    const car = { name: "Sedan", system: { tl: "8", vehicle: { skill: "Driving/TL8 (Automobile)", handling: -1, stability: 4, locomotion: "wheels", topSpeed: 50 } } };
    await controlVehicle({ actor: character("Driver", { items: [driving] }), vehicle: car, modifier: 0 });
    expect(rolled()[0].tags).toEqual(["vehicleControl"]);
    expect(card(cards).target).toBe(11);
  });
});

/** A control roll by someone driving from outside (sargas79/GWorldVTT#829; since API 1.154.0). */
describe("remote control rolls", () => {
  const driving = { type: "skill", name: "Driving/TL8 (Automobile)", system: { techLevel: "8", attribute: "DX", derived: { level: 12 } } };
  const drone = () => ({
    name: "Drone car",
    system: {
      tl: "8",
      vehicle: { skill: "Driving/TL8 (Automobile)", handling: 0, stability: 4, locomotion: "wheels", topSpeed: 20 },
      crew: [{ uuid: "Actor.Passenger", operator: true, strappedIn: false }],
      controller: "Actor.Remote",
    },
  });

  it("tells the hooks a roll by someone not in the crew is remote, where a listener may add to it", async () => {
    const { cards, rolled } = foundryWith([3, 3, 3], (event, context) => {
      if (event === PROCEDURE_HOOKS.successRollModifiers && context.remote) context.modifiers.push({ label: "Weak signal", value: -2 });
    });
    await controlVehicle({ actor: character("Remote", { items: [driving] }), vehicle: drone(), modifier: 0 });
    const context = rolled()[0];
    expect(context.remote).toBe(true);
    expect(context.tags).toEqual(["vehicleControl", "remoteControl"]);
    expect(card(cards).target).toBe(10);
    expect(card(cards).lines).toContain("GWORLD.Hazard.RemoteControl");
  });

  it("lets a listener refuse it, out of range", async () => {
    const { cards } = foundryWith([3, 3, 3], (event, context) => {
      if (event === PROCEDURE_HOOKS.successRollModifiers && context.remote) context.refusal = "Out of range";
    });
    await controlVehicle({ actor: character("Remote", { items: [driving] }), vehicle: drone(), modifier: 0 });
    expect((globals.ui as any).notifications.warn).toHaveBeenCalledWith("Out of range");
    expect(cards).toHaveLength(1);
  });

  it("is not remote for the crew, nor for a vehicle carried as gear unless said", async () => {
    const { rolled } = foundryWith([3, 3, 3]);
    await controlVehicle({ actor: character("Passenger", { items: [driving] }), vehicle: drone(), modifier: 0 });
    const car = { name: "Sedan", system: { tl: "8", vehicle: { skill: "Driving/TL8 (Automobile)", handling: 0, stability: 4, locomotion: "wheels", topSpeed: 50 } } };
    await controlVehicle({ actor: character("Driver", { items: [driving] }), vehicle: car, modifier: 0 });
    await controlVehicle({ actor: character("Driver", { items: [driving] }), vehicle: car, modifier: 0, remote: true });
    expect(rolled().map((c) => [c.remote, c.tags.includes("remoteControl")])).toEqual([[false, false], [false, false], [true, true]]);
  });

  it("puts the one named to drive from outside at the wheel, before the crew's operator", () => {
    expect(operatorUuid(drone().system)).toBe("Actor.Remote");
    expect(operatorUuid({ ...drone().system, controller: "" })).toBe("Actor.Passenger");
    expect(operatorUuid({ crew: [] })).toBeNull();
    expect(drivenRemotely({ crew: drone().system.crew, uuid: "Actor.Remote" })).toBe(true);
    expect(drivenRemotely({ crew: null, uuid: "Actor.Remote" })).toBe(false);
    expect(drivenRemotely({ said: false, crew: [], uuid: "Actor.Remote" })).toBe(false);
  });
});

describe("gworld.legalityClass", () => {
  it("lets a listener change the class the system reads", () => {
    const pistol = { name: "Pistol", actor: null, system: { lc: 3 } };
    const cane = { name: "Sword cane", actor: null, system: { lc: 2 } };
    const junk = { name: "Junk", actor: null, system: {} };
    const heard: any[] = [];
    foundryWith([3], (event, context) => {
      if (event !== DATA_HOOKS.legalityClass) return;
      heard.push({ ...context });
      if (context.item === cane) context.lc = 4;
      if (context.item === junk) context.lc = 9;
    });
    expect(legalityClassOf(pistol)).toBe(3);
    expect(legalityClassOf(cane)).toBe(4);
    expect(legalityClassOf(junk)).toBeNull();
    expect(heard[0]).toEqual({ item: pistol, actor: null, lc: 3 });
    // An item with no class is asked about too, starting at null.
    expect(heard[2]).toEqual({ item: junk, actor: null, lc: null });
  });

  it("keeps the stored class when a listener throws", () => {
    foundryWith([3], () => { throw new Error("boom"); });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(legalityClassOf({ system: { lc: 1 } })).toBe(1);
  });
});

/** Vehicle hooks: figures while a state lasts, and why a control roll is made (sargas79/GWorldVTT#718). */
describe("vehicle figures and control-roll reasons (since 1.115.0)", () => {
  const driving = { type: "skill", name: "Driving/TL8 (Automobile)", system: { derived: { level: 12 } } };
  const sedan = () => ({ name: "Sedan", system: { tl: "8", vehicle: { skill: "Driving/TL8 (Automobile)", handling: -1, stability: 4, locomotion: "wheels", acceleration: 5, topSpeed: 50 } } });

  it("carries the reason among the tags and on the context", async () => {
    const { rolled } = foundryWith([3, 3, 3]);
    await controlVehicle({ actor: character("Driver", { items: [driving] }), vehicle: sedan(), modifier: 0, reason: "hardBraking" });
    expect(rolled()[0].tags).toEqual(["vehicleControl", "hardBraking"]);
    expect(rolled()[0].reason).toBe("hardBraking");
  });

  it("rolls at the Handling a listener leaves, without touching the stored figure", async () => {
    const { cards } = foundryWith([3, 3, 3], (event, context) => {
      if (event !== DATA_HOOKS.vehicleStats) return;
      context.handling -= 2;
      context.stability = 1;
      context.lines.push({ label: "Crippled wheel", stat: "handling", value: -2 });
    });
    const car = sedan();
    await controlVehicle({ actor: character("Driver", { items: [driving] }), vehicle: car, modifier: 0 });
    // Driving 12, Handling -1 and the wheel's -2.
    expect(card(cards).target).toBe(9);
    expect(car.system.vehicle.handling).toBe(-1);
  });
});

describe("vehicleStats", () => {
  it("keeps Stability, acceleration and top speed at 0 or more, and ignores what isn't a number", () => {
    foundryWith([3], (event, context) => {
      if (event !== DATA_HOOKS.vehicleStats) return;
      context.stability = -3;
      context.topSpeed = 20;
      context.acceleration = "fast";
    });
    const stats = vehicleStats({ system: { vehicle: { handling: 1, stability: 4, locomotion: "wheels", acceleration: 5, topSpeed: 50 } } });
    expect(stats).toMatchObject({ handling: 1, stability: 0, acceleration: 5, topSpeed: 20, move: { locomotion: "wheels", acceleration: 5, topSpeed: 20 } });
  });
});
