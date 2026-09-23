import { afterEach, describe, expect, it, vi } from "vitest";

import {
  pendingZenShot,
  registerZenSkill,
  registeredZenSkills,
  resetZenSkills,
  zenLine,
  zenShotFor,
  zenSkillsOf,
} from "../zen.js";

const globals = globalThis as Record<string, unknown>;

afterEach(() => {
  resetZenSkills();
  delete globals.game;
  vi.restoreAllMocks();
});

function archer(options: { skills?: Record<string, number>; turns?: number; pending?: { id: string; skill: string } } = {}) {
  return {
    name: "Archer",
    isOwner: true,
    system: { concentrateTurns: options.turns ?? 0 },
    items: Object.entries(options.skills ?? {}).map(([name, level]) => ({ type: "skill", name, system: { derived: { level } } })),
    flags: options.pending ? { gworld: { zenShot: options.pending } } : {},
  };
}

/** Zen Archery (Characters p. 228), and a module's skill of the same shape (since API 1.91.0). */
describe("zen skills", () => {
  it("has the system's Zen Archery for the bow", () => {
    expect(registeredZenSkills().map((z) => [z.id, z.skill, z.covers])).toEqual([["zenArchery", "Zen Archery", ["Bow"]]]);
  });

  it("offers only the skills a character knows, at what the turns concentrated give", () => {
    expect(zenSkillsOf(archer({ skills: { Bow: 18 } }))).toEqual([]);
    const known = zenSkillsOf(archer({ skills: { "Zen Archery": 14 }, turns: 2 }));
    expect(known.map((z) => [z.id, z.level, z.modifier, z.ready])).toEqual([["zenArchery", 14, -4, false]]);
    expect(zenSkillsOf(archer({ skills: { "Zen Archery": 14 } }))[0]?.modifier).toBe(-10);
  });

  it("registers a module's skill for other weapons, and refuses a bad one", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(registerZenSkill({ module: "my-mod", key: "zenGuns", skill: "Zen Marksmanship", covers: ["Guns"] })).toBe("my-mod.zenGuns");
    expect(registerZenSkill({ module: "my-mod", key: "zenGuns", skill: "Zen Marksmanship", covers: ["Guns"] })).toBeNull();
    expect(registerZenSkill({ module: "my-mod", key: "none", skill: "Nothing", covers: [] })).toBeNull();
    expect(registerZenSkill({ module: "my mod", key: "x", skill: "X", covers: ["Guns"] })).toBeNull();
    const gunner = archer({ skills: { "Zen Marksmanship": 13 }, turns: 1 });
    expect(zenSkillsOf(gunner).map((z) => [z.id, z.modifier])).toEqual([["my-mod.zenGuns", -5]]);
  });

  it("leaves out a skill whose module says it isn't available", () => {
    registerZenSkill({ module: "my-mod", key: "off", skill: "Zen Marksmanship", covers: ["Guns"], available: () => false });
    expect(zenSkillsOf(archer({ skills: { "Zen Marksmanship": 13 } }))).toEqual([]);
  });
});

describe("a success waiting for its shot", () => {
  it("is for the next shot with a weapon skill it covers", () => {
    registerZenSkill({ module: "my-mod", key: "zenGuns", skill: "Zen Marksmanship", covers: ["Guns"] });
    const bow = archer({ pending: { id: "zenArchery", skill: "Zen Archery" } });
    expect(pendingZenShot(bow)).toEqual({ id: "zenArchery", skill: "Zen Archery" });
    expect(zenShotFor(bow, "Bow")).toEqual({ id: "zenArchery", skill: "Zen Archery" });
    expect(zenShotFor(bow, "Crossbow")).toBeNull();
    const gun = archer({ pending: { id: "my-mod.zenGuns", skill: "Zen Marksmanship" } });
    expect(zenShotFor(gun, "Guns/TL8 (Pistol)")).toEqual({ id: "my-mod.zenGuns", skill: "Zen Marksmanship" });
    expect(zenShotFor(gun, "Bow")).toBeNull();
    expect(zenShotFor(archer(), "Bow")).toBeNull();
  });

  it("gives back two-thirds of the size and range lines, keyed zen", () => {
    globals.game = { i18n: { format: (key: string, data: Record<string, string>) => `${key}|${data.skill}` } };
    const shot = { id: "zenArchery", skill: "Zen Archery" };
    const lines = [
      { label: "Range", value: -7, key: "speedRange" },
      { label: "SM", value: -2, key: "size" },
      { label: "Darkness", value: -3, key: "darkness" },
    ];
    expect(zenLine(shot, lines)).toEqual({ label: "GWORLD.Zen.Line|Zen Archery", value: 6, key: "zen", zen: "zenArchery" });
    expect(zenLine(shot, [{ label: "Darkness", value: -3, key: "darkness" }])).toBeNull();
  });
});
