import { describe, expect, it } from "vitest";
import {
  BATTERY_TYPES,
  CELL_TYPES,
  daysOfPower,
  rechargeableCost,
  reloadTally,
  sparesPerDay,
  substituteCount,
  substituteUptime,
  trackedRegardless,
} from "../simplified-resources.js";

describe("Simplified Resources (Basic Set Revised p. 578)", () => {
  it("tallies five reloads and their containers", () => {
    expect(reloadTally({ reloadCost: 10, reloadWeight: 1, containerCost: 6, containerWeight: 0.5 })).toEqual({ cost: 56, weight: 5.5 });
    expect(reloadTally({ reloadCost: 8, reloadWeight: 2, reloads: 1 })).toEqual({ cost: 8, weight: 2 });
  });

  it("gives every gizmo a day and an extra day per set of spares", () => {
    expect(sparesPerDay(7)).toEqual({ cost: 3, weight: 1 });
    expect(sparesPerDay(9)).toEqual({ cost: 10, weight: 0.5 });
    expect(daysOfPower({ tl: 7 })).toBe(1);
    expect(daysOfPower({ tl: 7, spareCost: 9, spareWeight: 2 })).toBe(3);
    expect(daysOfPower({ tl: 10, spareCost: 40, spareWeight: 1.5 })).toBe(4);
  });

  it("never simplifies explosives, fine or magical ammunition", () => {
    expect(trackedRegardless({ explosive: true })).toBe(true);
    expect(trackedRegardless({ fine: true })).toBe(true);
    expect(trackedRegardless({ magical: true })).toBe(true);
    expect(trackedRegardless({ generic: true })).toBe(false);
  });

  it("has the thirteen types", () => {
    expect(BATTERY_TYPES).toHaveLength(6);
    expect(CELL_TYPES).toHaveLength(7);
    expect(rechargeableCost(1)).toBe(5);
  });

  it("substitutes by ten per line and two per TL", () => {
    expect(substituteCount({ required: 10, from: "S", to: "M" })).toBe(1);
    expect(substituteCount({ required: 1, from: "M", to: "S" })).toBe(10);
    expect(substituteCount({ required: 4, from: "C", to: "C", tlDifference: 2 })).toBe(1);
    expect(substituteCount({ required: 1, from: "C", to: "C", tlDifference: -1 })).toBe(2);
    expect(substituteCount({ required: 1, from: "S", to: "AA" })).toBeNull();
    expect(substituteUptime({ uptime: 5, from: "M", to: "S" })).toBe(0.5);
  });
});
