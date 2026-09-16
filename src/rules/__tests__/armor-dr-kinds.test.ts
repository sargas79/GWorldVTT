import { describe, expect, it } from "vitest";

import { ARMOR_DIVISOR_STEPS, ablativeLoss, drAgainst, hardenedAgainst, remainingDr, wornDrAt } from "../armor.js";
import { armorLayers } from "../layered-armor.js";
import { splitSummary } from "../armor.js";
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

/**
 * A piece that armours one place better than the rest of itself: a suit whose
 * torso is better armoured than its limbs, a helmet whose skull is better
 * armoured than its face and eyes. The Basic Set's own case is footwear with a
 * tougher sole (Characters p. 283), which `soleDr` carries.
 */
describe("a different DR on one location", () => {
  const suit = piece({
    dr: 30,
    locations: ["torso", "arm", "leg", "groin"],
    drByLocation: [{ locations: ["torso"], dr: 50 }],
  });

  it("gives the exception's figure where it applies", () => {
    expect(drAgainst(suit, "cr", "torso")).toBe(50);
  });

  it("gives the piece's own figure everywhere else it covers", () => {
    expect(drAgainst(suit, "cr", "arm")).toBe(30);
    expect(drAgainst(suit, "cr", "leg")).toBe(30);
  });

  it("gives the piece's own figure where no location was named at all", () => {
    expect(drAgainst(suit, "cr")).toBe(30);
  });

  it("counts the exception in what a location is worth", () => {
    expect(wornDrAt([suit], "torso", "cr")).toBe(50);
    expect(wornDrAt([suit], "arm", "cr")).toBe(30);
  });

  it("adds up with another piece over the same spot", () => {
    const vest = piece({ dr: 5, locations: ["torso"] });
    expect(wornDrAt([suit, vest], "torso", "cr")).toBe(55);
  });

  it("replaces the split rather than being cut by it", () => {
    // A piece saying both would be saying two things about the same spot.
    const helmet = piece({
      dr: 24, drSplit: 18, drSplitAppliesTo: ["cr"], locations: ["skull", "face", "eye"],
      drByLocation: [{ locations: ["skull"], dr: 36 }],
    });
    expect(drAgainst(helmet, "cr", "skull")).toBe(36);
    expect(drAgainst(helmet, "cut", "skull")).toBe(36);
    // Where no exception covers it, the split is read as it always was.
    expect(drAgainst(helmet, "cr", "face")).toBe(18);
    expect(drAgainst(helmet, "cut", "face")).toBe(24);
  });

  it("is spent by an ablative blow like the rest of the piece", () => {
    const spent = piece({ dr: 30, drByLocation: [{ locations: ["torso"], dr: 50 }], ablative: "ablative", drLost: 10 });
    expect(drAgainst(spent, "cr", "torso")).toBe(40);
    expect(drAgainst(spent, "cr", "arm")).toBe(20);
  });

  it("changes nothing for a piece that names no exception", () => {
    const plain = piece({ dr: 8, locations: ["torso"] });
    expect(drAgainst(plain, "cr", "torso")).toBe(8);
    expect(wornDrAt([plain], "torso", "cr")).toBe(8);
  });
});

/**
 * The figure the sheet shows for a location comes from the same profile the
 * damage pipeline reads, so what a player sees is what will be subtracted.
 */
describe("the profile a sheet shows", () => {
  it("leads with the exception's figure where the piece armours a place better", () => {
    const suit = piece({
      dr: 30,
      locations: ["torso", "arm", "leg"],
      drByLocation: [{ locations: ["torso"], dr: 50 }],
    });
    expect(splitSummary([suit], "torso").bands[0]?.dr).toBe(50);
    expect(splitSummary([suit], "arm").bands[0]?.dr).toBe(30);
  });

  it("shows what is left of a piece an earlier blow spent", () => {
    const spent = piece({ dr: 20, locations: ["torso"], ablative: "ablative", drLost: 8 });
    expect(splitSummary([spent], "torso").bands[0]?.dr).toBe(12);
  });

  it("leads each location of a helmet with its own figure", () => {
    const helmet = piece({
      dr: 24, locations: ["skull", "face", "eye"],
      drByLocation: [{ locations: ["skull"], dr: 36 }],
    });
    // The skull's own DR 2 is armour the body came with, and toxic is exempt
    // from it, so the skull has a band either way. The figure is what matters.
    expect(splitSummary([helmet], "skull").bands[0]?.dr).toBe(38);
    expect(splitSummary([helmet], "face").bands[0]?.dr).toBe(24);
    // An exception is not a damage-type split: the face, with no exception and
    // no split, is protected evenly.
    expect(splitSummary([helmet], "face").splits).toBe(false);
  });
});

