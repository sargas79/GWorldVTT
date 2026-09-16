import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { positionRollLines, previewAttack, standingRollLines, weaponFromDataset } from "../roll.js";

const globals = globalThis as Record<string, unknown>;

beforeEach(() => {
  // Labels are echoed back as their keys: the lines and their values are what is under test.
  globals.game = {
    i18n: { localize: (key: string) => key, format: (key: string) => key },
    user: { targets: new Set() },
    settings: { get: () => ({}) },
  };
});

afterEach(() => {
  delete globals.game;
});

const fighter = (system: Record<string, unknown> = {}) => ({
  system: {
    maneuver: "attack",
    posture: "standing",
    attributePenalties: { ST: 0, DX: 0, IQ: 0, HT: 0 },
    conditions: {},
    derived: { traitEffects: null, vision: {} },
    ...system,
  },
});

describe("the lines a roll takes before its dialog", () => {
  it("puts a weapon's own to-hit on an attack, and not on a skill roll", () => {
    expect(standingRollLines(fighter(), { rollType: "attack", ranged: false, hitModifier: "-2", dialogAsked: false }))
      .toEqual([{ label: "GWORLD.Attack.WeaponToHit", value: -2 }]);
    expect(standingRollLines(fighter(), { rollType: "skill", ranged: false, hitModifier: "-2", dialogAsked: false })).toEqual([]);
  });

  it("gives All-Out Attack (Determined) +4 in melee and +1 at range, but not to a Wild Swing", () => {
    const allOut = fighter({ maneuver: "allOutAttack", allOutAttackOption: "determined" });
    expect(standingRollLines(allOut, { rollType: "attack", ranged: false, dialogAsked: true })[0]?.value).toBe(4);
    expect(standingRollLines(allOut, { rollType: "attack", ranged: true, dialogAsked: true })[0]?.value).toBe(1);
    expect(standingRollLines(allOut, { rollType: "attack", ranged: false, wildSwing: true, dialogAsked: true })).toEqual([]);
  });
});

describe("the lines an attack takes for where the fighters are", () => {
  it("takes the Posture Table's penalty off a melee attack from a low posture, and nothing standing", () => {
    expect(positionRollLines(fighter(), { rollType: "attack", ranged: false })).toEqual([]);
    expect(positionRollLines(fighter({ posture: "kneeling" }), { rollType: "attack", ranged: false })[0]?.value).toBe(-2);
  });

  it("takes -4 for Move and Attack in melee", () => {
    const moving = fighter({ maneuver: "moveAndAttack" });
    expect(positionRollLines(moving, { rollType: "attack", ranged: false })).toEqual([{ label: "GWORLD.Maneuver.moveAndAttack", value: -4 }]);
  });

  it("adds nothing to a roll that is not an attack", () => {
    expect(positionRollLines(fighter({ posture: "kneeling" }), { rollType: "skill", ranged: false })).toEqual([]);
  });
});

describe("the attack preview", () => {
  it("adds up the lines and caps Move and Attack at 9", () => {
    const moving = fighter({ maneuver: "moveAndAttack", posture: "crouching" });
    const preview = previewAttack(moving, { ranged: false, skillLevel: 15, hitModifier: 0 });
    expect(preview.lines.map((l) => l.value)).toEqual([-2, -4]);
    expect(preview.total).toBe(9);
    expect(preview.cap).toBe(9);
    expect(previewAttack(moving, { ranged: false, skillLevel: 18 }).effective).toBe(9);
  });

  it("leaves a ranged attack unmeasured without a single target on the map", () => {
    const preview = previewAttack(fighter(), { ranged: true, skillLevel: 14, weapon: { accuracy: "2" } });
    expect(preview.measured).toBeNull();
    expect(preview.effective).toBe(14);
  });
});

describe("a ranged weapon read from its row", () => {
  it("reads the numbers the row carries, and defaults the rest", () => {
    const weapon = weaponFromDataset(fighter(), { accuracy: "3", rateOfFire: "", projectiles: "0", loaded: "" });
    expect(weapon.accuracy).toBe(3);
    expect(weapon.rateOfFire).toBe(1);
    expect(weapon.projectiles).toBe(1);
    expect(weapon.loaded).toBeNull();
    expect(weapon.watching).toBeNull();
  });
});
