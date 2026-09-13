import { describe, expect, it } from "vitest";

import {
  dispersed, SWARMS, swarmDamageTaken, swarmProtection,
} from "../swarms.js";
import { canTrample, trampleDamage, trampleSkill } from "../trampling.js";
import { beastAttacks, beastTraitsFrom } from "../natural-attacks.js";
import { thrustDamage } from "../damage.js";
import { formatDiceAdds } from "../dice.js";
import { mayUseVehicleSystem, vehicleMovement } from "../vehicle-combat.js";
import { jumpFromVehicle } from "../collisions.js";
import { TONS_PER_PERSON, cargoCapacity, curbWeight, endurance, leaveSeat } from "../vehicles.js";
import {
  cappedAimBonus, crippleThreshold, locationsOf, lossOfControl, mediumOf, occupantDamage,
  occupantHitTarget, targetingSystemBonus, unexpectedDodgePenalty, vehicleHitLocation,
  vehicleInjury, vitalAreaModifier, windowDr,
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
    // "The wounding modifier for a tight-beam burning attack is x2" -- a tight
    // beam. This used to double every burn, flamethrowers included; the vital
    // area names no modifier for an ordinary burn, or for anything crushing.
    expect(vitalAreaModifier("burn", true)).toBe(2);
    expect(vitalAreaModifier("burn")).toBe(null);
    expect(vitalAreaModifier("cr")).toBe(null);
    expect(windowDr(5)).toBe(3);
  });

  it("cuts a bullet down to a third against a powered vehicle's body", () => {
    // "Most powered vehicles are Unliving" (p. 555), and Unliving takes
    // piercing at x1/3 (p. 380).
    expect(vehicleInjury({ penetrating: 9, damageType: "pi", location: "body", powered: true })).toBe(3);
    // Unpowered is Homogenous, which is harder still: x1/5.
    expect(vehicleInjury({ penetrating: 10, damageType: "pi", location: "body", powered: false })).toBe(2);
  });

  it("triples a bullet in the vital area, whatever the body would have done", () => {
    expect(vehicleInjury({ penetrating: 9, damageType: "pi", location: "vitalArea", powered: true })).toBe(27);
  });

  it("doubles a laser in the vital area and leaves a torch at its ordinary figure", () => {
    expect(vehicleInjury({ penetrating: 6, damageType: "burn", tightBeam: true, location: "vitalArea", powered: true })).toBe(12);
    expect(vehicleInjury({ penetrating: 6, damageType: "burn", location: "vitalArea", powered: true })).toBe(6);
  });

  it("leaves crushing and cutting at their ordinary torso figures", () => {
    expect(vehicleInjury({ penetrating: 10, damageType: "cr", location: "body", powered: true })).toBe(10);
    expect(vehicleInjury({ penetrating: 10, damageType: "cut", location: "body", powered: true })).toBe(15);
  });

  it("does at least a point once anything gets through, and nothing when nothing does", () => {
    expect(vehicleInjury({ penetrating: 1, damageType: "pi-", location: "body", powered: false })).toBe(1);
    expect(vehicleInjury({ penetrating: 0, damageType: "pi", location: "vitalArea", powered: true })).toBe(0);
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

describe("a beast's kick (Campaigns p. 460)", () => {
  const horse = (over: Partial<Parameters<typeof beastAttacks>[0]["beast"]> = {}) =>
    beastAttacks({
      st: 20, dx: 9, skills: {},
      beast: { claws: "hooves", horizontal: true, strikers: [], ...over },
    }).find((a) => a.key === "kick");

  it("cancels the hooves bonus against the horizontal penalty for a large herbivore", () => {
    // "For large herbivores, this cancels out the +1 per die for Hooves."
    // A ST 20 beast thrusts 2d-1, and that is what its kick comes to.
    expect(formatDiceAdds(horse()!.damage)).toBe(formatDiceAdds(thrustDamage(20)));
    expect(horse()!.damageType).toBe("cr");
  });

  it("keeps the hooves bonus for a beast that stands upright", () => {
    // Without Horizontal the +1 per die stands: 2d-1 becomes 2d+1.
    expect(formatDiceAdds(horse({ horizontal: false })!.damage)).toBe("2d+1");
  });

  it("gives blunt claws the bonus and sharp claws a cutting kick, penalty and all", () => {
    // "Sharp Claws give no bonus, but cause cutting damage", and the
    // horizontal penalty is only "to creatures without Claws".
    const sharp = horse({ claws: "sharp" })!;
    expect(formatDiceAdds(sharp.damage)).toBe(formatDiceAdds(thrustDamage(20)));
    expect(sharp.damageType).toBe("cut");
    const blunt = horse({ claws: "blunt" })!;
    expect(formatDiceAdds(blunt.damage)).toBe("2d+1");
    expect(blunt.damageType).toBe("cr");
  });

  it("kicks with bare feet too, at the horizontal penalty", () => {
    // An ox has neither claws nor hooves: thrust, less a point per die.
    const ox = horse({ claws: null })!;
    expect(formatDiceAdds(ox.damage)).toBe("2d-3");
    expect(ox.damageType).toBe("cr");
  });

  it("gives no kick to a beast with nothing to kick with", () => {
    // A snake, a shark: legless however the meta-trait spells it.
    expect(horse({ legless: true })).toBeUndefined();
    // An upright beast is given the punch and kick a person gets instead.
    expect(horse({ horizontal: false, claws: "sharp" })).toBeUndefined();
  });

  it("kicks at the same -2 a person does, and reaches a hex further", () => {
    expect(horse()!.skillLevel).toBe(9 - 2);
    expect(horse()!.reach).toBe("C, 1");
  });

  it("reads Quadruped, No Legs and Vermiform off a creature's traits", () => {
    expect(beastTraitsFrom(["Quadruped", "Hooves"])).toMatchObject({ horizontal: true, claws: "hooves" });
    expect(beastTraitsFrom(["Vermiform"])).toMatchObject({ legless: true });
    expect(beastTraitsFrom(["No Legs (Aquatic)"])).toMatchObject({ legless: true });
    expect(beastTraitsFrom(["Sharp Teeth"])).toMatchObject({ horizontal: false, legless: false });
  });
});

describe("vehicle maneuvers (Campaigns p. 467)", () => {
  it("puts the operator in charge on a Move or a Move and Attack", () => {
    expect(vehicleMovement({ maneuver: "move" })).toBe("controlled");
    expect(vehicleMovement({ maneuver: "moveAndAttack" })).toBe("controlled");
  });

  it("plows ahead on any other maneuver, or when the operator is stunned", () => {
    // "If the operator takes any other maneuver, or is stunned or otherwise
    // incapacitated, his vehicle plows ahead with the same speed and course
    // it had on the previous turn."
    for (const maneuver of ["attack", "aim", "doNothing", "allOutDefense", "ready"]) {
      expect(vehicleMovement({ maneuver })).toBe("plowsAhead");
    }
    expect(vehicleMovement({ maneuver: "move", incapacitated: true })).toBe("plowsAhead");
  });

  it("lets an occupant work a system only from the controls and on the right maneuver", () => {
    const at = { atTheControls: true };
    expect(mayUseVehicleSystem({ ...at, maneuver: "concentrate", system: "sensors" })).toBe(true);
    expect(mayUseVehicleSystem({ ...at, maneuver: "attack", system: "sensors" })).toBe(false);
    expect(mayUseVehicleSystem({ ...at, maneuver: "attack", system: "weapons" })).toBe(true);
    expect(mayUseVehicleSystem({ ...at, maneuver: "allOutAttack", system: "weapons" })).toBe(true);
    expect(mayUseVehicleSystem({ ...at, maneuver: "move", system: "weapons" })).toBe(false);
    // Not stationed by the controls, nothing doing.
    expect(mayUseVehicleSystem({ atTheControls: false, maneuver: "attack", system: "weapons" })).toBe(false);
  });

  it("throws a jumper into the ground at the vehicle's speed", () => {
    // "a collision with an immovable object at the vehicle's speed", and an
    // immovable object is the hard kind, which doubles the hit points.
    const slow = jumpFromVehicle({ hitPoints: 10, vehicleSpeed: 10 });
    const fast = jumpFromVehicle({ hitPoints: 10, vehicleSpeed: 40 });
    expect(fast.dice).toBeGreaterThan(slow.dice);
    expect(slow.type).toBe("cr");
    // Stepping down from a standstill is the least the slam table gives.
    const still = jumpFromVehicle({ hitPoints: 10, vehicleSpeed: 0 });
    expect(still.dice).toBe(1);
    expect(still.modifier).toBeLessThan(0);
  });
});

describe("what the vehicle table's columns come to (Campaigns p. 463)", () => {
  it("takes the people out of the load to leave the cargo", () => {
    expect(TONS_PER_PERSON).toBe(0.1);
    // A van with 2 tons of Load carrying five people has 1.5 tons left.
    expect(cargoCapacity({ load: 2, people: 5 })).toBe(1.5);
    // More people than it can hold carries no cargo, not negative cargo.
    expect(cargoCapacity({ load: 0.2, people: 5 })).toBe(0);
  });

  it("takes the load off the loaded weight to leave the curb weight", () => {
    expect(curbWeight({ loadedWeight: 2.5, load: 0.5 })).toBe(2);
    expect(curbWeight({ loadedWeight: 1, load: 3 })).toBe(0);
  });

  it("divides range by cruising speed for the hours it can stay out", () => {
    expect(endurance({ rangeMiles: 300, cruisingSpeedMph: 30 })).toBe(10);
    // Oars and sails have no range on the table, and so no endurance to work out.
    expect(endurance({ rangeMiles: 0, cruisingSpeedMph: 20 })).toBe(null);
    expect(endurance({ rangeMiles: 300, cruisingSpeedMph: 0 })).toBe(null);
  });
});

/**
 * "To control his vehicle, the operator must take a Move or Move and Attack
 * maneuver on his turn" (Campaigns p. 467) -- which only means anything while
 * somebody has the wheel. A car full of people and nobody driving is a state
 * getting out of a car must not be able to reach.
 */
describe("who has the wheel when somebody gets out (p. 467)", () => {
  const driver = { uuid: "Actor.a", operator: true };
  const rider = { uuid: "Actor.b", operator: false };
  const second = { uuid: "Actor.c", operator: false };

  it("passes the wheel on when the driver leaves", () => {
    expect(leaveSeat([driver, rider, second], "Actor.a")).toEqual([
      { uuid: "Actor.b", operator: true },
      { uuid: "Actor.c", operator: false },
    ]);
  });

  it("leaves the wheel where it is when a passenger goes", () => {
    expect(leaveSeat([driver, rider], "Actor.b")).toEqual([{ uuid: "Actor.a", operator: true }]);
  });

  it("empties the vehicle when the last one out was driving", () => {
    expect(leaveSeat([driver], "Actor.a")).toEqual([]);
  });

  it("says nothing about somebody who was never aboard", () => {
    expect(leaveSeat([driver, rider], "Actor.z")).toEqual([driver, rider]);
  });
});
