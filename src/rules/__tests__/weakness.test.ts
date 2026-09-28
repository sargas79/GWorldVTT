import { describe, expect, it } from "vitest";

import { mayBePerAttack, weaknessAttackDice, weaknessDice, weaknessOf } from "../weakness.js";

/** Characters p. 161. */
describe("reading a Weakness", () => {
  it("takes its rate from the level bought and its source from the name", () => {
    expect(weaknessOf({ name: "Weakness (Sunlight)", levels: 3 })).toEqual({
      source: "Sunlight", intervalMinutes: 1, fatigue: false, variable: false,
    });
    expect(weaknessOf({ name: "Weakness (Horses)", levels: 1 })?.intervalMinutes).toBe(30);
    expect(weaknessOf({ name: "Weakness (Horses)", levels: 2 })?.intervalMinutes).toBe(5);
  });

  it("drops a rate written into the name, since the level states it", () => {
    // A creature's entry may write the rate into the trait's name.
    expect(weaknessOf({ name: "Weakness (Contact with holy water and artifacts; 1d per minute)", levels: 3 })?.source)
      .toBe("Contact with holy water and artifacts");
  });

  it("reads Fatigue Only and Variable off its limitations", () => {
    const w = weaknessOf({ name: "Weakness (Sunlight)", levels: 3, modifiers: ["Fatigue Only", "Variable"] });
    expect(w?.fatigue).toBe(true);
    expect(w?.variable).toBe(true);
  });

  it("is not a Weakness when the trait is something else", () => {
    expect(weaknessOf({ name: "Weirdness Magnet" })).toBe(null);
    expect(weaknessOf({ name: "Vulnerability (Silver x4)" })).toBe(null);
  });
});

describe("what exposure costs", () => {
  const sun = { intervalMinutes: 1, variable: false };

  it("is one die per whole interval", () => {
    expect(weaknessDice(sun, 3)).toBe(3);
    expect(weaknessDice(sun, 0.5)).toBe(0);
    expect(weaknessDice({ intervalMinutes: 30, variable: false }, 45)).toBe(1);
  });

  it("halves behind a barrier and doubles for an intense source, only when Variable", () => {
    const variable = { intervalMinutes: 1, variable: true };
    expect(weaknessDice(variable, 4, "shielded")).toBe(2);
    expect(weaknessDice(variable, 4, "intense")).toBe(8);
    expect(weaknessDice(sun, 4, "intense")).toBe(4);
  });
});

/** Characters p. 161: "1d per minute* ... * Or per attack, for things useful as attacks." */
describe("a Weakness read per attack", () => {
  it("is offered only at 1d per minute", () => {
    expect(mayBePerAttack({ intervalMinutes: 1 })).toBe(true);
    expect(mayBePerAttack({ intervalMinutes: 5 })).toBe(false);
    expect(mayBePerAttack({ intervalMinutes: 30 })).toBe(false);
  });

  it("costs one die per attack", () => {
    expect(weaknessAttackDice({ intervalMinutes: 1 }, 3)).toBe(3);
    expect(weaknessAttackDice({ intervalMinutes: 1 }, 2.9)).toBe(2);
    expect(weaknessAttackDice({ intervalMinutes: 1 }, -1)).toBe(0);
    expect(weaknessAttackDice({ intervalMinutes: 5 }, 3)).toBe(0);
  });
});
