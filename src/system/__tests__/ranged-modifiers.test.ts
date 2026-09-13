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

const bow = { accuracy: 2, scopeBonus: 0, bulk: -6 };
const rifle = { accuracy: 5, scopeBonus: 2, bulk: -5 };

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

  /**
   * A scope pays out for the seconds actually spent behind it (Campaigns
   * p. 411): "with a variable-power scope, you may Aim for fewer seconds, but
   * this reduces your bonus by a like amount", and scopes are variable-power
   * unless the table says otherwise.
   *
   * So a rifle with Acc 5 and a +2 scope, aimed for the one second a ticked
   * box is worth, comes to 6 rather than 7. This test asserted 7 before the
   * rule was implemented, which was the whole scope for one second of aiming.
   */
  it("counts only as much of a scope as the aiming has paid for", () => {
    expect(valueOf(rangedModifiers(shot({ aimed: true }), rifle), "Accuracy")).toBe(6);
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

describe("Bulk (pp. 365, 391)", () => {
  it("does not apply to an ordinary shot", () => {
    expect(valueOf(rangedModifiers(shot({ range: 20 }), bow), "Bulk")).toBeUndefined();
  });

  /** "-2 or -Bulk of weapon, whichever is worse" -- a bow at -6 is worse. */
  it("takes the worse of -2 and Bulk on a Move and Attack", () => {
    const mods = rangedModifiers(shot({ situation: "moveAndAttack" }), bow);
    expect(valueOf(mods, "Bulk")).toBe(-6);
    const small = rangedModifiers(shot({ situation: "moveAndAttack" }), {
      accuracy: 1,
      scopeBonus: 0,
      bulk: -1,
    });
    expect(valueOf(small, "Bulk")).toBe(-2);
  });

  /** A Move and Attack loses the benefit of having aimed. */
  it("drops Accuracy on a Move and Attack even when aimed", () => {
    const mods = rangedModifiers(shot({ situation: "moveAndAttack", aimed: true }), bow);
    expect(valueOf(mods, "Accuracy")).toBeUndefined();
  });

  /**
   * In close combat the target is right there: the speed/range penalty is
   * dropped and Bulk stands in its place.
   */
  it("replaces the speed/range penalty with Bulk in close combat", () => {
    const mods = rangedModifiers(shot({ range: 20, situation: "closeCombat" }), bow);
    expect(valueOf(mods, "SpeedRange")).toBeUndefined();
    expect(valueOf(mods, "Bulk")).toBe(-6);
  });

  it("keeps Accuracy in close combat, which only a Move and Attack forfeits", () => {
    const mods = rangedModifiers(shot({ situation: "closeCombat", aimed: true }), bow);
    expect(valueOf(mods, "Accuracy")).toBe(2);
  });
});

describe("opportunity fire (p. 390)", () => {
  const watching = (hexesWatched: number, coveringLine = false) => ({
    ...bow,
    watching: { hexesWatched, coveringLine },
  });

  it("charges for the ground being covered", () => {
    expect(valueOf(rangedModifiers(shot(), watching(1)), "OpportunityFire")).toBe(0);
    expect(valueOf(rangedModifiers(shot(), watching(4)), "OpportunityFire")).toBe(-2);
    expect(valueOf(rangedModifiers(shot(), watching(20)), "OpportunityFire")).toBe(-5);
  });

  it("charges a flat two for a line", () => {
    expect(valueOf(rangedModifiers(shot(), watching(30, true)), "OpportunityFire")).toBe(-2);
  });

  it("does not charge a shooter who is not waiting", () => {
    expect(valueOf(rangedModifiers(shot(), bow), "OpportunityFire")).toBeUndefined();
  });

  /**
   * "You cannot claim any of the bonuses listed for the Aim maneuver.
   * Exception: If you watch a single hex (only), you can Aim and Wait."
   */
  it("lets only a single watched hex keep Accuracy", () => {
    expect(valueOf(rangedModifiers(shot({ aimed: true }), watching(1)), "Accuracy")).toBe(2);
    expect(valueOf(rangedModifiers(shot({ aimed: true }), watching(2)), "Accuracy")).toBeUndefined();
    expect(
      valueOf(rangedModifiers(shot({ aimed: true }), watching(1, true)), "Accuracy"),
    ).toBeUndefined();
  });
});

/**
 * Guided and homing weapons (GURPS Basic Set: Campaigns p. 412). The missile
 * is a Complexity all its own: it ignores the distance, it may ignore the
 * firer entirely, and it is aimed by the time it arrives without anybody
 * having taken an Aim maneuver.
 */
describe("steered weapons", () => {
  // Acc 5, 1/2D 200 (its speed in yards a second), Max 2000.
  const missile = {
    accuracy: 5,
    scopeBonus: 0,
    bulk: -8,
    halfDamageRange: 200,
    maxRange: 2000,
  };

  it("still takes the speed/range penalty when it is not steered", () => {
    const mods = rangedModifiers(shot({ range: 500 }), { ...missile, guidance: "" });
    expect(valueOf(mods, "SpeedRange")).toBe(-14);
  });

  it("ignores range modifiers once it steers", () => {
    for (const guidance of ["guided", "homing"]) {
      const mods = rangedModifiers(shot({ range: 500 }), { ...missile, guidance });
      expect(valueOf(mods, "SpeedRange")).toBeUndefined();
    }
  });

  it("keeps the target's size, which applies to everything", () => {
    const mods = rangedModifiers(shot({ range: 500, size: -2 }), { ...missile, guidance: "homing" });
    expect(valueOf(mods, "TargetSize")).toBe(-2);
  });

  it("is aimed by a journey of more than a second, with no Aim maneuver", () => {
    // 500 yards at 200 a second is three seconds in the air.
    const mods = rangedModifiers(shot({ range: 500 }), { ...missile, guidance: "guided" });
    expect(valueOf(mods, "Accuracy")).toBe(5);
  });

  it("gets no Accuracy on a shot that arrives the same second unaimed", () => {
    // 100 yards at 200 a second arrives on the turn it was fired.
    const mods = rangedModifiers(shot({ range: 100 }), { ...missile, guidance: "guided" });
    expect(valueOf(mods, "Accuracy")).toBeUndefined();
  });

  it("takes the firer's darkness for a guided weapon but not a homing one", () => {
    const dark = shot({ range: 500, darkness: 5 });
    expect(total(rangedModifiers(dark, { ...missile, guidance: "guided" }))).toBeLessThan(
      total(rangedModifiers(dark, { ...missile, guidance: "homing" })),
    );
    expect(
      rangedModifiers(dark, { ...missile, guidance: "homing" }).some((m) =>
        m.label.includes("Darkness"),
      ),
    ).toBe(false);
  });
});
