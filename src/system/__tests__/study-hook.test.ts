import { afterEach, describe, expect, it, vi } from "vitest";

import { studySkill } from "../life.js";
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
  globals.foundry = { applications: { handlebars: { renderTemplate: async (_: string, context: any) => context } } };
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
  const actor = {
    isOwner: true,
    name: "Student",
    system: { points: { awards: [] } },
    items: { get: (id: string) => (id === "s1" ? skill : undefined) },
    update: vi.fn(async () => undefined),
  };
  return { actor, skill, posted };
}

describe("gworld.studyModifiers (since 1.133.0)", () => {
  it("hands the listener the stretch of study and counts the hours at 1 by default", async () => {
    const heard: any[] = [];
    const { actor, skill, posted } = stage({ listeners: [(context) => heard.push({ ...context })] });
    const points = await studySkill({ actor, skillId: "s1", hours: 250, method: "education" });
    expect(heard[0]).toMatchObject({ actor, skill, method: "education", hours: 250, multiplier: 1 });
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
