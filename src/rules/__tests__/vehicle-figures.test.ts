import { describe, expect, it } from "vitest";

import { vehicleDrAt, vehicleLocationDr } from "../vehicle-combat.js";
import { activeMove, fragilityCodes, isFragilityEntry, vehicleMoves } from "../vehicles.js";

/**
 * Figures the vehicle tables give that one field each could not hold
 * (Campaigns pp. 462-465, 554-555; sargas79/GWorldVTT#634).
 */
describe("a location's DR by face", () => {
  const tank = {
    dr: 45,
    drOther: 20,
    drByLocation: { mainTurret: 60 },
    drByLocationOther: { mainTurret: 35 },
    drByLocationTop: { mainTurret: 15 },
  };

  it("gives a turret its own front, sides and rear, and top", () => {
    expect(vehicleDrAt(tank, "mainTurret", "front")).toEqual({ dr: 60, source: "location" });
    expect(vehicleDrAt(tank, "mainTurret", "side")).toEqual({ dr: 35, source: "location" });
    expect(vehicleDrAt(tank, "mainTurret", "rear")).toEqual({ dr: 35, source: "location" });
    expect(vehicleDrAt(tank, "mainTurret", "top")).toEqual({ dr: 15, source: "location" });
    expect(vehicleDrAt(tank, "mainTurret", "underbody")).toEqual({ dr: 35, source: "location" });
    // No arc given: the front, as the table's own figure is.
    expect(vehicleDrAt(tank, "mainTurret", null)).toEqual({ dr: 60, source: "location" });
  });

  it("keeps one figure all round where the location gives only one", () => {
    for (const arc of ["front", "side", "rear", "top", "underbody", null] as const) {
      expect(vehicleLocationDr({ dr: 45, drByLocation: { mainTurret: 50 } }, "mainTurret", arc)).toBe(50);
    }
  });

  it("falls back to the sides on top, and to the front on the sides", () => {
    const turret = { dr: 45, drByLocation: { mainTurret: 60 }, drByLocationOther: { mainTurret: 30 } };
    expect(vehicleLocationDr(turret, "mainTurret", "top")).toBe(30);
    expect(vehicleLocationDr({ dr: 45, drByLocation: { mainTurret: 60 }, drByLocationTop: { mainTurret: 10 } }, "mainTurret", "side")).toBe(60);
  });

  it("uses the vehicle's face from a side the location gives no figure for", () => {
    const sidesOnly = { dr: 45, drOther: 20, drByLocationOther: { mainTurret: 30 } };
    expect(vehicleDrAt(sidesOnly, "mainTurret", "front")).toEqual({ dr: 45, source: "face" });
    expect(vehicleDrAt(sidesOnly, "mainTurret", "side")).toEqual({ dr: 30, source: "location" });
  });
});

describe("armour covering some arcs only", () => {
  const plane = {
    dr: 10,
    drByLocation: { largeWindow: 20 },
    drByLocationArcs: { largeWindow: ["front"] },
  };

  it("counts a canopy's armour from the front only", () => {
    expect(vehicleDrAt(plane, "largeWindow", "front")).toEqual({ dr: 20, source: "location" });
    expect(vehicleDrAt(plane, "largeWindow", null)).toEqual({ dr: 20, source: "location" });
  });

  it("leaves the location as it would be without it from any other arc", () => {
    // A window is half its face, rounded up.
    expect(vehicleDrAt(plane, "largeWindow", "side")).toEqual({ dr: 5, source: "window" });
    expect(vehicleDrAt(plane, "largeWindow", "top")).toEqual({ dr: 5, source: "window" });
    const rearArmoured = { dr: 10, drOther: 6, drByLocation: { vitalArea: 25 }, drByLocationArcs: { vitalArea: ["rear"] } };
    expect(vehicleDrAt(rearArmoured, "vitalArea", "rear")).toEqual({ dr: 25, source: "location" });
    expect(vehicleDrAt(rearArmoured, "vitalArea", "side")).toEqual({ dr: 6, source: "face" });
  });

  it("covers every arc when no arc is named", () => {
    const all = { dr: 10, drByLocation: { largeWindow: 20 }, drByLocationArcs: { largeWindow: [] } };
    expect(vehicleDrAt(all, "largeWindow", "rear")).toEqual({ dr: 20, source: "location" });
  });
});

describe("a second Move", () => {
  const amphibian = {
    locomotion: "wheels",
    acceleration: 3,
    topSpeed: 25,
    secondLocomotion: "water",
    secondAcceleration: 1,
    secondTopSpeed: 4,
  };

  it("lists both, the land Move first", () => {
    expect(vehicleMoves(amphibian)).toEqual([
      { locomotion: "wheels", acceleration: 3, topSpeed: 25 },
      { locomotion: "water", acceleration: 1, topSpeed: 4 },
    ]);
  });

  it("reads the Move in use", () => {
    expect(activeMove(amphibian)).toEqual({ locomotion: "wheels", acceleration: 3, topSpeed: 25 });
    expect(activeMove({ ...amphibian, secondMoveInUse: true })).toEqual({ locomotion: "water", acceleration: 1, topSpeed: 4 });
  });

  it("has only its first where it gives no second, whatever the switch says", () => {
    const car = { locomotion: "wheels", acceleration: 5, topSpeed: 60, secondLocomotion: "", secondMoveInUse: true };
    expect(vehicleMoves(car)).toHaveLength(1);
    expect(activeMove(car)).toEqual({ locomotion: "wheels", acceleration: 5, topSpeed: 60 });
  });
});

describe("several fragility codes", () => {
  it("accepts any of c, f and x, each once, and blank", () => {
    for (const entry of ["", "c", "f", "x", "fx", "xf", "cfx"]) expect(isFragilityEntry(entry)).toBe(true);
    for (const entry of ["ff", "q", "F", "f x", null, 3]) expect(isFragilityEntry(entry)).toBe(false);
  });

  it("reads each code, in the table's order", () => {
    expect(fragilityCodes("xf")).toEqual(["f", "x"]);
    expect(fragilityCodes("f")).toEqual(["f"]);
    expect(fragilityCodes("")).toEqual([]);
    expect(fragilityCodes(undefined)).toEqual([]);
  });
});
