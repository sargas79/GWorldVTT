import { describe, expect, it } from "vitest";

import {
  flaggedSignatureItems,
  flatSignatureBilling,
  flatSignatureGearCost,
  isSignatureGearName,
} from "../flat-signature-gear.js";

describe("flat-cost Signature Gear (Revised p. 342)", () => {
  it("recognises the trait with or without a specialty", () => {
    expect(isSignatureGearName("Signature Gear")).toBe(true);
    expect(isSignatureGearName("Signature Gear (Sabre)")).toBe(true);
    expect(isSignatureGearName("signature gear")).toBe(true);
    expect(isSignatureGearName("Signature Gearbox")).toBe(false);
    expect(isSignatureGearName("Weapon Bond")).toBe(false);
  });

  it("counts the flagged items, a point each", () => {
    const items = [{ system: { signature: true } }, { system: { signature: false } }, { system: {} }, { system: { signature: true } }];
    expect(flaggedSignatureItems(items)).toHaveLength(2);
    expect(flatSignatureGearCost(2)).toBe(2);
    expect(flatSignatureGearCost(-1)).toBe(0);
    expect(flatSignatureGearCost(Number.NaN)).toBe(0);
  });

  it("bills the whole count on the first trait, and a flag with no trait anyway", () => {
    const held = flatSignatureBilling([{ id: "a", name: "Signature Gear" }, { id: "b", name: "Signature Gear (Car)" }, { id: "c", name: "Ally" }], 3);
    expect(held.byTrait.get("a")).toBe(3);
    expect(held.byTrait.get("b")).toBe(0);
    expect(held.byTrait.has("c")).toBe(false);
    expect(held.unbilled).toBe(0);
    expect(flatSignatureBilling([{ id: "c", name: "Ally" }], 2)).toEqual({ byTrait: new Map(), unbilled: 2 });
  });
});
