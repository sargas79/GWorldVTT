import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../optional-rules.js", () => ({ isRuleOn: () => true }));

import { objectStats } from "../object-stats.js";
import { badReplacesSituational, taskRuleLines } from "../task-rules.js";

const globals = globalThis as Record<string, unknown>;

afterEach(() => {
  for (const key of ["game", "canvas", "Hooks"]) delete globals[key];
});

function world(bad: number) {
  globals.game = {
    settings: { get: () => bad },
    i18n: { localize: (key: string) => key, format: (key: string) => key },
  };
  globals.canvas = { scene: null };
}

describe("Rugged gear as an object (Revised p. 342)", () => {
  const camera = { type: "equipment", name: "Camera", system: { weight: 2, hpLost: 0, rugged: true } };

  it("has DR x2 and +2 HT", () => {
    const plain = objectStats({ ...camera, system: { ...camera.system, rugged: false } });
    const rugged = objectStats(camera);
    expect(rugged.dr).toBe(plain.dr * 2);
    expect(rugged.ht).toBe(plain.ht + 2);
    expect(rugged.hp).toBe(plain.hp);
  });
});

describe("Basic Abstract Difficulty replaces situational modifiers (Revised p. 578)", () => {
  it("does so on a task roll while BAD is in force", () => {
    world(-5);
    expect(badReplacesSituational({ kind: "skill", tags: ["skill"] })).toBe(true);
  });

  it("does not on a fight, a Contest against no one, or at BAD 0", () => {
    world(-5);
    expect(badReplacesSituational({ kind: "attack", tags: ["attack"] })).toBe(false);
    expect(badReplacesSituational({ kind: "defense", tags: ["defense"] })).toBe(false);
    expect(badReplacesSituational({ kind: "skill", tags: ["contest"], opponent: null })).toBe(false);
    world(0);
    expect(badReplacesSituational({ kind: "skill", tags: ["skill"] })).toBe(false);
  });

  it("still puts its one line on the roll", () => {
    world(-5);
    const lines = taskRuleLines({ actor: { getFlag: () => undefined, system: {} }, kind: "skill", tags: ["skill"] });
    expect(lines.filter((line) => line.value === -5)).toHaveLength(1);
  });
});
