import { describe, expect, it } from "vitest";

import { multipleProjectiles, parseRateOfFire } from "../shotguns.js";
import { rapidFireBonus, rapidFireHits } from "../ranged.js";

/** Shotguns and multiple projectiles (GURPS Basic Set: Campaigns p. 409). */
describe("parseRateOfFire", () => {
  it("reads shots times projectiles", () => {
    expect(parseRateOfFire("3x9")).toEqual({ shots: 3, projectiles: 9 });
    expect(parseRateOfFire("2×9")).toEqual({ shots: 2, projectiles: 9 });
  });

  it("reads a plain figure as one projectile a shot", () => {
    expect(parseRateOfFire("3")).toEqual({ shots: 3, projectiles: 1 });
    expect(parseRateOfFire(10)).toEqual({ shots: 10, projectiles: 1 });
  });

  it("reads nonsense as one of one", () => {
    expect(parseRateOfFire("")).toEqual({ shots: 1, projectiles: 1 });
    expect(parseRateOfFire(undefined)).toEqual({ shots: 1, projectiles: 1 });
  });
});

describe("multipleProjectiles", () => {
  const shotgun = { projectiles: 9, recoil: 1, halfDamageRange: 50 };

  it("leaves a single-projectile weapon alone", () => {
    expect(multipleProjectiles({ shotsFired: 3, projectiles: 1, recoil: 2, rangeYards: 20, halfDamageRange: 120 }))
      .toEqual({ effectiveShots: 3, recoil: 2, coneMultiplier: null });
  });

  /** "treat this as an attack with RoF equal to shots times projectiles" */
  it("counts every pellet as a shot for the rapid-fire bonus, at Rcl 1", () => {
    const burst = multipleProjectiles({ ...shotgun, shotsFired: 3, rangeYards: 20 });
    expect(burst.effectiveShots).toBe(27);
    expect(burst.recoil).toBe(1);
    expect(burst.coneMultiplier).toBeNull();
    // 27 shots is +5 on the rapid-fire table, and every point of margin is a hit.
    expect(rapidFireBonus(burst.effectiveShots)).toBe(5);
    expect(rapidFireHits({ margin: 4, shotsFired: burst.effectiveShots, recoil: burst.recoil })).toBe(5);
  });

  /** "at ranges up to 10% of 1/2D, the projectiles strike as a single mass" */
  it("strikes as one mass up close, multiplying by half the pellets rounded up", () => {
    const close = multipleProjectiles({ ...shotgun, shotsFired: 1, rangeYards: 5 });
    expect(close.coneMultiplier).toBe(5);
    expect(multipleProjectiles({ ...shotgun, shotsFired: 1, rangeYards: 6 }).coneMultiplier).toBeNull();
    expect(multipleProjectiles({ ...shotgun, projectiles: 8, shotsFired: 1, rangeYards: 2 }).coneMultiplier).toBe(4);
  });

  it("has no cone for a weapon without a 1/2D range", () => {
    expect(multipleProjectiles({ ...shotgun, halfDamageRange: 0, shotsFired: 1, rangeYards: 0 }).coneMultiplier).toBeNull();
  });
});
