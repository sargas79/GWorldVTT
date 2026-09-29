import { describe, expect, it } from "vitest";

import {
  abilityUseRolls, activationTarget, costsFatigueCost, powerModifierSource, requiredRolls, scaledDuration,
} from "../addendum-modifiers.js";
import { powersOf } from "../powers.js";

const scores = { dx: 12, iq: 11, ht: 10, will: 13, per: 12 };

describe("the roll to use an ability", () => {
  it("reads the Unreliable/Activation target from its price", () => {
    expect(activationTarget([{ name: "Unreliable/Activation", value: -10 }])).toBe(14);
    expect(activationTarget([{ name: "Unreliable/Activation", value: -40 }])).toBe(8);
    expect(activationTarget([{ name: "Unreliable/Activation", value: -80 }])).toBe(5);
    expect(activationTarget([{ name: "Reliable", value: 5 }])).toBeNull();
  });

  it("reads Costs Fatigue back as FP", () => {
    expect(costsFatigueCost([{ name: "Costs Fatigue", value: -15 }])).toBe(3);
    expect(costsFatigueCost([])).toBe(0);
  });

  it("lists each Requires roll, then the activation roll", () => {
    const needs = requiredRolls(
      [{ name: "Requires Will Roll", value: -5 }, { name: "Requires Will Roll (Quick Contest)", value: -10 }, { name: "Requires Active Defense Roll", value: -40 }],
      scores,
    );
    const rolls = abilityUseRolls(needs, 11, scores);
    expect(rolls.map((r) => r.base)).toEqual([13, 13, 9, 11]);
    expect(rolls.map((r) => r.contest)).toEqual([false, true, false, false]);
    // Hard to Use and Reliable are not a defense's business.
    expect(rolls.map((r) => r.modified)).toEqual([true, true, false, true]);
  });

  it("leaves a skill roll's target to be asked for", () => {
    const needs = requiredRolls([{ name: "Requires Skill Roll (DX, IQ or HT skill)", value: -10 }], scores);
    expect(abilityUseRolls(needs, null, scores)).toMatchObject([{ base: null, modified: true }]);
  });

  it("has nothing to roll for a plain trait", () => {
    expect(abilityUseRolls([], null, scores)).toEqual([]);
  });
});

describe("Reduced Duration on a condition", () => {
  it("divides turns, rounds and seconds, never under one", () => {
    expect(scaledDuration({ rounds: 10, seconds: 60 }, 3)).toEqual({ rounds: 3, seconds: 20 });
    expect(scaledDuration({ turns: 2, seconds: 5 }, 10)).toEqual({ turns: 1, seconds: 1 });
  });
  it("leaves a duration alone with no divisor or no duration", () => {
    expect(scaledDuration({ turns: 4 }, 1)).toEqual({ turns: 4 });
    expect(scaledDuration(undefined, 3)).toBeUndefined();
  });
});

describe("power modifiers as origins on the Powers list", () => {
  it("never makes Cosmic an origin", () => {
    expect(powerModifierSource(["Cosmic"])).toBeNull();
    expect(powersOf([{ name: "Telekinesis-like", modifiers: ["Cosmic"] }])).toEqual([]);
  });
  it("prefers a specific origin to Magical", () => {
    expect(powerModifierSource(["Magical", "Divine"])?.origin).toBe("Divine");
    expect(powerModifierSource(["Magical"])?.origin).toBe("Magical");
  });
  it("still files a Divine trait under its origin", () => {
    const powers = powersOf([{ name: "Healing Touch", modifiers: ["Divine"] }]);
    expect(powers.map((p) => p.name)).toEqual(["Divine"]);
  });
});
