import { afterEach, describe, expect, it, vi } from "vitest";

import { studiableTrait, studyAttribute, studySkill, studyTrait } from "../life.js";
import { PROCEDURE_HOOKS } from "../procedure-extensions.js";

const globals = globalThis as Record<string, unknown>;

afterEach(() => {
  for (const key of ["ChatMessage", "CONST", "foundry", "game", "Hooks", "ui"]) delete globals[key];
  vi.restoreAllMocks();
});

/** A Foundry just big enough for the study tool, with the listeners given. */
function stage(options: { banked?: number; listeners?: ((context: any) => void)[] } = {}) {
  const posted: any[] = [];
  globals.Hooks = {
    callAll: (event: string, context: any) => {
      if (event === PROCEDURE_HOOKS.studyModifiers) for (const listener of options.listeners ?? []) listener(context);
      return true;
    },
  };
  globals.ChatMessage = { implementation: { create: async (d: any) => { posted.push(d); return d; }, getSpeaker: () => ({}) } };
  globals.CONST = { CHAT_MESSAGE_STYLES: { OTHER: 0 } };
  globals.foundry = {
    applications: { handlebars: { renderTemplate: async (_: string, context: any) => context } },
    utils: { getProperty: (object: any, path: string) => path.split(".").reduce((o, k) => o?.[k], object) },
  };
  globals.game = {
    i18n: { localize: (k: string) => k, format: (k: string, d: any) => `${k} ${JSON.stringify(d)}` },
  };
  globals.ui = { notifications: { warn: vi.fn() } };
  const skill = {
    id: "s1",
    type: "skill",
    name: "Karate",
    system: { points: 2, studyHours: options.banked ?? 0 },
    update: vi.fn(async () => undefined),
  };
  const trait = {
    id: "t1",
    type: "trait",
    name: "Acute Hearing",
    system: {
      category: "advantage", points: 0, levels: 1, pointsPerLevel: 2, costTable: [], maxLevels: 0,
      modifiers: [], selfControl: null, studyHours: 0,
    },
    update: vi.fn(async () => undefined),
  };
  const actor = {
    isOwner: true,
    name: "Student",
    system: {
      points: { awards: [] as any[] },
      attributes: { ST: 10, DX: 10, IQ: 10, HT: 11 },
      purchased: { hp: 0, will: 0, per: 0, fp: 0, basicSpeed: 0.25, basicMove: 0 },
      studyHours: { HT: options.banked ?? 0 } as Record<string, number>,
    },
    items: { get: (id: string) => (id === "s1" ? skill : id === "t1" ? trait : undefined) },
    update: vi.fn(async () => undefined),
  };
  return { actor, skill, trait, posted };
}

describe("gworld.studyModifiers (since 1.133.0)", () => {
  it("hands the listener the stretch of study and counts the hours at 1 by default", async () => {
    const heard: any[] = [];
    const { actor, skill, posted } = stage({ listeners: [(context) => heard.push({ ...context })] });
    const points = await studySkill({ actor, skillId: "s1", hours: 250, method: "education" });
    expect(heard[0]).toMatchObject({ actor, skill, method: "education", hours: 250, multiplier: 1 });
    expect(heard[0].studied).toEqual({ kind: "skill", item: skill, attribute: null, name: "Karate" });
    expect(points).toBe(1);
    expect(skill.update).toHaveBeenCalledWith({ "system.studyHours": 50, "system.points": 3 });
    // No module changed anything: the card says nothing about it.
    expect(posted[0].content.lines.some((l: string) => l.startsWith("GWORLD.Life.StudyCounted"))).toBe(false);
  });

  it("scales the hours that count by the multiplier, and shows it and the listeners' lines", async () => {
    const { actor, skill, posted } = stage({
      banked: 20,
      listeners: [
        (context) => { context.multiplier *= 1.5; context.lines.push("Training aids"); },
        (context) => { context.multiplier *= 2; },
      ],
    });
    // 60 hours of self-teaching at x3 count as 180, on top of 20 banked: half a point's 400.
    const points = await studySkill({ actor, skillId: "s1", hours: 60, method: "selfTeaching" });
    expect(points).toBe(0);
    expect(skill.update).toHaveBeenCalledWith({ "system.studyHours": 200 });
    const lines = posted[0].content.lines;
    expect(lines[0]).toBe(`GWORLD.Life.StudyCounted ${JSON.stringify({ hours: 180 })}`);
    expect(lines[1]).toBe("Training aids");
  });

  it("can stop the study counting, and ignores a multiplier that isn't a number of 0 or more", async () => {
    const none = stage({ banked: 10, listeners: [(context) => { context.multiplier = 0; }] });
    await studySkill({ actor: none.actor, skillId: "s1", hours: 500, method: "intensive" });
    expect(none.skill.update).toHaveBeenCalledWith({ "system.studyHours": 10 });

    for (const bad of [-1, Number.NaN, "fast", null]) {
      const { actor, skill } = stage({ listeners: [(context) => { context.multiplier = bad; }] });
      await studySkill({ actor, skillId: "s1", hours: 150, method: "intensive" });
      expect(skill.update).toHaveBeenCalledWith({ "system.studyHours": 50, "system.points": 3 });
    }
  });

  it("keeps the counted hours to the hundredth", async () => {
    const { actor, skill } = stage({ listeners: [(context) => { context.multiplier = 0.1; }] });
    await studySkill({ actor, skillId: "s1", hours: 3, method: "education" });
    expect(skill.update).toHaveBeenCalledWith({ "system.studyHours": 0.3 });
  });
});

