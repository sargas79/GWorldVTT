import { describe, expect, it } from "vitest";

import { crippledMove, locationCount, lostLegsMoveFactor } from "../vehicle-combat.js";

/**
 * What crippled wheels, tracks, runners, rotors, wings and masts leave of a
 * vehicle's Move (Campaigns p. 555; Characters p. 54; sargas79/GWorldVTT#735).
 */
describe("locationCount", () => {
  it("reads the figure before a location's letter, one for none, and none where it isn't listed", () => {
    expect(locationCount("G4W", "wheel")).toBe(4);
    expect(locationCount("E2W", "wheel")).toBe(2);
    expect(locationCount("gW", "wheel")).toBe(1);
    expect(locationCount("3MO", "mast")).toBe(3);
    expect(locationCount("G2C", "wheel")).toBe(0);
    // A wing is not a wheel.
    expect(locationCount("GHWi", "wheel")).toBe(0);
    expect(locationCount("GHWi", "wing")).toBe(1);
  });
});

describe("lostLegsMoveFactor", () => {
  it("halves three or four legs for the first lost, and falls at the second", () => {
    expect(lostLegsMoveFactor(4, 0)).toBe(1);
    expect(lostLegsMoveFactor(4, 1)).toBe(0.5);
    expect(lostLegsMoveFactor(3, 1)).toBe(0.5);
    expect(lostLegsMoveFactor(4, 2)).toBe(0);
  });

  it("takes 20% a leg from five or six, and 10% from seven or more, down to 40% at three left", () => {
    expect(lostLegsMoveFactor(6, 1)).toBeCloseTo(0.8);
    expect(lostLegsMoveFactor(6, 2)).toBeCloseTo(0.6);
    expect(lostLegsMoveFactor(6, 3)).toBe(0.4);
    expect(lostLegsMoveFactor(6, 4)).toBe(0);
    expect(lostLegsMoveFactor(5, 2)).toBe(0.4);
    expect(lostLegsMoveFactor(8, 1)).toBeCloseTo(0.9);
    expect(lostLegsMoveFactor(8, 4)).toBeCloseTo(0.6);
    expect(lostLegsMoveFactor(8, 5)).toBe(0.4);
    expect(lostLegsMoveFactor(8, 6)).toBe(0);
  });

  it("leaves nothing to two legs or fewer that lose one", () => {
    expect(lostLegsMoveFactor(2, 1)).toBe(0);
    expect(lostLegsMoveFactor(1, 1)).toBe(0);
  });
});

describe("crippledMove", () => {
  const car = { locomotion: "wheels" as const, acceleration: 5, topSpeed: 55 };

  it("slows a four-wheeled car to half, rounded down, for one crippled wheel", () => {
    expect(crippledMove({ move: car, crippled: { wheel: 1 }, locations: "G4W" })).toEqual({
      acceleration: 2.5, topSpeed: 27, factor: 0.5, cause: "wheel",
    });
    expect(crippledMove({ move: car, crippled: { wheel: 2 }, locations: "G4W" })).toMatchObject({ acceleration: 0, topSpeed: 0 });
  });

  it("stops a motorcycle for one wheel, and a tracked vehicle or a sled for one track or runner", () => {
    expect(crippledMove({ move: car, crippled: { wheel: 1 }, locations: "E2W" }).topSpeed).toBe(0);
    const tank = { locomotion: "tracks" as const, acceleration: 2, topSpeed: 20 };
    expect(crippledMove({ move: tank, crippled: { track: 1 }, locations: "2CT" })).toMatchObject({ topSpeed: 0, cause: "track" });
    const sled = { locomotion: "runners" as const, acceleration: 1, topSpeed: 10 };
    expect(crippledMove({ move: sled, crippled: { runner: 1 }, locations: "R" })).toMatchObject({ topSpeed: 0, cause: "runner" });
  });

  it("grounds an aircraft for a rotor or a wing", () => {
    const helicopter = { locomotion: "air" as const, acceleration: 4, topSpeed: 80 };
    expect(crippledMove({ move: helicopter, crippled: { rotor: 1 }, locations: "GH" })).toMatchObject({ acceleration: 0, topSpeed: 0, cause: "rotor" });
    expect(crippledMove({ move: helicopter, crippled: { wing: 1 }, locations: "GWi" })).toMatchObject({ topSpeed: 0, cause: "wing" });
  });

  it("takes 1/(masts) off a sailing vessel for each mast, rounded up", () => {
    const ship = { locomotion: "water" as const, acceleration: 0.1, topSpeed: 4 };
    // Three masts, one gone: 2/3 Move, 4 x 2/3 = 2.67 rounds up to 3.
    expect(crippledMove({ move: ship, crippled: { mast: 1 }, locations: "3M" })).toMatchObject({
      acceleration: 0.1, topSpeed: 3, cause: "mast",
    });
  });

  it("leaves a Move alone where what is crippled isn't what it moves by", () => {
    // An amphibian in the water doesn't miss a wheel.
    const boat = { locomotion: "water" as const, acceleration: 1, topSpeed: 5 };
    expect(crippledMove({ move: boat, crippled: { wheel: 2 }, locations: "G4W" })).toEqual({
      acceleration: 1, topSpeed: 5, factor: 1, cause: null,
    });
    expect(crippledMove({ move: car, crippled: {}, locations: "G4W" })).toMatchObject({ topSpeed: 55, cause: null });
  });
});
