import { describe, expect, it } from "vitest";

import { beyondHalfDamage, damageDistance } from "../roll.js";

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

/**
 * How far the target of a damage roll was, for a module's damage hook (since
 * API 1.69.0): what the attack recorded, the map where it recorded nothing.
 */
describe("damageDistance", () => {
  it("takes the range the caller gives", () => {
    expect(damageDistance({}, 42)).toBe(42);
    expect(damageDistance({}, -3)).toBe(0);
  });

  it("says nothing where the caller says it is not known", () => {
    expect(damageDistance({}, null)).toBeNull();
  });

  it("reads the map where nothing is given, and says nothing without one", () => {
    // No scene and no targets here, as in a roll made from a sheet with no canvas.
    expect(damageDistance({}, undefined)).toBeNull();
  });

  it("measures to the one targeted token on a scene in feet", () => {
    const g = globalThis as any;
    const saved = { game: g.game, canvas: g.canvas };
    try {
      const target = { center: { x: 0, y: 0 }, actor: { system: { sm: 0 } } };
      g.game = { user: { targets: [target] } };
      g.canvas = {
        scene: { grid: { units: "ft" } },
        grid: { measurePath: ([a, b]: Array<{ x: number }>) => ({ distance: Math.abs(b!.x - a!.x) }) },
      };
      const shooter = { getActiveTokens: () => [{ center: { x: 30, y: 0 } }] };
      expect(damageDistance(shooter, undefined)).toBe(10);
    } finally {
      g.game = saved.game;
      g.canvas = saved.canvas;
    }
  });
});
