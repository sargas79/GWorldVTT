import { describe, expect, it } from "vitest";

import {
  EVASIVE_MANEUVERS,
  evasiveManeuverAllowed,
  firearmAttack,
  mayDodgeFirearm,
  rangedRapidStrikeAllowed,
  rapidStrikeShare,
  shiftBand,
} from "../revised-ranged.js";
import { HORIZON_TABLE, frostbiteCripples } from "../vision-corrections.js";
import { cripplingThreshold } from "../hit-locations.js";

describe("Restricted Dodge Against Firearms: which attacks and maneuvers (Revised p. 577)", () => {
  it("reads a firearm attack off the weapon's skill, specialty or not", () => {
    expect(firearmAttack("Guns (Pistol)")).toBe(true);
    expect(firearmAttack("Beam Weapons (Rifle)")).toBe(true);
    expect(firearmAttack("Gunner (Machine Gun)")).toBe(true);
    expect(firearmAttack("Bow")).toBe(false);
    expect(firearmAttack("Broadsword")).toBe(false);
    expect(firearmAttack(undefined)).toBe(false);
  });

  it("allows evasive movement on the seven listed maneuvers only", () => {
    expect(EVASIVE_MANEUVERS).toHaveLength(7);
    expect(evasiveManeuverAllowed("moveAndAttack")).toBe(true);
    expect(evasiveManeuverAllowed("allOutAttack")).toBe(false);
    expect(evasiveManeuverAllowed("wait")).toBe(false);
  });

  it("lets a fighter dodge only the shooter they declared, on a maneuver that allows it", () => {
    const declared = { shooter: "Actor.a", maneuver: "move", acrobaticRolledOnTurn: false, droppedProneAtEnd: false };
    expect(mayDodgeFirearm(declared, "Actor.a")).toBe(true);
    expect(mayDodgeFirearm(declared, "Actor.b")).toBe(false);
    expect(mayDodgeFirearm({ ...declared, maneuver: "allOutAttack" }, "Actor.a")).toBe(false);
    expect(mayDodgeFirearm(null, "Actor.a")).toBe(false);
  });
});

describe("Ranged Rapid Strike: splitting the Rate of Fire (Revised p. 577)", () => {
  it("gives the second target what the first does not take, one shot at least each", () => {
    expect(rapidStrikeShare(3, 1)).toEqual({ here: 1, other: 2 });
    expect(rapidStrikeShare(3, 2)).toEqual({ here: 2, other: 1 });
    expect(rapidStrikeShare(3, 3)).toBeNull();
    expect(rapidStrikeShare(3, 0)).toBeNull();
    expect(rapidStrikeShare(1, 1)).toBeNull();
  });

  it("needs RoF 2 or more and no Dual-Weapon Attack", () => {
    expect(rangedRapidStrikeAllowed(2, false)).toBe(true);
    expect(rangedRapidStrikeAllowed(2, true)).toBe(false);
    expect(rangedRapidStrikeAllowed(1, false)).toBe(false);
  });
});

describe("Simplified Range: moving between bands (Revised p. 577)", () => {
  it("shifts a band at Close and Short only", () => {
    expect(shiftBand("close", "farther")).toBe("short");
    expect(shiftBand("short", "closer")).toBe("close");
    expect(shiftBand("short", "farther")).toBe("short");
    expect(shiftBand("medium", "closer")).toBe("medium");
    expect(shiftBand("close", "closer")).toBe("close");
  });
});

describe("Frostbite that cripples (Revised p. 574)", () => {
  it("cripples over the location's threshold, as any injury would", () => {
    // A hand of a 10 HP body is crippled over HP/3, an arm over HP/2.
    const hand = cripplingThreshold("hand", 10);
    const arm = cripplingThreshold("arm", 10);
    expect(hand).toBeCloseTo(3.33, 1);
    expect(frostbiteCripples(3, hand)).toBe(false);
    expect(frostbiteCripples(4, hand)).toBe(true);
    expect(frostbiteCripples(5, arm)).toBe(false);
    expect(frostbiteCripples(6, arm)).toBe(true);
  });

  it("never cripples a location with no threshold", () => {
    expect(frostbiteCripples(50, cripplingThreshold("face", 10))).toBe(false);
    expect(frostbiteCripples(50, null)).toBe(false);
  });
});

describe("the Horizon Table's printed heights", () => {
  it("has a printed height for each of its 21 rows", () => {
    expect(HORIZON_TABLE).toHaveLength(21);
    expect(HORIZON_TABLE.every((row) => row.height.length > 0)).toBe(true);
    expect(HORIZON_TABLE.find((row) => row.sm === 0)?.height).toBe("2 yd");
    expect(HORIZON_TABLE.find((row) => row.sm === -5)?.height).toBe("1 ft");
  });
});
