import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { COMBAT_HOOKS } from "../combat-extensions.js";
import { DESIGNATION_SKILL, applyLockOn, designationLevel, homingAttack, rangedModifiers, type RollModifier } from "../roll.js";

/**
 * A homing weapon's lock-on, and a semi-active one's spot on the target
 * (GURPS Basic Set: Campaigns pp. 412-413; since API 1.128.0).
 */
const globals = globalThis as Record<string, unknown>;

type Listener = (context: any) => void;
let listeners: Record<string, Listener[]> = {};

beforeEach(() => {
  listeners = {};
  globals.game = {
    i18n: { localize: (key: string) => key, format: (key: string) => key },
    user: { targets: new Set() },
  };
  globals.Hooks = {
    callAll: (hook: string, context: unknown) => {
      for (const listener of listeners[hook] ?? []) listener(context);
    },
  };
});

afterEach(() => {
  delete globals.game;
  delete globals.Hooks;
});

const listen = (hook: string, listener: Listener) => {
  (listeners[hook] ??= []).push(listener);
};

// Acc 3, 1/2D 200 (its speed in yards a second), Max 2000.
const missile = { accuracy: 3, scopeBonus: 0, bulk: -6, halfDamageRange: 200, maxRange: 2000, guidance: "homing" };

const shot = (over: Partial<Parameters<typeof rangedModifiers>[0]> = {}) => ({
  range: 100,
  speed: 0,
  size: 0,
  modifier: 0,
  shots: 1,
  situation: "normal" as const,
  aimed: false,
  ...over,
});

const accuracy = (mods: RollModifier[]) => mods.filter((m) => m.key === "accuracy");

describe("the lock-on in rangedModifiers", () => {
  it("gives a homing weapon that locked on its Acc, and says the lock-on earned it", () => {
    // 100 yards at 200 a second arrives at once: without the lock-on, no Acc.
    expect(accuracy(rangedModifiers(shot(), missile))).toEqual([]);
    expect(accuracy(rangedModifiers(shot({ lockedOn: true }), missile))).toEqual([
      { label: "GWORLD.Ranged.LockedOn", value: 3, key: "accuracy", lockOn: true },
    ]);
  });

  it("adds nothing where the attack was aimed already", () => {
    const aimed = accuracy(rangedModifiers(shot({ aimed: true, lockedOn: true }), missile));
    expect(aimed).toHaveLength(1);
    expect(aimed[0]).toMatchObject({ label: "GWORLD.Ranged.Accuracy", value: 3 });
    expect(aimed[0]?.lockOn).toBeUndefined();
    // A flight of three seconds counts as aimed on its own.
    const long = accuracy(rangedModifiers(shot({ range: 500, lockedOn: true }), missile));
    expect(long).toHaveLength(1);
    expect(long[0]?.lockOn).toBeUndefined();
  });

  it("means nothing to a weapon without a seeker", () => {
    expect(accuracy(rangedModifiers(shot({ lockedOn: true }), { ...missile, guidance: "guided" }))).toEqual([]);
    expect(accuracy(rangedModifiers(shot({ lockedOn: true }), { ...missile, guidance: "" }))).toEqual([]);
  });
});

describe("applyLockOn", () => {
  it("adds the Acc a listener's lock-on is worth", () => {
    const lines: RollModifier[] = [{ label: "size", value: -2, key: "size" }];
    applyLockOn(lines, true, missile);
    expect(lines).toContainEqual({ label: "GWORLD.Ranged.LockedOn", value: 3, key: "accuracy", lockOn: true });
  });

  it("counts a second's worth of a scope", () => {
    const lines: RollModifier[] = [];
    // A variable-power +2 scope, after one second: +1.
    applyLockOn(lines, true, { ...missile, scopeBonus: 2 });
    expect(lines[0]).toMatchObject({ value: 4, scope: 1 });
  });

  it("adds nothing beside an Accuracy the attack already has", () => {
    const lines: RollModifier[] = [{ label: "Accuracy", value: 3, key: "accuracy" }];
    applyLockOn(lines, true, missile);
    expect(accuracy(lines)).toHaveLength(1);
  });

  it("takes away only the line the lock-on alone gave", () => {
    const locked: RollModifier[] = [{ label: "Accuracy (locked on)", value: 3, key: "accuracy", lockOn: true }];
    applyLockOn(locked, false, missile);
    expect(locked).toEqual([]);
    const aimed: RollModifier[] = [{ label: "Accuracy", value: 3, key: "accuracy" }];
    applyLockOn(aimed, false, missile);
    expect(aimed).toHaveLength(1);
  });
});

