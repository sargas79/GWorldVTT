import { describe, expect, it } from "vitest";

import {
  dispersed, SWARMS, swarmDamageTaken, swarmProtection,
} from "../swarms.js";
import { canTrample, trampleDamage, trampleSkill } from "../trampling.js";
import {
  cappedAimBonus, crippleThreshold, locationsOf, lossOfControl, mediumOf, occupantDamage,
  occupantHitTarget, targetingSystemBonus, unexpectedDodgePenalty, vehicleHitLocation,
  vitalAreaModifier, windowDr,
} from "../vehicle-combat.js";

describe("swarms", () => {
  it("carries the book's three", () => {
    expect(SWARMS.bats).toMatchObject({ move: 8, flying: true, disperseAt: 8, damageType: "cut" });
    expect(SWARMS.bees).toMatchObject({ move: 6, flatInjury: 1, disperseAt: 12, damage: null });
    expect(SWARMS.rats).toMatchObject({ move: 4, flying: false, disperseAt: 6 });
  });

  it("lets armour hold the tiny ones out for its seconds and then no longer", () => {
    const bees = { kind: "tiny" as const, dr: 4 };
    expect(swarmProtection({ ...bees, protection: "clothing", secondsExposed: 1 })).toMatchObject({ immune: true });
    expect(swarmProtection({ ...bees, protection: "clothing", secondsExposed: 2 })).toMatchObject({ immune: false, dr: 0 });
    expect(swarmProtection({ ...bees, protection: "armor", secondsExposed: 4 })).toMatchObject({ immune: true });
    expect(swarmProtection({ ...bees, protection: "armor", secondsExposed: 5 })).toMatchObject({ immune: false, dr: 0 });
    expect(swarmProtection({ ...bees, protection: "sealed", secondsExposed: 60 })).toMatchObject({ immune: true });
    expect(swarmProtection({ ...bees, protection: "none", secondsExposed: 0 })).toMatchObject({ immune: false, dr: 0 });
  });

  it("lets armour hold the large ones out for as long as it is worn", () => {
    const rats = { kind: "large" as const, dr: 3 };
    expect(swarmProtection({ ...rats, protection: "armor", secondsExposed: 100 })).toEqual({ dr: 3, immune: false, lasted: true });
    expect(swarmProtection({ ...rats, protection: "none", secondsExposed: 0 }).dr).toBe(0);
  });

  it("disperses at the damage the page gives, and counts a shield or a boot", () => {
    expect(dispersed(7, SWARMS.bats)).toBe(false);
    expect(dispersed(8, SWARMS.bats)).toBe(true);
    // A shield crushes fliers; a boot is for the ones on the floor.
    expect(swarmDamageTaken({ weapon: 3, swarm: SWARMS.bats, shield: true, stomp: true }))
      .toEqual({ weapon: 3, shield: 2, stomp: 0, total: 5 });
    expect(swarmDamageTaken({ weapon: 3, swarm: SWARMS.rats, shield: true, stomp: true }))
      .toEqual({ weapon: 3, shield: 0, stomp: 1, total: 4 });
  });
});

describe("trampling", () => {
  it("needs two sizes, or one against somebody on the ground", () => {
    expect(canTrample({ tramplerSm: 2, victimSm: 0 })).toMatchObject({ allowed: true, needsProne: false });
    expect(canTrample({ tramplerSm: 1, victimSm: 0 })).toMatchObject({ allowed: false });
    expect(canTrample({ tramplerSm: 1, victimSm: 0, victimProne: true })).toMatchObject({ allowed: true, needsProne: true });
    expect(canTrample({ tramplerSm: 3, victimSm: 0 }).largeArea).toBe(true);
    expect(canTrample({ tramplerSm: 2, victimSm: 0 }).largeArea).toBe(false);
  });

  it("rolls against the higher of DX and Brawling", () => {
    expect(trampleSkill(12, null)).toEqual({ level: 12, from: "DX" });
    expect(trampleSkill(12, 14)).toEqual({ level: 14, from: "Brawling" });
    expect(trampleSkill(12, 11)).toEqual({ level: 12, from: "DX" });
  });

  it("does thrust, +1 a die for hooves, and half ST on an overrun", () => {
    // ST 27 thrusts 3d-1; an ox has hooves.
    expect(trampleDamage({ st: 27 })).toEqual({ dice: 3, adds: -1 });
    expect(trampleDamage({ st: 27, hooves: true })).toEqual({ dice: 3, adds: 2 });
    // Overrun at half of 27 is ST 13: 1d.
    expect(trampleDamage({ st: 27, overrun: true })).toEqual({ dice: 1, adds: 0 });
  });
});

describe("losing control of a vehicle", () => {
  it("costs an aircraft height and speed within the Stability Rating, and a dive past it", () => {
    expect(lossOfControl({ medium: "air", stabilityRating: 3, margin: 2, velocity: 100 }))
      .toMatchObject({ severity: "minor", result: "airStumble", altitudeLost: 5, decelerated: 10, crashed: false });
    expect(lossOfControl({ medium: "air", stabilityRating: 3, margin: 5, velocity: 100 }))
      .toMatchObject({ severity: "major", result: "airDive", crashed: true });
  });

  it("skids a ground vehicle, and rolls it a third of its velocity past the rating", () => {
    expect(lossOfControl({ medium: "ground", stabilityRating: 4, margin: 4, velocity: 30 }))
      .toMatchObject({ severity: "minor", result: "skid", skidYards: 0, crashed: false });
    expect(lossOfControl({ medium: "ground", stabilityRating: 4, margin: 6, velocity: 30 }))
      .toMatchObject({ severity: "major", result: "rollOut", skidYards: 10, crashed: true });
  });

  it("capsizes a boat and stresses a submarine, and a critical failure is always a disaster", () => {
    expect(lossOfControl({ medium: "water", stabilityRating: 3, margin: 9, velocity: 10 }).result).toBe("capsize");
    expect(lossOfControl({ medium: "spaceOrUnderwater", stabilityRating: 3, margin: 1, velocity: 10 }))
      .toMatchObject({ result: "veers", altitudeLost: 5 });
    expect(lossOfControl({ medium: "ground", stabilityRating: 9, margin: 1, criticalFailure: true, velocity: 30 }))
      .toMatchObject({ severity: "disaster", crashed: true });
  });

  it("knows which medium a locomotion is", () => {
    expect(mediumOf("wheels")).toBe("ground");
    expect(mediumOf("air")).toBe("air");
    expect(mediumOf("water")).toBe("water");
  });
});

