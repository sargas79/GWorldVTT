import { describe, expect, it } from "vitest";

import { buySuccessCost, guidanceCost, outcomeStep, purchasableSteps } from "../bonus-points.js";

describe("buying successes", () => {
  it("costs 2, 1 and 2 a step, cumulatively: critical failure to critical success is 5", () => {
    expect(buySuccessCost("criticalFailure", "failure", { combat: false })).toBe(2);
    expect(buySuccessCost("failure", "success", { combat: false })).toBe(1);
    expect(buySuccessCost("success", "criticalSuccess", { combat: false })).toBe(2);
    expect(buySuccessCost("criticalFailure", "criticalSuccess", { combat: false })).toBe(5);
  });

  it("refuses a bought critical in combat, but not a bought success", () => {
    expect(buySuccessCost("criticalFailure", "criticalSuccess", { combat: true })).toBe(null);
    expect(buySuccessCost("criticalFailure", "success", { combat: true })).toBe(3);
    expect(purchasableSteps("failure", { combat: true })).toEqual([{ step: "success", cost: 1 }]);
  });

  it("does not sell a step down", () => {
    expect(buySuccessCost("success", "failure", { combat: false })).toBe(null);
  });

  it("reads a roll's step", () => {
    expect(outcomeStep({ success: false, criticalSuccess: false, criticalFailure: true })).toBe("criticalFailure");
    expect(outcomeStep({ success: true, criticalSuccess: false, criticalFailure: false })).toBe("success");
  });
});

describe("player guidance", () => {
  it("is 1, 2 or 3, a point less after a critical success but at least 1", () => {
    expect(guidanceCost("moderate")).toBe(2);
    expect(guidanceCost("major", true)).toBe(2);
    expect(guidanceCost("minor", true)).toBe(1);
  });
});
