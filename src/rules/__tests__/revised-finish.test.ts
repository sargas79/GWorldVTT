import { describe, expect, it } from "vitest";

import { appearanceAfter, jointDivisor, refineRandomHit, revisedLocation, woundTraits } from "../revised-hit-locations.js";
import { rigidHelmWorn } from "../natural-attacks.js";
import { stampKickTarget } from "../addendum-techniques.js";

/** What #912 and #917 left over (Basic Set Revised pp. 333-334, 566). */
describe("a joint on a body with extra limbs", () => {
  it("cripples over HP/3 for a limb and HP/4 for an extremity with the usual two", () => {
    expect(jointDivisor("arm", false)).toBe(3);
    expect(jointDivisor("hand", true)).toBe(4);
    expect(jointDivisor("leg", false, { arms: 2, legs: 2 })).toBe(3);
  });

  it("takes one more of the divisor than the whole part does", () => {
    // Four arms cripple over HP/4 and four hands over HP/6; the joints over HP/5 and HP/7.
    expect(jointDivisor("arm", false, { arms: 4 })).toBe(5);
    expect(jointDivisor("hand", true, { arms: 4 })).toBe(7);
    // Legs count apart from arms.
    expect(jointDivisor("leg", false, { arms: 4, legs: 3 })).toBe(4);
    expect(jointDivisor("foot", true, { arms: 4, legs: 6 })).toBe(10);
  });

  it("is what the registered row reads", () => {
    const arm = revisedLocation("jointArm")!;
    const divisor = arm.cripplingDivisor as (type: "cr", limbs?: { arms?: number; legs?: number }) => number;
    expect(divisor("cr")).toBe(3);
    expect(divisor("cr", { arms: 4, legs: 2 })).toBe(5);
  });
});

describe("a tight-beam burn on a random hit", () => {
  const dice = (face: number) => ({ d6: () => face });
  const base = { roll: 5, arc: null, refine: true, split: false } as const;

  it("counts with the piercing wherever the book lists it, when it is known to be tight-beam", () => {
    expect(refineRandomHit({ ...base, location: "face", damageType: "burn", tightBeam: true, ...dice(1) })).toEqual({ location: "skull", key: null });
    expect(refineRandomHit({ ...base, location: "neck", damageType: "burn", tightBeam: true, ...dice(1) })).toEqual({ location: "neck", key: "veinsNeck" });
    expect(refineRandomHit({ ...base, location: "torso", damageType: "burn", tightBeam: true, ...dice(1) })).toEqual({ location: "vitals", key: null });
    expect(refineRandomHit({ ...base, location: "arm", damageType: "burn", tightBeam: true, ...dice(1) })).toEqual({ location: "arm", key: "veinsArm" });
    expect(refineRandomHit({ ...base, location: "foot", damageType: "burn", tightBeam: true, ...dice(1) })).toEqual({ location: "foot", key: "jointFoot" });
  });

  it("is left out where the burn is a torch or a flame, or is not known to be a laser", () => {
    expect(refineRandomHit({ ...base, location: "torso", damageType: "burn", tightBeam: false, ...dice(1) })).toBeNull();
    expect(refineRandomHit({ ...base, location: "neck", damageType: "burn", ...dice(1) })).toBeNull();
    // A face hit by a plain burn is a nose, not the skull.
    expect(refineRandomHit({ ...base, location: "face", damageType: "burn", tightBeam: false, ...dice(1) })).toEqual({ location: "face", key: "nose" });
  });
});

describe("where a miss by one lands", () => {
  it("is the chest from the ear, nose and jaw, and the abdomen from the pelvis", () => {
    for (const key of ["ear", "nose", "jaw"]) expect(revisedLocation(key)!.missFallback).toBe("gworld.chest");
    expect(revisedLocation("pelvis")!.missFallback).toBe("gworld.abdomen");
    expect(revisedLocation("spineTorso")!.missFallback).toBe("torso");
  });
});

describe("what a lasting wound gives the character", () => {
  it("names the traits of each outcome", () => {
    expect(woundTraits("SpineCrippled")).toEqual([{ name: "Bad Back", level: 2 }, { name: "Lame (Paraplegic)" }]);
    expect(woundTraits("NeckBroken")).toEqual([{ name: "Quadriplegic" }]);
    expect(woundTraits("PelvisBroken")).toEqual([{ name: "Lame (Missing Legs)" }]);
    expect(woundTraits("NoseBroken")).toEqual([{ name: "No Sense of Smell/Taste" }]);
    expect(woundTraits("EarRemoved")).toEqual([{ name: "", appearance: 1 }]);
    expect(woundTraits("NoseRemoved")).toEqual([{ name: "", appearance: 2 }]);
  });

  it("gives nothing for a reminder", () => {
    expect(woundTraits("JointCrippled")).toEqual([]);
    expect(woundTraits("EarSliced")).toEqual([]);
    expect(woundTraits("Decapitation")).toEqual([]);
  });

  it("takes levels of Appearance across the advantage and the disadvantage", () => {
    expect(appearanceAfter(2, 1)).toEqual({ trait: "Appearance", levels: 1, signed: 1 });
    expect(appearanceAfter(1, 1)).toEqual({ trait: null, levels: 0, signed: 0 });
    expect(appearanceAfter(0, 1)).toEqual({ trait: "Appearance (Disadvantage)", levels: 1, signed: -1 });
    expect(appearanceAfter(1, 2)).toEqual({ trait: "Appearance (Disadvantage)", levels: 1, signed: -1 });
    expect(appearanceAfter(-2, 2)).toEqual({ trait: "Appearance (Disadvantage)", levels: 4, signed: -4 });
    // The disadvantage stops at Horrific.
    expect(appearanceAfter(-5, 2)).toEqual({ trait: "Appearance (Disadvantage)", levels: 5, signed: -5 });
  });
});

describe("a rigid helm", () => {
  const helm = (over: Record<string, unknown> = {}) => ({ system: { equipped: true, flexible: false, drByLocation: [{ locations: ["skull"], dr: 4 }], ...over } });

  it("is worn, rigid and covers the skull", () => {
    expect(rigidHelmWorn([helm()])).toBe(true);
    expect(rigidHelmWorn([helm({ equipped: false })])).toBe(false);
    expect(rigidHelmWorn([helm({ flexible: true })])).toBe(false);
    expect(rigidHelmWorn([helm({ drByLocation: [{ locations: ["torso"], dr: 4 }] })])).toBe(false);
    expect(rigidHelmWorn([])).toBe(false);
  });
});

describe("the Stamp Kick's target", () => {
  it("is a lying foe, or a standing foe's foot or leg", () => {
    expect(stampKickTarget({ foePosture: "lying" })).toBe(true);
    expect(stampKickTarget({ foePosture: "standing", location: "leg" })).toBe(true);
    expect(stampKickTarget({ foePosture: "standing", location: "foot" })).toBe(true);
    expect(stampKickTarget({ foePosture: "standing" })).toBe(false);
    expect(stampKickTarget({ foePosture: "kneeling", location: "torso" })).toBe(false);
  });
});