describe("shooting from a vehicle", () => {
  it("caps the aiming bonuses at the Stability Rating unless stabilized", () => {
    expect(cappedAimBonus({ bonus: 6, stabilityRating: 3 })).toBe(3);
    expect(cappedAimBonus({ bonus: 2, stabilityRating: 3 })).toBe(2);
    expect(cappedAimBonus({ bonus: 6, stabilityRating: 3, stabilized: true })).toBe(6);
    expect(cappedAimBonus({ bonus: 6, stabilityRating: 3, moving: false })).toBe(6);
  });

  it("costs a passenger for a dodge they did not expect, and pays for a targeting system", () => {
    expect(unexpectedDodgePenalty({ dodged: true, operator: false })).toBe(-2);
    expect(unexpectedDodgePenalty({ dodged: true, operator: false, flying: true })).toBe(-4);
    expect(unexpectedDodgePenalty({ dodged: true, operator: true })).toBe(0);
    expect(unexpectedDodgePenalty({ dodged: false, operator: false })).toBe(0);
    expect(targetingSystemBonus(6)).toBe(2);
    expect(targetingSystemBonus(8)).toBe(3);
    expect(targetingSystemBonus(4)).toBe(0);
  });
});

describe("the vehicle hit location table", () => {
  it("reads a vehicle's locations off its table entry", () => {
    expect(locationsOf("G4W")).toEqual(["largeWindow", "wheel", "body"]);
    expect(locationsOf("2CX")).toEqual(["track", "weaponMount", "body"]);
    expect(locationsOf("GH3Wr")).toEqual(["largeWindow", "rotor", "wheel", "body"]);
    expect(locationsOf("14DER")).toEqual(["draftAnimal", "exposedRider", "runner", "body"]);
  });

  it("lands where the roll says, falling to the body when the location is not there", () => {
    const car = locationsOf("G4W");
    expect(vehicleHitLocation({ roll: 10, has: car })).toMatchObject({ location: "body", penalty: 0 });
    expect(vehicleHitLocation({ roll: 11, has: car })).toMatchObject({ location: "largeWindow", penalty: -3 });
    expect(vehicleHitLocation({ roll: 15, has: car })).toMatchObject({ location: "wheel", penalty: -4 });
    // A car has no rotor, mast or track: 6 falls to the body.
    expect(vehicleHitLocation({ roll: 6, has: car })).toMatchObject({ location: "body", fellToBody: true });
    // A powered vehicle has vital areas; a wagon does not.
    expect(vehicleHitLocation({ roll: 17, has: car }).location).toBe("vitalArea");
    expect(vehicleHitLocation({ roll: 17, has: car, powered: false })).toMatchObject({ location: "body", fellToBody: true });
  });

  it("offers the choice when a roll could be two places at once", () => {
    const apc = locationsOf("2CX");
    expect(vehicleHitLocation({ roll: 3, has: apc }).choices).toEqual(["weaponMount"]);
    expect(vehicleHitLocation({ roll: 6, has: apc }).choices).toEqual(["track"]);
  });

  it("cripples each location at its share of HP", () => {
    expect(crippleThreshold("track", 100)).toBe(50);
    expect(crippleThreshold("rotor", 90)).toBe(30);
    expect(crippleThreshold("runner", 90)).toBe(30);
    expect(crippleThreshold("weaponMount", 100)).toBe(20);
    expect(crippleThreshold("wheel", 100, { wheels: 4 })).toBe(12.5);
    expect(crippleThreshold("mast", 120, { masts: 3 })).toBe(20);
    expect(crippleThreshold("body", 100)).toBeNull();
  });

  it("multiplies a vital area's wound and halves a window's DR", () => {
    expect(vitalAreaModifier("imp")).toBe(3);
    expect(vitalAreaModifier("pi+")).toBe(3);
    expect(vitalAreaModifier("burn")).toBe(2);
    expect(vitalAreaModifier("cr")).toBe(1);
    expect(windowDr(5)).toBe(3);
  });
});

describe("the occupant hit table", () => {
  it("reads the number to roll against off the corner of the table", () => {
    // One occupant in an SM +1 hull is hit on a 10; twenty in an SM +3 on a 14.
    expect(occupantHitTarget(1, 1)).toBe(10);
    expect(occupantHitTarget(1, 4)).toBe(7);
    expect(occupantHitTarget(2, 2)).toBe(10);
    expect(occupantHitTarget(20, 3)).toBe(14);
    expect(occupantHitTarget(100, 11)).toBe(6);
    // Past the last row, the last row serves.
    expect(occupantHitTarget(5000, 1)).toBe(17);
  });

  it("is a die of cutting per five points that got through", () => {
    expect(occupantDamage(4)).toEqual({ dice: 0, adds: 0 });
    expect(occupantDamage(5)).toEqual({ dice: 1, adds: 0 });
    expect(occupantDamage(37)).toEqual({ dice: 7, adds: 0 });
  });
});
