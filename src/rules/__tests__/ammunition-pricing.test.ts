import { describe, expect, it } from "vitest";

import {
  AMMO_COST_PER_LB,
  ammunitionCost,
  nearestAmmunitionByCalibre,
  type AmmunitionReference,
} from "../ammunition.js";

/**
 * What a box of rounds costs (GURPS Basic Set: Characters p. 278): "assume
 * that ammo cost is $20 times this weight". The weight is the weight of a
 * reload -- and no weapon in the packs carries one, so every weapon the packs
 * have no ammunition record for was buying its rounds at $20 x 0: free, and
 * weighing nothing.
 */
const listed: AmmunitionReference[] = [
  { name: "Cartridges, .380", fits: ".380", costPerRound: 0.4, weightPerRound: 0.02 },
  { name: "Cartridges, 9mm", fits: "9mm", costPerRound: 0.54, weightPerRound: 0.027 },
  { name: "Cartridges, .45", fits: ".45", costPerRound: 0.9, weightPerRound: 0.045 },
  { name: "Shotgun Shells, 12G", fits: "12G", costPerRound: 2, weightPerRound: 0.1 },
  { name: "Arrow", fits: "arrow", costPerRound: 2, weightPerRound: 0.1 },
];

describe("what a round costs", () => {
  it("is $20 a pound of reload", () => {
    expect(AMMO_COST_PER_LB).toBe(20);
    expect(ammunitionCost(0.5)).toBe(10);
    expect(ammunitionCost(0.027)).toBe(0.54);
    // The figure the fallback exists to avoid: a weapon with no reload weight.
    expect(ammunitionCost(0)).toBe(0);
  });
});

describe("pricing a weapon the packs list no rounds for", () => {
  it("takes the listed cartridge nearest in bore", () => {
    // A .36 revolver: 9.14mm, nearest the 9mm cartridge.
    expect(nearestAmmunitionByCalibre(listed, 9.14)?.name).toBe("Cartridges, 9mm");
    // A .41 derringer: 10.41mm, nearer the .380 (9.65mm) than the .45.
    expect(nearestAmmunitionByCalibre(listed, 10.41)?.name).toBe("Cartridges, .380");
    // A .80 musket: 20.32mm, and the widest bore listed is the 12G shell's
    // 18.53mm (since API 1.73.0, when gauges began to be read as bores).
    expect(nearestAmmunitionByCalibre(listed, 20.32)?.name).toBe("Shotgun Shells, 12G");
    expect(nearestAmmunitionByCalibre(listed.filter((r) => r.fits !== "12G"), 20.32)?.name).toBe("Cartridges, .45");
  });

  /** Arrows have no bore at all, so they are not offered as a comparable. */
  it("ignores anything with no bore to compare, such as arrows", () => {
    const noBore = listed.filter((r) => r.fits === "arrow");
    expect(nearestAmmunitionByCalibre(noBore, 9)).toBeNull();
  });

  /** A gauge is read as the bore it names (Characters p. 279; since API 1.73.0). */
  it("compares a shotgun by the bore its gauge names", () => {
    // A 10G shotgun (19.69mm) with no shells of its own listed takes the 12G's.
    expect(nearestAmmunitionByCalibre(listed, 19.69)?.name).toBe("Shotgun Shells, 12G");
  });

  /** ".44M" is a Magnum .44: the letter names the cartridge, not the bore. */
  it("reads a calibre with a letter after it", () => {
    const magnum: AmmunitionReference[] = [{ name: "Cartridges, .44M", fits: ".44M", costPerRound: 1, weightPerRound: 0.05 }];
    expect(nearestAmmunitionByCalibre(magnum, 11.2)?.name).toBe("Cartridges, .44M");
  });

  it("has nothing to say about a weapon that names no calibre", () => {
    expect(nearestAmmunitionByCalibre(listed, null)).toBeNull();
    expect(nearestAmmunitionByCalibre([], 9)).toBeNull();
  });

  it("keeps the first of two equally close, so pack order decides nothing else", () => {
    const pair: AmmunitionReference[] = [
      { name: "First", fits: "10mm", costPerRound: 1, weightPerRound: 0.05 },
      { name: "Second", fits: "8mm", costPerRound: 1, weightPerRound: 0.05 },
    ];
    expect(nearestAmmunitionByCalibre(pair, 9)?.name).toBe("First");
  });
});
