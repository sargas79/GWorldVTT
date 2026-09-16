import { describe, expect, it } from "vitest";

import { ARMOR_DIVISOR_STEPS, ablativeLoss, drAgainst, hardenedAgainst, remainingDr } from "../armor.js";
import { armorLayers } from "../layered-armor.js";
import type { ArmorPiece } from "../armor.js";

const piece = (over: Partial<ArmorPiece> = {}): ArmorPiece => ({
  dr: 10, drSplit: null, drSplitAppliesTo: [], locations: [], ...over,
});

describe("Hardened (Characters p. 47)", () => {
  it("steps the divisor down the ladder the book prints", () => {
    // "These steps are, in order: 'ignores DR', 100, 10, 5, 3, 2, and 1."
    expect(ARMOR_DIVISOR_STEPS).toEqual([0, 100, 10, 5, 3, 2, 1]);
    expect(hardenedAgainst(10, false, 1).divisor).toBe(5);
    expect(hardenedAgainst(10, false, 2).divisor).toBe(3);
    expect(hardenedAgainst(5, false, 1).divisor).toBe(3);
    expect(hardenedAgainst(3, false, 1).divisor).toBe(2);
    expect(hardenedAgainst(2, false, 1).divisor).toBe(1);
  });

  it("brings an attack that ignores DR back onto the ladder", () => {
    const once = hardenedAgainst(1, true, 1);
    expect(once.ignoresDr).toBe(false);
    expect(once.divisor).toBe(100);

    // Six levels take it the whole way to no divisor at all.
    const fully = hardenedAgainst(1, true, 6);
    expect(fully.ignoresDr).toBe(false);
    expect(fully.divisor).toBe(1);
  });

  it("never steps past no divisor at all", () => {
    expect(hardenedAgainst(2, false, 9).divisor).toBe(1);
    expect(hardenedAgainst(1, false, 3).divisor).toBe(1);
  });

  it("reads a divisor the ladder does not list as the step at or below it", () => {
    // A (4) is not on the book's ladder. It stands at the first listed step it
    // is no better than, which is (3), so one level of Hardened makes it a (2).
    expect(hardenedAgainst(4, false, 1).divisor).toBe(2);
    expect(hardenedAgainst(100, false, 1).divisor).toBe(10);
  });

  it("leaves an attack alone where nothing is hardened", () => {
    expect(hardenedAgainst(5, false, 0)).toEqual({ divisor: 5, ignoresDr: false });
    expect(hardenedAgainst(1, true, 0)).toEqual({ divisor: 1, ignoresDr: true });
  });

  it("does not help a divisor that already favours the armour", () => {
    // A (0.5) divisor is the attack doing worse against DR. Hardened is armour
    // resisting penetration, so it has nothing to do here.
    expect(hardenedAgainst(0.5, false, 2).divisor).toBe(0.5);
  });
});

describe("Ablative and semi-ablative DR (Characters p. 47)", () => {
  it("spends a point of ablative DR per point of damage stopped", () => {
    // "Each point of DR stops one point of basic damage but is destroyed."
    expect(ablativeLoss({ ablative: "ablative", dr: 10, basicDamage: 4 })).toBe(4);
    expect(ablativeLoss({ ablative: "ablative", dr: 10, basicDamage: 25 })).toBe(10);
  });

  it("spends a point of semi-ablative DR per 10 points rolled", () => {
    // "every 10 points of basic damage rolled removes one point of DR,
    // regardless of whether the attack penetrates DR."
    expect(ablativeLoss({ ablative: "semiAblative", dr: 10, basicDamage: 9 })).toBe(0);
    expect(ablativeLoss({ ablative: "semiAblative", dr: 10, basicDamage: 25 })).toBe(2);
    expect(ablativeLoss({ ablative: "semiAblative", dr: 1, basicDamage: 100 })).toBe(1);
  });

  it("spends nothing on ordinary armour", () => {
    expect(ablativeLoss({ ablative: "none", dr: 10, basicDamage: 30 })).toBe(0);
    expect(ablativeLoss({ ablative: undefined, dr: 10, basicDamage: 30 })).toBe(0);
  });

  it("offers only what is left of a spent piece", () => {
    expect(remainingDr(10, 4)).toBe(6);
    expect(remainingDr(10, 40)).toBe(0);
    expect(drAgainst(piece({ dr: 10, ablative: "ablative", drLost: 4 }), "cr")).toBe(6);
  });

  it("spends the lower figure of a split DR where the split applies", () => {
    const vest = piece({ dr: 12, drSplit: 5, drSplitAppliesTo: ["cr"], drLost: 2 });
    expect(drAgainst(vest, "cut")).toBe(10);
    expect(drAgainst(vest, "cr")).toBe(3);
  });
});

describe("a Force Field in the layers (Characters p. 47)", () => {
  it("is kept out of the armour total, and counts wherever the blow fell", () => {
    // "protects your entire body - including your eyes", so its own covered
    // locations are not consulted.
    const layers = armorLayers(
      [piece({ dr: 5, forceField: true, locations: ["torso"] }), piece({ dr: 8, locations: ["torso"] })],
      "eye",
      "cr",
    );
    expect(layers.fieldDr).toBe(5);
    expect(layers.totalDr).toBe(0);
  });

  it("leaves the rigid and flexible layers as they were", () => {
    const layers = armorLayers(
      [
        piece({ dr: 4, forceField: true }),
        piece({ dr: 6, flexible: true, locations: ["torso"] }),
        piece({ dr: 3, locations: ["torso"] }),
      ],
      "torso",
      "cr",
    );
    expect(layers.fieldDr).toBe(4);
    expect(layers.flexibleDr).toBe(6);
    expect(layers.rigidDr).toBe(3);
    expect(layers.totalDr).toBe(9);
  });

  it("takes the best hardening the wearer has at the spot", () => {
    const layers = armorLayers(
      [piece({ hardened: 1, locations: ["torso"] }), piece({ hardened: 3, locations: ["torso"] })],
      "torso",
      "cr",
    );
    expect(layers.hardened).toBe(3);
  });

  it("does not read the hardening of a piece that covers somewhere else", () => {
    const layers = armorLayers([piece({ hardened: 4, locations: ["leg"] })], "torso", "cr");
    expect(layers.hardened).toBe(0);
  });
});
