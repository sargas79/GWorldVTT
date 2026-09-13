import { describe, expect, it } from "vitest";

import {
  gadgetCostFactor,
  gadgetWeightFactor,
  holdoutBonus,
  improvedGadget,
  signatureGearPointCost,
} from "../gadgets.js";

describe("gadget cost factors (Monster Hunters 1 p. 54)", () => {
  it("makes a cutting-edge, rugged flashlight three times the price and 0.8 times the weight", () => {
    const light = improvedGadget({ listCost: 20, listWeight: 1, improvements: { cuttingEdge: true, rugged: true } });
    expect(light).toMatchObject({ cost: 60, costFactor: 2 });
    expect(light.weight).toBe(0.8);
  });

  it("adds Disguised, good and fine quality to the factor", () => {
    expect(gadgetCostFactor({ disguised: true }, "good")).toBe(8);
    expect(gadgetCostFactor({}, "fine")).toBe(19);
    expect(gadgetCostFactor({}, "improvised")).toBe(0);
  });

  it("multiplies weights", () => {
    expect(gadgetWeightFactor({ cuttingEdge: true })).toBeCloseTo(2 / 3);
    expect(gadgetWeightFactor({})).toBe(1);
  });
});

describe("clothing (p. 59)", () => {
  it("prices Scent-Masking and Undercover", () => {
    expect(gadgetCostFactor({ scentMasking: true })).toBe(2);
    expect(gadgetCostFactor({ undercover: 1 })).toBe(4);
    expect(gadgetCostFactor({ undercover: 2 })).toBe(19);
  });

  it("adds Undercover +2 to a long coat's own +4 Holdout", () => {
    expect(holdoutBonus({ own: 4, undercover: 2 })).toBe(6);
    expect(holdoutBonus({ own: 0, undercover: 5 })).toBe(2);
  });
});

describe("Signature Gear (p. 53)", () => {
  it("costs a point per $10,000 or fraction, and at least one", () => {
    expect(signatureGearPointCost(7700)).toBe(1);
    expect(signatureGearPointCost(10000)).toBe(1);
    expect(signatureGearPointCost(10001)).toBe(2);
    expect(signatureGearPointCost(0)).toBe(1);
  });
});
