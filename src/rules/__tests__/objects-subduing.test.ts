import { describe, expect, it } from "vitest";

import {
  TYPICAL_DR,
  objectHealth,
  objectHitPoints,
  objectState,
  rollsToKeepWorking,
} from "../objects.js";
import { canPullPunches, pulledDamage, pulledStrength, turnedBlade } from "../subduing.js";
import { thrustDamage } from "../damage.js";

describe("what an object is made of (Campaigns p. 483)", () => {
  it("knows the typical toughnesses the book lists", () => {
    expect(TYPICAL_DR.wood).toBe(2);
    expect(TYPICAL_DR.composite).toBe(4);
    expect(TYPICAL_DR.solidMetal).toBe(6);
    expect(TYPICAL_DR.steelPlate).toBe(14);
  });

  /** "Most machines... are HT 10. Swords, tables... are HT 12." */
  it("gives machines HT 10 and solid things HT 12", () => {
    expect(objectHealth("unliving")).toBe(10);
    expect(objectHealth("homogenous")).toBe(12);
    expect(objectHealth("diffuse")).toBe(10);
  });

  /** "Cheap, temperamental, or poorly maintained items get -1 to -3." */
  it("takes quality into account", () => {
    expect(objectHealth("homogenous", -2)).toBe(10);
    expect(objectHealth("unliving", 2)).toBe(12);
  });

  /** "4 x (cube root of weight) for Unliving, 8 x for Homogenous (round up)." */
  it("computes hit points from weight", () => {
    expect(objectHitPoints(8, "unliving")).toBe(8);
    expect(objectHitPoints(8, "homogenous")).toBe(16);
    expect(objectHitPoints(1, "homogenous")).toBe(8);
    expect(objectHitPoints(27, "unliving")).toBe(12);
  });

  it("rounds up rather than down", () => {
    // A 3 lb. sword: 8 x cbrt(3) = 11.53, which is 12.
    expect(objectHitPoints(3, "homogenous")).toBe(12);
  });

  it("gives nothing at all no hit points", () => {
    expect(objectHitPoints(0, "unliving")).toBe(0);
    expect(objectHitPoints(-5, "homogenous")).toBe(0);
  });
});

describe("what has become of a damaged object (Campaigns p. 484)", () => {
  it("is sound until a third of its hit points are gone", () => {
    expect(objectState(20, 20)).toBe("sound");
    expect(objectState(7, 20)).toBe("sound");
  });

  /** "Less than 1/3 HP left -- may suffer halved effectiveness." */
  it("is damaged below a third", () => {
    expect(objectState(6, 20)).toBe("damaged");
  });

  /** "0 HP or less -- roll vs. the artifact's HT each second while under stress." */
  it("starts failing at zero", () => {
    expect(objectState(0, 20)).toBe("failing");
    expect(objectState(-19, 20)).toBe("failing");
  });

  it("is breaking at -1x its hit points, and destroyed at -5x", () => {
    expect(objectState(-20, 20)).toBe("breaking");
    expect(objectState(-99, 20)).toBe("breaking");
    expect(objectState(-100, 20)).toBe("destroyed");
  });

  it("rolls to keep working only once it is past zero", () => {
    expect(rollsToKeepWorking("sound")).toBe(false);
    expect(rollsToKeepWorking("damaged")).toBe(false);
    expect(rollsToKeepWorking("failing")).toBe(true);
    expect(rollsToKeepWorking("breaking")).toBe(true);
  });

  it("says nothing about an object with no hit points recorded", () => {
    expect(objectState(0, 0)).toBe("sound");
  });
});

describe("pulling your punches (Campaigns p. 401)", () => {
  /** "(but not with a crossbow or a firearm)" */
  it("is only possible with something you swing or draw yourself", () => {
    expect(canPullPunches("muscle")).toBe(true);
    expect(canPullPunches("mechanical")).toBe(false);
  });

  /** "you could strike at only ST 9 ... or tap at ST 1" */
  it("uses any strength up to your own, and never more", () => {
    expect(pulledStrength(10, 9)).toBe(9);
    expect(pulledStrength(10, 1)).toBe(1);
    expect(pulledStrength(10, 14)).toBe(10);
    expect(pulledStrength(10, 0)).toBe(1);
  });

  it("does the damage that strength would", () => {
    expect(pulledDamage({ strength: 14, chosen: 10, base: "thr", modifier: 0 }))
      .toEqual(thrustDamage(10));
  });
});

describe("turning your blade (Campaigns p. 401)", () => {
  /** "the flat side of any swing/cutting weapon ... turns cutting into crushing" */
  it("turns a cut into a crush, at the same damage", () => {
    const flat = turnedBlade({ type: "cut", damage: { dice: 2, adds: 1 } });
    expect(flat).toEqual({ type: "cr", damage: { dice: 2, adds: 1 }, needsReadying: false });
  });

  /** "the blunt end ... reduces damage by 1 point and makes damage crushing" */
  it("costs a point to poke with the butt of a spear", () => {
    const butt = turnedBlade({ type: "imp", damage: { dice: 1, adds: 2 }, reach: 1 });
    expect(butt).toMatchObject({ type: "cr", damage: { dice: 1, adds: 1 } });
  });

  /** "Reversing a reach 2+ impaling weapon ... requires a Ready maneuver." */
  it("costs a turn to reverse anything long", () => {
    expect(turnedBlade({ type: "imp", damage: { dice: 1, adds: 0 }, reach: 2 })?.needsReadying)
      .toBe(true);
    expect(turnedBlade({ type: "imp", damage: { dice: 1, adds: 0 }, reach: 1 })?.needsReadying)
      .toBe(false);
  });

  it("has nothing to turn on a weapon that already crushes", () => {
    expect(turnedBlade({ type: "cr", damage: { dice: 2, adds: 0 } })).toBeNull();
    expect(turnedBlade({ type: "burn", damage: { dice: 2, adds: 0 } })).toBeNull();
  });
});
