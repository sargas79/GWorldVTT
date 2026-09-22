import { describe, expect, it } from "vitest";

import { mergeAttackEffects } from "../combat-extensions.js";
import { sweepOrder } from "../spraying-fire.js";
import { maySuppress, zoneCentres } from "../suppression-fire.js";

/** The Foundry side of Spraying and Suppression Fire (sargas79/GWorldVTT#593). */
describe("attack options that change the burst (since API 1.70.0)", () => {
  it("takes the higher of two Rates of Fire or Recoils set, and adds the Recoil modifiers", () => {
    const merged = mergeAttackEffects([{ rateOfFire: 12, recoil: 3, recoilModifier: 1 }, { rateOfFire: 20, recoil: 2, recoilModifier: 1 }]);
    expect(merged.rateOfFire).toBe(20);
    expect(merged.recoil).toBe(3);
    expect(merged.recoilModifier).toBe(2);
  });

  it("leaves them unset where no option set them", () => {
    const merged = mergeAttackEffects([{ shots: 1 }, { rateOfFire: 0, recoil: -1 }]);
    expect(merged.rateOfFire).toBeNull();
    expect(merged.recoil).toBeNull();
    expect(merged.recoilModifier).toBe(0);
  });
});

describe("Spraying Fire's sweep", () => {
  it("orders the targets from one side to the other, seen from the shooter", () => {
    // Shooter at the origin, targets fanned out to the east.
    const { order, spreadDegrees } = sweepOrder({ x: 0, y: 0 }, [{ x: 100, y: 10 }, { x: 100, y: -10 }, { x: 100, y: 0 }]);
    expect(order).toEqual([1, 2, 0]);
    expect(spreadDegrees).toBeCloseTo(11.4, 1);
  });

  it("measures the spread across the seam behind the shooter", () => {
    const { spreadDegrees } = sweepOrder({ x: 0, y: 0 }, [{ x: -100, y: 5 }, { x: -100, y: -5 }]);
    expect(spreadDegrees).toBeLessThan(10);
  });

  it("keeps the targeting order where the map can't say", () => {
    expect(sweepOrder(null, [{ x: 1, y: 1 }, null])).toEqual({ order: [0, 1], spreadDegrees: null });
  });
});

describe("Suppression Fire's zones", () => {
  it("needs RoF 5+ on a row that doesn't refuse it", () => {
    expect(maySuppress({ rateOfFire: 10 })).toBe(true);
    expect(maySuppress({ rateOfFire: 3 })).toBe(false);
    expect(maySuppress({ rateOfFire: 10, noSuppressionFire: true })).toBe(false);
    expect(maySuppress({ rateOfFire: "10", noSuppressionFire: "1" })).toBe(false);
  });

  it("puts further zones beside the first, across the line of fire", () => {
    // Firing east: the zones step north and south of the aim point.
    const centres = zoneCentres({ x: 0, y: 0 }, { x: 500, y: 0 }, 3, 200);
    expect(centres[0]).toEqual({ x: 500, y: 0 });
    expect(centres[1]!.x).toBeCloseTo(500);
    expect(centres[1]!.y).toBeCloseTo(200);
    expect(centres[2]!.y).toBeCloseTo(-200);
  });
});
