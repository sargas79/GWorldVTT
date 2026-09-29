import { describe, expect, it } from "vitest";

import {
  COST_FACTOR_FLOOR,
  cfFromMultiple,
  cfFromPercentAdded,
  cfFromPercentOfList,
  presentationCostFactor,
  priceFromCostFactors,
  pricingOf,
  totalCostFactor,
} from "../cost-factors.js";
import {
  gradeAfterMaterial,
  qualityCostFactor,
  silverCostFactor,
  silverCostMultiplier,
} from "../weapon-quality.js";

describe("cost factors (Revised p. 342)", () => {
  it("reads a multiple, a percentage of list and an added percentage", () => {
    expect(cfFromMultiple(4)).toBe(3);
    expect(cfFromMultiple(0.4)).toBe(-0.6);
    expect(cfFromPercentOfList(400)).toBe(3);
    expect(cfFromPercentOfList(40)).toBe(-0.6);
    expect(cfFromPercentAdded(300)).toBe(3);
  });

  it("prices the bejeweled fine sword as x23, not x80", () => {
    // x20 for jewels is +19, x4 for fine is +3.
    expect(totalCostFactor([19, 3])).toBe(22);
    expect(priceFromCostFactors(100, [19, 3])).toBe(2300);
  });

  it("never falls below -0.8", () => {
    expect(COST_FACTOR_FLOOR).toBe(-0.8);
    expect(totalCostFactor([-0.6, -0.6])).toBe(-0.8);
    expect(priceFromCostFactors(100, [-2])).toBe(20);
  });

  it("maps the Basic Set grade prices onto CFs exactly", () => {
    expect(qualityCostFactor("fencing", "fine", 3)).toBe(3);
    expect(qualityCostFactor("sword", "veryFine", 3)).toBe(19);
    expect(qualityCostFactor("cutting", "fine", 3)).toBe(9);
    expect(qualityCostFactor("crushing", "fine", 3)).toBe(2);
    expect(qualityCostFactor("firearm", "fine", 6)).toBe(1);
    expect(qualityCostFactor("firearm", "veryFine", 6)).toBe(4);
    expect(qualityCostFactor("bow", "fine", 3)).toBe(3);
    expect(qualityCostFactor("bow", "cheap", 3)).toBeNull();
    expect(qualityCostFactor("sword", "cheap", 3)).toBe(-0.6);
    expect(qualityCostFactor("sword", "cheap", 7)).toBe(-0.8);
  });

  it("makes silver a surcharge on the good-quality price", () => {
    expect(silverCostFactor("silver")).toBe(19);
    expect(silverCostFactor("silverCoated")).toBe(2);
    expect(silverCostFactor("silver", true)).toBe(49);
    expect(silverCostMultiplier("silver")).toBe(20);
    expect(silverCostMultiplier("silverCoated")).toBe(3);
    expect(silverCostMultiplier("silver", true)).toBe(50);
    // At TL7+ a good weapon is 40% of the list price, and so is the surcharge's base.
    expect(silverCostMultiplier("silver", false, 0.4)).toBeCloseTo(8);
  });

  it("keeps fine, very fine and silver mutually exclusive", () => {
    expect(gradeAfterMaterial("fine", "silver")).toBe("good");
    expect(gradeAfterMaterial("veryFine", "silverCoated")).toBe("good");
    expect(gradeAfterMaterial("cheap", "silver")).toBe("cheap");
    // The pair is forbidden: a "fine" solid-silver blade is priced as good quality, x20, never x200.
    const blade = pricingOf({ kind: "weapon", weaponClass: "sword", quality: "fine", material: "silver", tl: 3 });
    expect(blade.costMultiplier).toBe(20);
  });

  it("adds the modifiers of a weapon", () => {
    const fine = pricingOf({ kind: "weapon", weaponClass: "fencing", quality: "fine", tl: 3, balanced: true, disguised: true });
    // +3 fine, +4 balanced, +4 disguised.
    expect(fine.total).toBe(11);
    expect(fine.costMultiplier).toBe(12);
    expect(fine.effects.skill).toBe(1);
    const bow = pricingOf({ kind: "weapon", weaponClass: "bow", quality: "good", tl: 3, balanced: true });
    expect(bow.effects.accuracy).toBe(1);
    expect(bow.effects.skill).toBe(0);
    expect(pricingOf({ kind: "weapon", weaponClass: "sword", quality: "good", material: "plastic", tl: 3 }))
      .toMatchObject({ costMultiplier: 2, weightFactor: 0.5 });
  });

  it("prices shields by composition, fine and balanced", () => {
    expect(pricingOf({ kind: "shield", composition: "iron" })).toMatchObject({ total: 4, weightFactor: 2 });
    expect(pricingOf({ kind: "shield", composition: "mirrored" }).total).toBe(6);
    // A fine iron shield: +4 +9, weight x2 x 3/4 = x1.5.
    const fineIron = pricingOf({ kind: "shield", composition: "iron", fine: true });
    expect(fineIron.total).toBe(13);
    expect(fineIron.weightFactor).toBe(1.5);
    expect(pricingOf({ kind: "shield", composition: "wood", balanced: true }).total).toBe(4);
  });

  it("prices fine armor at +9 and weight x3/4", () => {
    expect(pricingOf({ kind: "armor", fine: true })).toMatchObject({ total: 9, costMultiplier: 10, weightFactor: 0.75 });
    expect(pricingOf({ kind: "armor" })).toMatchObject({ total: 0, costMultiplier: 1, weightFactor: 1 });
  });

  it("prices tools by grade and multiplies their weights", () => {
    expect(pricingOf({ kind: "tool", equipmentQuality: "good" }).costMultiplier).toBe(5);
    expect(pricingOf({ kind: "tool", equipmentQuality: "fine" }).costMultiplier).toBe(20);
    // A cutting-edge, rugged camera weighs 0.8 as much.
    const camera = pricingOf({ kind: "tool", cuttingEdge: true, rugged: true });
    expect(camera.weightFactor).toBe(0.8);
    expect(camera.total).toBe(2);
    expect(camera.effects).toMatchObject({ ht: 2, drFactor: 2 });
    // Good quality and cutting-edge add: +4 +1 is x6, not x10.
    expect(pricingOf({ kind: "tool", equipmentQuality: "good", cuttingEdge: true }).costMultiplier).toBe(6);
  });

  it("reads Presentation as +1, +4 or +9 CF for +1 to +3 reactions", () => {
    expect([0, 1, 2, 3, 4].map(presentationCostFactor)).toEqual([0, 1, 4, 9, 9]);
    const item = pricingOf({ kind: "armor", presentation: 2 });
    expect(item.total).toBe(4);
    expect(item.effects.reactions).toBe(2);
  });

  it("does not price weapon grades on a tool", () => {
    // Good quality at TL7+ is 40% of list for a weapon; a tool has no such grade.
    expect(pricingOf({ kind: "tool", tl: 8 }).costMultiplier).toBe(1);
    expect(pricingOf({ kind: "weapon", weaponClass: "sword", quality: "good", tl: 8 }).costMultiplier).toBe(0.4);
  });
});
