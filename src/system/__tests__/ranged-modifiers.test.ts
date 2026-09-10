import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { rangedModifiers } from "../roll.js";

const globals = globalThis as Record<string, unknown>;

beforeEach(() => {
  // The labels are localized; the arithmetic is what is under test, so the key
  // is echoed back rather than translated.
  globals.game = { i18n: { localize: (key: string) => key } };
});

afterEach(() => {
  delete globals.game;
});

const bow = { accuracy: 2, scopeBonus: 0 };
const rifle = { accuracy: 5, scopeBonus: 2 };

const shot = (over: Partial<Parameters<typeof rangedModifiers>[0]> = {}) => ({
  range: 0,
  speed: 0,
  size: 0,
  modifier: 0,
  aimed: false,
  ...over,
});

const valueOf = (mods: ReturnType<typeof rangedModifiers>, key: string) =>
  mods.find((m) => m.label.endsWith(key))?.value;

const total = (mods: ReturnType<typeof rangedModifiers>) =>
  mods.reduce((sum, m) => sum + m.value, 0);

describe("rangedModifiers", () => {
  it("adds nothing for a snap shot at point blank at a man-sized target", () => {
    expect(rangedModifiers(shot(), bow)).toEqual([]);
  });

  /** The Size and Speed/Range Table: 20 yards is -6 (GURPS Lite p. 27). */
  it("takes the speed/range penalty from the distance", () => {
    expect(valueOf(rangedModifiers(shot({ range: 20 }), bow), "SpeedRange")).toBe(-6);
  });

  it("adds the target's speed to the range before reading the table", () => {
    // 15 yards away, moving 5 yards a second, is read as 20.
    expect(valueOf(rangedModifiers(shot({ range: 15, speed: 5 }), bow), "SpeedRange")).toBe(-6);
    expect(valueOf(rangedModifiers(shot({ range: 15 }), bow), "SpeedRange")).toBe(-5);
  });

  it("applies the target's Size Modifier", () => {
    expect(valueOf(rangedModifiers(shot({ size: 4 }), bow), "TargetSize")).toBe(4);
    expect(valueOf(rangedModifiers(shot({ size: -2 }), bow), "TargetSize")).toBe(-2);
  });

  /**
   * Accuracy is what taking the Aim maneuver buys. A shot fired without aiming
   * gets none of it, and adding it anyway would make every ranged attack
   * several points easier than the rules allow.
   */
  it("adds Accuracy only to an aimed shot", () => {
    expect(valueOf(rangedModifiers(shot({ aimed: true }), bow), "Accuracy")).toBe(2);
    expect(valueOf(rangedModifiers(shot(), bow), "Accuracy")).toBeUndefined();
  });

  it("counts a scope with the Accuracy it is aimed alongside", () => {
    expect(valueOf(rangedModifiers(shot({ aimed: true }), rifle), "Accuracy")).toBe(7);
  });

  it("keeps a situational modifier alongside the rest", () => {
    const mods = rangedModifiers(shot({ range: 20, aimed: true, modifier: -2 }), bow);
    expect(total(mods)).toBe(-6 + 2 - 2);
  });

  it("omits a modifier that would be zero, so the card stays readable", () => {
    const mods = rangedModifiers(shot({ range: 2, size: 0, modifier: 0 }), bow);
    expect(mods).toEqual([]);
  });

  it("labels every modifier it returns", () => {
    const mods = rangedModifiers(shot({ range: 50, size: 3, aimed: true, modifier: 1 }), rifle);
    expect(mods).toHaveLength(4);
    for (const mod of mods) expect(mod.label).toBeTruthy();
  });
});