describe("designationLevel", () => {
  const skill = (name: string, level: number) => ({ type: "skill", name, system: { derived: { level } } });

  it("rolls Forward Observer DX-based", () => {
    // Forward Observer 13 on IQ 12 is IQ+1; on DX 14, that is 15.
    const actor = { items: [skill("Forward Observer/TL8", 13)], system: { derived: { attributes: { IQ: 12, DX: 14 } } } };
    expect(designationLevel(actor)).toBe(15);
  });

  it("falls back on the IQ-5 default, made DX-based", () => {
    const actor = { items: [], system: { derived: { attributes: { IQ: 12, DX: 11 } } } };
    expect(designationLevel(actor)).toBe(6);
  });
});

describe("gworld.homingAttack", () => {
  const firer = { name: "Firer" };
  const base = {
    actor: firer,
    item: null,
    mode: null,
    shot: { rangeYards: 500 },
    weapon: missile,
    semiActive: true,
  };

  it("starts from the dialog and the row, with the firer holding the spot", () => {
    let seen: any = null;
    listen(COMBAT_HOOKS.homingAttack, (context) => {
      seen = { ...context };
    });
    const homing = homingAttack({ ...base, shot: { rangeYards: 500, lockedOn: true } });
    expect(seen).toMatchObject({
      actor: firer,
      target: null,
      rangeYards: 500,
      seconds: 3,
      falls: false,
      lockedOn: true,
      semiActive: true,
      designator: firer,
      skill: DESIGNATION_SKILL,
      level: null,
      rolls: 3,
    });
    expect(homing).toMatchObject({ lockedOn: true, semiActive: true, designator: firer, rolls: 3, level: null });
  });

  it("lets a listener name the designator, the skill and the level, and lock on", () => {
    const spotter = { name: "Spotter" };
    listen(COMBAT_HOOKS.homingAttack, (context) => {
      context.lockedOn = true;
      context.designator = spotter;
      context.skill = "Gunner";
      context.level = 14.6;
      context.rolls = 2;
    });
    expect(homingAttack({ ...base, semiActive: false })).toMatchObject({
      lockedOn: true,
      semiActive: false,
      designator: spotter,
      skill: "Gunner",
      level: 14,
      rolls: 2,
    });
  });

  it("names the one token targeted", () => {
    const foe = { name: "Foe" };
    (globals.game as any).user.targets = new Set([{ actor: foe }]);
    let target: unknown = undefined;
    listen(COMBAT_HOOKS.homingAttack, (context) => {
      target = context.target;
    });
    homingAttack(base);
    expect(target).toBe(foe);
  });

  it("asks no rolls of a missile that crashes before it arrives", () => {
    expect(homingAttack({ ...base, shot: { rangeYards: 3000 } })).toMatchObject({ falls: true, rolls: 0 });
  });

  it("keeps the defaults where a listener leaves nonsense", () => {
    listen(COMBAT_HOOKS.homingAttack, (context) => {
      context.designator = null;
      context.skill = " ";
      context.level = "high";
      context.rolls = -2;
    });
    expect(homingAttack(base)).toMatchObject({ designator: firer, skill: DESIGNATION_SKILL, level: null, rolls: 0 });
  });
});
