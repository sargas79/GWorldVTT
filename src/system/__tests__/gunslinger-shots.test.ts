import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { gunslingerDecision, rangedModifiers, weaponFromDataset } from "../roll.js";

const globals = globalThis as Record<string, unknown>;

beforeEach(() => {
  globals.game = { i18n: { localize: (key: string) => key, format: (key: string) => key } };
});

afterEach(() => {
  delete globals.game;
});

/** Gunslinger (Characters p. 58, the Revised edition's list) in the ranged roll. */
const pistol = { accuracy: 3, scopeBonus: 0, bulk: -2, gunslinger: { twoHanded: false } };
const rifle = { accuracy: 5, scopeBonus: 2, bulk: -5, gunslinger: { twoHanded: true } };
const ordinary = { accuracy: 3, scopeBonus: 0, bulk: -2 };

const shot = (over: Partial<Parameters<typeof rangedModifiers>[0]> = {}) => ({
  range: 0,
  speed: 0,
  size: 0,
  modifier: 0,
  shots: 1,
  situation: "normal" as const,
  aimed: false,
  ...over,
});

const line = (mods: ReturnType<typeof rangedModifiers>, gunslinger: string) =>
  mods.find((m) => m.key === "gunslinger" && m.gunslinger === gunslinger);
const total = (mods: ReturnType<typeof rangedModifiers>) =>
  mods.reduce((sum, m) => sum + m.value, 0);

describe("a Gunslinger's Accuracy without aiming", () => {
  it("adds a one-handed gun's full Acc to a single shot", () => {
    const mods = rangedModifiers(shot(), pistol);
    expect(line(mods, "accuracy")).toMatchObject({ value: 3, key: "gunslinger" });
    expect(total(mods)).toBe(3);
  });

  it("adds half Acc, rounded up, with a two-handed weapon, and no scope", () => {
    const mods = rangedModifiers(shot(), rifle);
    expect(line(mods, "accuracy")?.value).toBe(3);
    expect(mods.find((m) => m.key === "accuracy")).toBeUndefined();
  });

  it("adds half Acc for automatic fire from a one-handed gun", () => {
    const mods = rangedModifiers(shot({ shots: 8 }), pistol);
    expect(line(mods, "accuracy")?.value).toBe(2);
  });

  it("counts shells and not pellets when it decides whether a shot is single", () => {
    const mods = rangedModifiers(shot({ shots: 9, shells: 1 }), pistol);
    expect(line(mods, "accuracy")?.value).toBe(3);
  });

  it("gives an ordinary shooter nothing, as before", () => {
    expect(rangedModifiers(shot(), ordinary)).toEqual([]);
    expect(rangedModifiers(shot(), { ...ordinary, gunslinger: null })).toEqual([]);
  });

  it("gives full Acc, the extra turns and bracing once aimed, and no second helping", () => {
    const aimed = { ...rifle, aim: { turns: 3, braced: true } };
    const mods = rangedModifiers(shot({ aimed: true }), aimed);
    expect(line(mods, "accuracy")).toBeUndefined();
    // Acc 5 and the +2 scope, two further seconds, bracing.
    expect(mods.find((m) => m.key === "accuracy")?.value).toBe(7);
    expect(total(mods)).toBe(7 + 2 + 1);
  });
});

