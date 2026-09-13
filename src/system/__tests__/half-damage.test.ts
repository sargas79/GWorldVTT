import { describe, expect, it } from "vitest";

import { beyondHalfDamage } from "../roll.js";

/**
 * Whether a shot has reached its weapon's half-damage range (GURPS Basic Set:
 * Characters p. 270): "Damaging attacks on targets at or beyond 1/2D inflict
 * half damage."
 */
describe("beyondHalfDamage", () => {
  it("halves at 1/2D and past it", () => {
    expect(beyondHalfDamage({ rangeYards: 150, halfDamageRange: 150 })).toBe(true);
    expect(beyondHalfDamage({ rangeYards: 400, halfDamageRange: 150 })).toBe(true);
  });

  it("does not halve short of it", () => {
    expect(beyondHalfDamage({ rangeYards: 149, halfDamageRange: 150 })).toBe(false);
  });

  it("never halves a weapon with no 1/2D listed", () => {
    expect(beyondHalfDamage({ rangeYards: 1000, halfDamageRange: 0 })).toBe(false);
  });

  it("never halves a guided or homing weapon, whose 1/2D is its speed", () => {
    // "If a guided or homing attack has a 1/2D statistic, do not halve damage."
    expect(beyondHalfDamage({ rangeYards: 1000, halfDamageRange: 200, guidance: "guided" })).toBe(false);
    expect(beyondHalfDamage({ rangeYards: 1000, halfDamageRange: 200, guidance: "homing" })).toBe(false);
    expect(beyondHalfDamage({ rangeYards: 1000, halfDamageRange: 200, guidance: "" })).toBe(true);
  });
});
