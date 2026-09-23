import { describe, expect, it } from "vitest";

import {
  brittleLimb, explodesOnMajorWound, failsDeathChecks, fragileDeathCheck, fragileExplosion,
  fragileFromVehicleCodes, fragileIgnition, fragileKindsIn,
} from "../fragile.js";
import { traitEffects } from "../trait-effects.js";

/** Fragile (Characters pp. 136-137; Campaigns p. 463; sargas79/GWorldVTT#669). */
describe("which kinds of Fragile", () => {
  it("reads a vehicle's HT codes", () => {
    expect(fragileFromVehicleCodes("fx")).toEqual(["explosive", "flammable"]);
    expect(fragileFromVehicleCodes("c")).toEqual(["combustible"]);
    expect(fragileFromVehicleCodes("")).toEqual([]);
  });

  it("reads a trait's name, specialty or modifiers", () => {
    expect(fragileKindsIn(["Fragile (Combustible)"])).toEqual(["combustible"]);
    expect(fragileKindsIn(["Fragile", "Brittle"])).toEqual(["brittle"]);
    expect(fragileKindsIn(["Fragile", "", "Explosive", "Flammable"])).toEqual(["explosive", "flammable"]);
  });

  it("gathers every kind a character has, from the traits the pack holds", () => {
    const effects = traitEffects([
      { name: "Fragile (Explosive)" },
      { name: "Fragile (Flammable)" },
      { name: "Fragile", specialty: "Unnatural" },
    ]);
    expect(effects.fragile).toEqual(["explosive", "flammable", "unnatural"]);
    expect(traitEffects([{ name: "Combat Reflexes" }]).fragile).toEqual([]);
  });
});

describe("catching fire", () => {
  const blow = { injury: 6, majorWound: true, burningOrExplosive: true };

  it("rolls for a Combustible body after a major wound from fire, and not from anything else", () => {
    expect(fragileIgnition({ kinds: ["combustible"], ...blow })).toEqual({ kind: "roll", modifier: 0 });
    expect(fragileIgnition({ kinds: ["combustible"], ...blow, burningOrExplosive: false })).toEqual({ kind: "none" });
    expect(fragileIgnition({ kinds: ["combustible"], ...blow, majorWound: false })).toEqual({ kind: "none" });
  });

  it("sets a Combustible body alight outright at 10+ injury from fire", () => {
    expect(fragileIgnition({ kinds: ["combustible"], ...blow, injury: 10, majorWound: false })).toEqual({ kind: "alight" });
  });

  it("rolls for a Flammable body after any major wound: -3 for fire, -3 for the vitals, -6 for both", () => {
    expect(fragileIgnition({ kinds: ["flammable"], ...blow, burningOrExplosive: false })).toEqual({ kind: "roll", modifier: 0 });
    expect(fragileIgnition({ kinds: ["flammable"], ...blow })).toEqual({ kind: "roll", modifier: -3 });
    expect(fragileIgnition({ kinds: ["flammable"], ...blow, burningOrExplosive: false, vitals: true })).toEqual({ kind: "roll", modifier: -3 });
    expect(fragileIgnition({ kinds: ["flammable"], ...blow, vitals: true })).toEqual({ kind: "roll", modifier: -6 });
    expect(fragileIgnition({ kinds: ["flammable"], ...blow, majorWound: false })).toEqual({ kind: "none" });
  });

  it("sets a body both Combustible and Flammable alight on a major wound or 10+ injury from fire", () => {
    const both = ["combustible", "flammable"] as const;
    expect(fragileIgnition({ kinds: both, ...blow })).toEqual({ kind: "alight" });
    expect(fragileIgnition({ kinds: both, ...blow, injury: 12, majorWound: false })).toEqual({ kind: "alight" });
    // Any other attack is Flammable's roll.
    expect(fragileIgnition({ kinds: both, ...blow, burningOrExplosive: false })).toEqual({ kind: "roll", modifier: 0 });
  });

  it("does nothing to a body that is neither", () => {
    expect(fragileIgnition({ kinds: ["brittle", "explosive"], ...blow, injury: 20 })).toEqual({ kind: "none" });
  });
});

describe("exploding", () => {
  it("goes up on a critical failure of the major wound's HT roll, if Explosive", () => {
    expect(explodesOnMajorWound(["explosive"], { criticalFailure: true })).toBe(true);
    expect(explodesOnMajorWound(["explosive"], { criticalFailure: false })).toBe(false);
    expect(explodesOnMajorWound(["flammable"], { criticalFailure: true })).toBe(false);
  });

  it("is 6d×(HP/10) crushing, and leaves the body at -10×HP", () => {
    expect(fragileExplosion(15)).toEqual({ dice: 6, multiplier: 1.5, type: "cr", hpAfter: -150 });
  });
});

describe("the roll against death", () => {
  const fail = (margin: number, criticalFailure = false) => ({ success: false, margin, criticalFailure });

  it("destroys a Brittle body on any failure", () => {
    expect(fragileDeathCheck({ kinds: ["brittle"], roll: fail(1) })).toBe("destroyed");
    expect(fragileDeathCheck({ kinds: ["brittle"], roll: { success: true, margin: 0 } })).toBeNull();
  });

  it("explodes an Explosive body failing by 3 or more", () => {
    expect(fragileDeathCheck({ kinds: ["explosive"], roll: fail(3) })).toBe("explodes");
    expect(fragileDeathCheck({ kinds: ["explosive"], roll: fail(2) })).toBeNull();
  });

  it("explodes a Flammable body on a critical failure, but only while it burns", () => {
    expect(fragileDeathCheck({ kinds: ["flammable"], roll: fail(1, true), burning: true })).toBe("explodes");
    expect(fragileDeathCheck({ kinds: ["flammable"], roll: fail(1, true), burning: false })).toBeNull();
    expect(fragileDeathCheck({ kinds: ["flammable"], roll: fail(1), burning: true })).toBeNull();
  });

  it("fails it outright for an Unnatural body", () => {
    expect(failsDeathChecks(["unnatural"])).toBe(true);
    expect(failsDeathChecks(["brittle"])).toBe(false);
  });
});

describe("a Brittle limb", () => {
  it("falls off whole on a HT roll, and shatters without one", () => {
    expect(brittleLimb({ success: true })).toBe("fallsOff");
    expect(brittleLimb({ success: false })).toBe("shatters");
  });
});