describe("a Gunslinger's waived penalties, instead of adding Acc", () => {
  it("ignores the Move and Attack penalty, even for a heavy weapon, and adds no Acc", () => {
    const mods = rangedModifiers(shot({ situation: "moveAndAttack" }), { ...pistol, bulk: -6 });
    expect(mods.find((m) => m.key === "bulk")).toBeUndefined();
    expect(line(mods, "moveAndAttack")).toMatchObject({ value: 0 });
    expect(line(mods, "accuracy")).toBeUndefined();
    expect(total(mods)).toBe(0);
  });

  it("still takes the Move and Attack penalty when the shooter is not a Gunslinger", () => {
    const mods = rangedModifiers(shot({ situation: "moveAndAttack" }), { ...ordinary, bulk: -6 });
    expect(mods.find((m) => m.key === "bulk")?.value).toBe(-6);
  });

  it("ignores Bulk in close combat, and the speed/range penalty stays dropped", () => {
    const mods = rangedModifiers(shot({ range: 20, situation: "closeCombat" }), {
      ...pistol,
      bulk: -6,
    });
    expect(mods.find((m) => m.key === "bulk")).toBeUndefined();
    expect(mods.find((m) => m.key === "speedRange")).toBeUndefined();
    expect(line(mods, "closeCombat")).toMatchObject({ value: 0 });
    expect(line(mods, "accuracy")).toBeUndefined();
    expect(total(mods)).toBe(0);
  });

  it("ignores the Move and Attack penalty of driving and shooting (p. 470)", () => {
    const vehicle = {
      kind: "handheld" as const,
      operator: true,
      dodged: false,
      flying: false,
      moving: true,
      stabilityRating: 3,
      stabilized: false,
      targetingTl: 0,
    };
    const driver = rangedModifiers(shot({ vehicle }), { ...pistol, bulk: -6 });
    expect(driver.find((m) => m.label === "GWORLD.Ranged.Driving")).toBeUndefined();
    expect(line(driver, "driving")).toMatchObject({ value: 0 });
    expect(line(driver, "accuracy")).toBeUndefined();
    const plain = rangedModifiers(shot({ vehicle }), { ...ordinary, bulk: -6 });
    expect(plain.find((m) => m.label === "GWORLD.Ranged.Driving")?.value).toBe(-6);
  });

  it("gives a passenger the Acc without aiming, capped at the vehicle's SR", () => {
    const vehicle = {
      kind: "handheld" as const,
      operator: false,
      dodged: false,
      flying: false,
      moving: true,
      stabilityRating: 2,
      stabilized: false,
      targetingTl: 0,
    };
    const mods = rangedModifiers(shot({ vehicle }), pistol);
    expect(line(mods, "accuracy")?.value).toBe(3);
    expect(total(mods.filter((m) => !m.key?.startsWith("movingPlatform")))).toBe(2);
  });
});

describe("what a Gunslinger's shot tells a module", () => {
  it("reports the Acc added", () => {
    const mods = rangedModifiers(shot(), pistol);
    expect(gunslingerDecision(pistol.gunslinger, mods)).toEqual({
      twoHanded: false,
      accuracy: 3,
      waived: [],
    });
  });

  it("reports the penalty waived", () => {
    const mods = rangedModifiers(shot({ situation: "closeCombat" }), pistol);
    expect(gunslingerDecision(pistol.gunslinger, mods)).toEqual({
      twoHanded: false,
      accuracy: 0,
      waived: ["closeCombat"],
    });
  });

  it("is null for anyone else", () => {
    expect(gunslingerDecision(null, [])).toBeNull();
  });
});

describe("weaponFromDataset for a Gunslinger", () => {
  const actor = (gunslinger: boolean) => ({
    system: { derived: { traitEffects: { gunslinger } } },
  });

  it("marks a Guns weapon, and whether it takes two hands", () => {
    expect(weaponFromDataset(actor(true), { rollSkill: "Guns (Pistol)" }).gunslinger).toEqual({
      twoHanded: false,
    });
    expect(
      weaponFromDataset(actor(true), { rollSkill: "Guns (Rifle)", twoHanded: "1" }).gunslinger,
    ).toEqual({ twoHanded: true });
  });

  it("does not mark a bow, or a shooter without the advantage", () => {
    expect(weaponFromDataset(actor(true), { rollSkill: "Bow" }).gunslinger).toBeNull();
    expect(weaponFromDataset(actor(false), { rollSkill: "Guns (Pistol)" }).gunslinger).toBeNull();
    expect(weaponFromDataset({}, { rollSkill: "Guns (Pistol)" }).gunslinger).toBeNull();
  });
});
