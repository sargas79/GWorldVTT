import { describe, expect, it } from "vitest";

import {
  aimableLocations, passesThrough, vehicleDrAt, vehicleDrLabel, vehicleFaceDr,
  vehicleLocationPenalty, vehiclePenetration,
} from "../vehicle-combat.js";

/** Vehicle DR by face and location (Campaigns pp. 462, 554-555; sargas79/GWorldVTT#602). */
describe("vehicle DR by face", () => {
  it("reads one figure all round when the vehicle gives only one", () => {
    for (const arc of ["front", "side", "rear", "top", "underbody", null] as const) {
      expect(vehicleFaceDr({ dr: 12 }, arc)).toBe(12);
    }
  });

  it("splits a printed 45/20 into the front and the sides and rear", () => {
    const tank = { dr: 45, drOther: 20 };
    expect(vehicleFaceDr(tank, "front")).toBe(45);
    expect(vehicleFaceDr(tank, "side")).toBe(20);
    expect(vehicleFaceDr(tank, "rear")).toBe(20);
    // No arc given: the table's figure.
    expect(vehicleFaceDr(tank, null)).toBe(45);
  });

  it("falls back to the second figure on top and underneath, unless given their own", () => {
    expect(vehicleFaceDr({ dr: 45, drOther: 20 }, "top")).toBe(20);
    expect(vehicleFaceDr({ dr: 45, drOther: 20, drTop: 8 }, "top")).toBe(8);
    expect(vehicleFaceDr({ dr: 45, drOther: 20, drUnderbody: 0 }, "underbody")).toBe(0);
    expect(vehicleFaceDr({ dr: 45, drOther: null, drUnderbody: null }, "underbody")).toBe(45);
  });

  it("prints a split the way the tables do", () => {
    expect(vehicleDrLabel({ dr: 45, drOther: 20 })).toBe("45/20");
    expect(vehicleDrLabel({ dr: 5 })).toBe("5");
    expect(vehicleDrLabel({ dr: 5, drOther: 5 })).toBe("5");
  });
});

describe("vehicle DR by location", () => {
  it("halves the face for a closed window, rounding up", () => {
    expect(vehicleDrAt({ dr: 10, drOther: 5 }, "largeWindow", "front")).toEqual({ dr: 5, source: "window" });
    expect(vehicleDrAt({ dr: 10, drOther: 5 }, "smallWindow", "side")).toEqual({ dr: 3, source: "window" });
  });

  it("uses a location's own DR over the face's", () => {
    const figures = { dr: 10, drOther: 5, drByLocation: { largeWindow: 2, mainTurret: 30 } };
    expect(vehicleDrAt(figures, "largeWindow", "front")).toEqual({ dr: 2, source: "location" });
    expect(vehicleDrAt(figures, "mainTurret", "side")).toEqual({ dr: 30, source: "location" });
    expect(vehicleDrAt(figures, "body", "side")).toEqual({ dr: 5, source: "face" });
    // An empty entry is no entry.
    expect(vehicleDrAt({ dr: 10, drByLocation: { wheel: null } }, "wheel", "front")).toEqual({ dr: 10, source: "face" });
  });

  it("gives nothing where the hit passes through to a person or an animal", () => {
    for (const location of ["exposedRider", "openCabin", "draftAnimal"] as const) {
      expect(passesThrough(location)).toBe(true);
      expect(vehicleDrAt({ dr: 10, drByLocation: {} }, location, "front")).toEqual({ dr: 0, source: "none" });
    }
    expect(passesThrough("body")).toBe(false);
  });
});

describe("what gets through a vehicle's DR", () => {
  it("takes the DR off the basic damage", () => {
    expect(vehiclePenetration({ basicDamage: 14, lines: [{ dr: 10, applies: true }], armorDivisor: 1 }))
      .toEqual({ dr: 10, effectiveDr: 10, penetrating: 4 });
  });

  it("divides the DR by the armour divisor, and a fractional divisor multiplies it", () => {
    expect(vehiclePenetration({ basicDamage: 14, lines: [{ dr: 10, applies: true }], armorDivisor: 3 }).penetrating).toBe(11);
    expect(vehiclePenetration({ basicDamage: 14, lines: [{ dr: 10, applies: true }], armorDivisor: 0.5 }).effectiveDr).toBe(20);
  });

  it("adds up the lines that count, and lets Hardened step the divisor down", () => {
    const lines = [{ dr: 10, applies: true }, { dr: 4, applies: false }, { dr: 2, applies: true, hardened: 1 }];
    // DR 12 at (2) stepped down to (1): all 12.
    expect(vehiclePenetration({ basicDamage: 20, lines, armorDivisor: 2 })).toEqual({ dr: 12, effectiveDr: 12, penetrating: 8 });
  });

  it("lets an attack that ignores DR straight through", () => {
    expect(vehiclePenetration({ basicDamage: 6, lines: [{ dr: 40, applies: true }], armorDivisor: 1, ignoresDr: true }).penetrating).toBe(6);
  });
});

describe("aiming at a vehicle's location", () => {
  it("offers the body, the Locations entry's parts and a powered vehicle's vital area, in the table's order", () => {
    expect(aimableLocations(["largeWindow", "wheel", "body"], true)).toEqual(["body", "largeWindow", "wheel", "vitalArea"]);
    expect(aimableLocations(["mast", "body"], false)).toEqual(["mast", "body"]);
  });

  it("reads the aiming penalty off the location's row", () => {
    expect(vehicleLocationPenalty("smallWindow")).toBe(-7);
    expect(vehicleLocationPenalty("wheel")).toBe(-4);
    expect(vehicleLocationPenalty("body")).toBe(0);
    expect(vehicleLocationPenalty("vitalArea")).toBe(-3);
  });
});
