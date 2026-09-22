import { describe, expect, it } from "vitest";

import {
  RELATIVE_EXPLOSIVE_FORCE,
  blastAgainstStructure,
  chargeDamage,
  chargeMultiplier,
  explosiveForce,
  explosiveWeightFor,
} from "../demolition.js";
import { formatDiceAdds, maxRoll } from "../dice.js";
import { structure } from "../structures.js";

// Demolition: a charge's damage from its weight and relative explosive force,
// and what it does to a door or a wall (Campaigns pp. 415, 484, 558;
// sargas79/GWorldVTT#597).

describe("the Relative Explosive Force Table (p. 415)", () => {
  it("has the book's fourteen rows, TNT at 1", () => {
    expect(RELATIVE_EXPLOSIVE_FORCE).toHaveLength(14);
    expect(explosiveForce("tnt")).toMatchObject({ tl: 6, ref: 1 });
    expect(explosiveForce("dynamite")?.ref).toBe(0.8);
    expect(explosiveForce("c4")?.ref).toBe(1.4);
    expect(explosiveForce("metallicHydrogen")).toMatchObject({ tl: 10, ref: 6 });
    expect(explosiveForce("nothing")).toBeNull();
  });

  it("gives every row a distinct id", () => {
    const ids = RELATIVE_EXPLOSIVE_FORCE.map((row) => row.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("a charge's damage", () => {
  it("is 6d times the square root of weight x 4 x REF", () => {
    expect(chargeMultiplier(1, 1)).toBe(2);
    // The book's safecracker: 20 lbs of dynamite is a 6dx8 blast.
    expect(chargeMultiplier(20, 0.8)).toBeCloseTo(8);
    expect(chargeMultiplier(0, 1)).toBe(0);
    expect(chargeMultiplier(1, 0)).toBe(0);
  });

  it("runs backwards to the weight a blast takes", () => {
    expect(explosiveWeightFor(8, 0.8)).toBeCloseTo(20);
    expect(explosiveWeightFor(2, 1)).toBe(1);
  });

  it("keeps a whole multiplier as the book writes it", () => {
    const tnt = chargeDamage(1, 1);
    expect(tnt?.notation).toBe("6d×2");
    expect(formatDiceAdds(tnt!.dice)).toBe("6dx2");
    expect(tnt?.diceOfDamage).toBe(12);
    expect(maxRoll(tnt!.dice)).toBe(72);
    expect(chargeDamage(20, 0.8)?.notation).toBe("6d×8");
    // A quarter pound of TNT is 6dx1: plain 6d.
    expect(chargeDamage(0.25, 1)?.dice).toEqual({ dice: 6, adds: 0 });
  });

  it("lays out a fractional multiplier as dice and adds", () => {
    // Half a pound of TNT: 6d x 1.41, which is 8.49 dice -- 8d+2.
    const half = chargeDamage(0.5, 1);
    expect(half?.notation).toBe("6d×1.41");
    expect(half?.dice).toEqual({ dice: 8, adds: 2 });
    expect(half?.diceOfDamage).toBe(8);
  });

  it("is at least a die less its shortfall for a speck of explosive", () => {
    // 1/576 lb of TNT: 6d x 1/12, half a die.
    expect(chargeDamage(1 / 576, 1)?.dice).toEqual({ dice: 1, adds: -2 });
  });

  it("is no charge without weight or force", () => {
    expect(chargeDamage(0, 1)).toBeNull();
    expect(chargeDamage(1, Number.NaN)).toBeNull();
  });
});

describe("a charge against a structure", () => {
  const brick = structure("Brick Wall (6\" thick)")!;

  it("takes what gets through DR off its HP, a Homogenous target to crushing", () => {
    // A pound of TNT packed against it does 72.
    const hit = blastAgainstStructure({ damage: 72, dr: brick.dr, hp: brick.hp });
    expect(hit).toMatchObject({ injury: 56, hp: 11, state: "standing", rollsToHold: false, rollsToStand: false });
  });

  it("rolls to hold at zero or below, and to stand from -1xHP", () => {
    expect(blastAgainstStructure({ damage: 90, dr: 16, hp: 67 })).toMatchObject({ hp: -7, rollsToHold: true, rollsToStand: false });
    expect(blastAgainstStructure({ damage: 150, dr: 16, hp: 67 })).toMatchObject({ hp: -67, state: "failing", rollsToHold: false, rollsToStand: true });
  });

  it("counts the damage it had taken, and is gone at -5xHP", () => {
    expect(blastAgainstStructure({ damage: 30, dr: 1, hp: 23, damageTaken: 100 })).toMatchObject({ hp: -106, state: "failing" });
    expect(blastAgainstStructure({ damage: 150, dr: 1, hp: 23 })).toMatchObject({ state: "collapsed", rollsToStand: false });
  });

  it("does nothing a DR stops", () => {
    expect(blastAgainstStructure({ damage: 72, dr: 96, hp: 80 })).toMatchObject({ injury: 0, hp: 80, state: "standing" });
  });

  it("is breached once the roll at zero has failed", () => {
    expect(blastAgainstStructure({ damage: 60, dr: 0, hp: 54, damageTaken: 0, failedDisabling: true })).toMatchObject({ state: "breached", rollsToHold: false });
  });
});