describe("study of attributes and advantages (since 1.146.0)", () => {
  it("names the attribute studied, and a listener that halves the time raises HT sooner", async () => {
    const heard: any[] = [];
    // Say, training gear that makes an hour of HT work count for two.
    const shorten = (context: any) => {
      heard.push(context);
      if (context.studied.kind === "attribute" && context.studied.attribute === "HT") {
        context.multiplier *= 2;
        context.lines.push("Training gear");
      }
    };
    const { actor, posted } = stage({ banked: 100, listeners: [shorten] });
    // A level of HT is 10 points, 2,000 hours of instruction; 1,000 doubled and 100 banked come to 2,100.
    const points = await studyAttribute({ actor, attribute: "HT", hours: 1000, method: "education" });
    expect(heard[0]).toMatchObject({ actor, skill: null, method: "education", hours: 1000 });
    expect(heard[0].studied).toEqual({ kind: "attribute", item: null, attribute: "HT", name: "GWORLD.Attribute.HT" });
    expect(Object.isFrozen(heard[0].studied)).toBe(true);
    expect(points).toBe(10);
    const changes = (actor.update.mock.calls[0] as any[])[0];
    expect(changes["system.attributes.HT"]).toBe(12);
    expect(changes["system.studyHours.HT"]).toBe(100);
    expect(changes["system.points.awards"]).toMatchObject([{ points: 10 }]);
    const lines = posted[0].content.lines;
    expect(lines[0]).toBe(`GWORLD.Life.StudyCounted ${JSON.stringify({ hours: 2000 })}`);
    expect(lines[1]).toBe("Training gear");
    expect(lines[2]).toContain("GWORLD.Life.LevelsEarned");
  });

  it("banks the hours short of a level, without the listener it takes twice as long", async () => {
    const { actor } = stage({ listeners: [] });
    const points = await studyAttribute({ actor, attribute: "HT", hours: 1000, method: "education" });
    expect(points).toBe(0);
    expect(actor.update).toHaveBeenCalledWith({ "system.studyHours.HT": 1000 });
  });

  it("raises a secondary characteristic by its own step", async () => {
    const { actor } = stage();
    // +0.25 Basic Speed is 5 points: 500 hours of intensive training.
    await studyAttribute({ actor, attribute: "basicSpeed", hours: 500, method: "intensive" });
    const changes = (actor.update.mock.calls[0] as any[])[0];
    expect(changes["system.purchased.basicSpeed"]).toBe(0.5);
    expect(changes["system.points.awards"]).toMatchObject([{ points: 5 }]);
  });

  it("ignores an attribute it doesn't know", async () => {
    const { actor } = stage();
    expect(await studyAttribute({ actor, attribute: "toString" as any, hours: 5000, method: "education" })).toBe(0);
    expect(actor.update).not.toHaveBeenCalled();
  });

  it("raises an advantage bought by the level, and names it on the context", async () => {
    const heard: any[] = [];
    const { actor, trait } = stage({ listeners: [(context) => heard.push(context)] });
    // Acute Hearing is 2 points a level: 400 hours of instruction, 50 over.
    const points = await studyTrait({ actor, traitId: "t1", hours: 450, method: "education" });
    expect(heard[0].skill).toBeNull();
    expect(heard[0].studied).toEqual({ kind: "trait", item: trait, attribute: null, name: "Acute Hearing" });
    expect(points).toBe(2);
    expect(trait.update).toHaveBeenCalledWith({ "system.studyHours": 50, "system.levels": 2 });
    expect(actor.update).toHaveBeenCalledWith({ "system.points.awards": [expect.objectContaining({ points: 2 })] });
  });

  it("offers only advantages with a level to go", () => {
    const trait = (system: Record<string, unknown>) => ({
      type: "trait",
      system: { category: "advantage", points: 0, levels: 0, pointsPerLevel: 0, costTable: [], maxLevels: 0, modifiers: [], ...system },
    });
    expect(studiableTrait(trait({ pointsPerLevel: 2, levels: 1 }))).toBe(true);
    expect(studiableTrait(trait({ points: 15 }))).toBe(false);
    expect(studiableTrait(trait({ pointsPerLevel: 2, levels: 4, maxLevels: 4 }))).toBe(false);
    expect(studiableTrait(trait({ costTable: [5, 15], levels: 1 }))).toBe(true);
    expect(studiableTrait(trait({ costTable: [5, 15], levels: 2 }))).toBe(false);
    expect(studiableTrait(trait({ category: "disadvantage", pointsPerLevel: -5, levels: 1 }))).toBe(false);
  });
});
