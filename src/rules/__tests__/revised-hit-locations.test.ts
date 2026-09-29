import { describe, expect, it } from "vitest";

import { canTarget } from "../hit-locations.js";
import { injuryToleranceFrom, noInjuryTolerance } from "../injury-tolerance.js";
import {
  REVISED_LOCATIONS,
  fromBehindAdjustment,
  isMissingPart,
  neckSnapBreaksNeck,
  refineRandomHit,
  removedByCut,
  revisedLocation,
  withChestCoverage,
  woundNotes,
} from "../revised-hit-locations.js";
import { traitEffects } from "../trait-effects.js";
import type { DamageType } from "../types.js";

/** Basic Set Revised p. 566, Addendum 3. */
describe("the rows", () => {
  it.each([
    ["ear", "face", -7],
    ["nose", "face", -7],
    ["jaw", "face", -6],
    ["chest", "torso", 0],
    ["abdomen", "torso", -1],
    ["spineTorso", "torso", -8],
    ["spineNeck", "neck", -8],
    ["pelvis", "torso", -3],
    ["jointArm", "arm", -5],
    ["jointLeg", "leg", -5],
    ["jointHand", "hand", -7],
    ["jointFoot", "foot", -7],
    ["veinsArm", "arm", -5],
    ["veinsLeg", "leg", -5],
    ["veinsNeck", "neck", -8],
  ] as const)("%s is part of the %s at %s", (key, parent, penalty) => {
    expect(revisedLocation(key)).toMatchObject({ parent, penalty });
  });

  it("gives the spine DR 3, the torso wounding, and a roll on any shock", () => {
    const spine = revisedLocation("spineTorso")!;
    expect(spine.extraDr).toBe(3);
    expect(spine.shockKnockdown).toBe(true);
    expect(spine.majorWoundKnockdown).toBe(-5);
    expect(revisedLocation("spineNeck")!.wounding!("cut")).toBe(1.5);
  });

  it("takes no impaling at a joint, and no crushing at the veins", () => {
    expect(revisedLocation("jointArm")!.damageTypes).not.toContain("imp");
    expect(revisedLocation("jointArm")!.damageTypes).toContain("cr");
    expect(revisedLocation("veinsArm")!.damageTypes).toContain("imp");
    expect(revisedLocation("veinsArm")!.damageTypes).not.toContain("cr");
  });

  it("cripples a joint over HP/3 for a limb and HP/4 for an extremity", () => {
    const divisor = (key: string) => (revisedLocation(key)!.cripplingDivisor as (type: DamageType) => number)("cr");
    expect(divisor("jointLeg")).toBe(3);
    expect(divisor("jointFoot")).toBe(4);
  });

  it("adds 0.5 to the wounding at the veins, and lifts the limb limit", () => {
    expect(revisedLocation("veinsArm")!.wounding!("cut")).toBe(2);
    expect(revisedLocation("veinsNeck")!.wounding!("cut")).toBe(2.5);
    expect(revisedLocation("veinsLeg")!.cripplingDivisor).toBeNull();
  });

  it("lists every row once", () => {
    expect(new Set(REVISED_LOCATIONS.map((row) => row.key)).size).toBe(REVISED_LOCATIONS.length);
  });
});

describe("the ear and the nose", () => {
  const ear = revisedLocation("ear")!;
  const nose = revisedLocation("nose")!;
  const divisor = (row: typeof ear, type: DamageType) => (typeof row.cripplingDivisor === "function" ? row.cripplingDivisor(type) : row.cripplingDivisor);

  it("caps only a cut, at HP/4", () => {
    expect(divisor(ear, "cut")).toBe(4);
    expect(divisor(ear, "cr")).toBeNull();
    expect(divisor(nose, "cut")).toBe(4);
  });

  it("removes at twice the injury that cripples", () => {
    // 12 HP: over 3 cripples, so 4 does; twice is 8.
    expect(removedByCut(7, 12)).toBe(false);
    expect(removedByCut(8, 12)).toBe(true);
  });

  it("makes a sliced ear a major wound only once it is off", () => {
    expect(ear.majorWound!({ type: "cut", injury: 4, uncappedInjury: 6, maxHp: 12 })).toBe(false);
    expect(ear.majorWound!({ type: "cut", injury: 4, uncappedInjury: 9, maxHp: 12 })).toBe(true);
    expect(ear.majorWound!({ type: "cr", injury: 2, uncappedInjury: 2, maxHp: 12 })).toBeNull();
  });

  it("breaks the nose over HP/4, whatever the type but a cut", () => {
    expect(nose.majorWound!({ type: "cr", injury: 4, uncappedInjury: 4, maxHp: 12 })).toBe(true);
    expect(nose.majorWound!({ type: "cr", injury: 3, uncappedInjury: 3, maxHp: 12 })).toBeNull();
    expect(nose.majorWound!({ type: "cut", injury: 4, uncappedInjury: 4, maxHp: 12 })).toBeNull();
  });

  it("drops the face -5 to knockdown for a cut, and keeps it otherwise", () => {
    const knockdown = ear.majorWoundKnockdown as (type: DamageType) => number | null;
    expect(knockdown("cut")).toBe(0);
    expect(knockdown("cr")).toBeNull();
  });

  it("takes an extra -1 to knockdown for crushing at the jaw", () => {
    expect(revisedLocation("jaw")!.knockdownFor!("cr")).toBe(-1);
    expect(revisedLocation("jaw")!.knockdownFor!("cut")).toBe(0);
  });
});

describe("crushing at the vitals, and aiming from behind", () => {
  it("lets crushing aim at the vitals only under the rule", () => {
    expect(canTarget("vitals", "cr")).toBe(false);
    expect(canTarget("vitals", "cr", { crushingVitals: true })).toBe(true);
    expect(canTarget("vitals", "cut", { crushingVitals: true })).toBe(false);
  });

  it("puts the skull at -5 and the face at -7 from behind", () => {
    expect(fromBehindAdjustment("skull", "back")).toBe(2);
    expect(fromBehindAdjustment("face", "back")).toBe(-2);
    expect(fromBehindAdjustment("skull", "front")).toBe(0);
    expect(fromBehindAdjustment("torso", "back")).toBe(0);
  });
});

describe("the random hit", () => {
  const dice = (...faces: number[]) => {
    const rolled: number[] = [];
    return {
      d6: () => {
        const face = faces[rolled.length] ?? 6;
        rolled.push(face);
        return face;
      },
      rolled,
    };
  };
  const base = { roll: 10, arc: null, refine: true, split: false } as const;

  it("splits the torso into chest and abdomen", () => {
    const d = dice();
    expect(refineRandomHit({ ...base, location: "torso", damageType: null, d6: d.d6, refine: false, split: true })).toEqual({ location: "torso", key: "chest" });
    expect(refineRandomHit({ ...base, roll: 11, location: "groin", damageType: null, d6: d.d6, refine: false, split: true })).toEqual({ location: "torso", key: "abdomen" });
    expect(refineRandomHit({ ...base, roll: 11, location: "groin", damageType: null, d6: d.d6, refine: false, split: false })).toBeNull();
  });

  it("turns a face hit into the skull for a point and the nose otherwise, on a 1", () => {
    expect(refineRandomHit({ ...base, roll: 5, location: "face", damageType: "pi", d6: dice(1).d6 })).toEqual({ location: "skull", key: null });
    expect(refineRandomHit({ ...base, roll: 5, location: "face", damageType: "cr", d6: dice(1).d6 })).toEqual({ location: "face", key: "nose" });
    expect(refineRandomHit({ ...base, roll: 5, location: "face", damageType: "cr", d6: dice(2).d6 })).toBeNull();
    // From behind there is no nose to hit.
    expect(refineRandomHit({ ...base, roll: 5, arc: "back", location: "face", damageType: "cr", d6: dice(1).d6 })).toBeNull();
  });

  it("finds the veins or the spine in the neck", () => {
    expect(refineRandomHit({ ...base, roll: 17, location: "neck", damageType: "cut", d6: dice(1).d6 })).toEqual({ location: "neck", key: "veinsNeck" });
    expect(refineRandomHit({ ...base, roll: 17, arc: "back", location: "neck", damageType: "cr", d6: dice(1).d6 })).toEqual({ location: "neck", key: "spineNeck" });
    expect(refineRandomHit({ ...base, roll: 17, arc: "front", location: "neck", damageType: "cr", d6: dice(1).d6 })).toBeNull();
  });

  it("finds the vitals or the spine in the torso, and keeps the chest otherwise", () => {
    expect(refineRandomHit({ ...base, location: "torso", damageType: "imp", d6: dice(1).d6, split: true })).toEqual({ location: "vitals", key: null });
    expect(refineRandomHit({ ...base, arc: "back", location: "torso", damageType: "cut", d6: dice(1).d6, split: true })).toEqual({ location: "torso", key: "spineTorso" });
    expect(refineRandomHit({ ...base, location: "torso", damageType: "imp", d6: dice(4).d6, split: true })).toEqual({ location: "torso", key: "chest" });
  });

  it("finds the veins or a joint in a limb, and a joint in a hand or foot", () => {
    expect(refineRandomHit({ ...base, roll: 6, location: "leg", damageType: "pi", d6: dice(1).d6 })).toEqual({ location: "leg", key: "veinsLeg" });
    expect(refineRandomHit({ ...base, roll: 8, location: "arm", damageType: "cr", d6: dice(1).d6 })).toEqual({ location: "arm", key: "jointArm" });
    expect(refineRandomHit({ ...base, roll: 15, location: "hand", damageType: "cut", d6: dice(1).d6 })).toEqual({ location: "hand", key: "jointHand" });
    // Impaling does not reach the joints of a foot.
    expect(refineRandomHit({ ...base, roll: 16, location: "foot", damageType: "imp", d6: dice(1).d6 })).toBeNull();
  });

  it("rolls no die where the type of the blow asks for none", () => {
    const d = dice(1);
    refineRandomHit({ ...base, roll: 8, location: "arm", damageType: "burn", d6: d.d6 });
    expect(d.rolled).toEqual([]);
  });
});

describe("bodies without the part", () => {
  it("removes the spine and pelvis for Invertebrate, Diffuse and Homogenous", () => {
    const invertebrate = { ...noInjuryTolerance(), invertebrate: true };
    expect(isMissingPart("gworld.spineTorso", invertebrate)).toBe(true);
    expect(isMissingPart("pelvis", invertebrate)).toBe(true);
    expect(isMissingPart("jointArm", invertebrate)).toBe(false);
    expect(isMissingPart("pelvis", injuryToleranceFrom(["Injury Tolerance (Diffuse)"]))).toBe(true);
    expect(isMissingPart("veinsArm", injuryToleranceFrom(["Injury Tolerance (Homogenous)"]))).toBe(true);
  });

  it("removes the veins for No Blood, ear, nose and jaw for No Head, neck parts for No Neck", () => {
    expect(isMissingPart("veinsLeg", injuryToleranceFrom(["Injury Tolerance (No Blood)"]))).toBe(true);
    expect(isMissingPart("jaw", injuryToleranceFrom(["Injury Tolerance (No Head)"]))).toBe(true);
    const noNeck = injuryToleranceFrom(["Injury Tolerance (No Neck)"]);
    expect(isMissingPart("veinsNeck", noNeck)).toBe(true);
    expect(isMissingPart("spineNeck", noNeck)).toBe(true);
    expect(isMissingPart("spineTorso", noNeck)).toBe(false);
    expect(isMissingPart("veinsArm", noNeck)).toBe(false);
  });

  it("removes the leg parts for No Legs and every limb parts for No Manipulators", () => {
    const legless = { ...noInjuryTolerance(), noLegs: true };
    expect(isMissingPart("jointLeg", legless)).toBe(true);
    expect(isMissingPart("veinsLeg", legless)).toBe(true);
    expect(isMissingPart("jointArm", legless)).toBe(false);
    const handless = { ...noInjuryTolerance(), noManipulators: true };
    expect(isMissingPart("jointArm", handless)).toBe(true);
    expect(isMissingPart("veinsArm", handless)).toBe(true);
  });

  it("reads the three traits", () => {
    const held = (name: string) => traitEffects([{ name }]).injuryTolerance;
    expect(held("Invertebrate").invertebrate).toBe(true);
    expect(held("No Legs (Aerial)").noLegs).toBe(true);
    expect(held("No Manipulators").noManipulators).toBe(true);
    expect(held("Toughness").invertebrate).toBe(false);
  });
});

describe("armour over the chest", () => {
  const vest = { name: "vest", locations: ["chest"] };
  const suit = { name: "suit", locations: ["torso", "groin"] };

  it("covers a blow at the chest and not one at the abdomen", () => {
    expect(withChestCoverage([vest], "gworld.chest", true)[0]!.locations).toContain("torso");
    expect(withChestCoverage([vest], "gworld.abdomen", true)[0]!.locations).not.toContain("torso");
  });

  it("covers the whole torso while the split is off", () => {
    expect(withChestCoverage([vest], null, false)[0]!.locations).toContain("torso");
  });

  it("leaves other armour alone", () => {
    expect(withChestCoverage([suit], "gworld.abdomen", true)).toEqual([suit]);
  });
});

describe("what the wound did", () => {
  const wound = {
    hitLocation: "face" as const,
    type: "cut" as DamageType,
    injury: 4,
    maxHp: 12,
    majorWound: false,
    crippled: false,
    deathCheck: false,
  };

  it("slices an ear, or cuts it off at twice the injury", () => {
    expect(woundNotes({ ...wound, row: "ear", uncappedInjury: 6 })[0]).toMatchObject({ key: "EarSliced", data: { lost: 2 } });
    expect(woundNotes({ ...wound, row: "ear", uncappedInjury: 9 })[0]).toMatchObject({ key: "EarRemoved" });
    expect(woundNotes({ ...wound, row: "ear", uncappedInjury: 3 })).toEqual([]);
  });

  it("breaks, lops or removes a nose", () => {
    expect(woundNotes({ ...wound, row: "nose", type: "cr", uncappedInjury: 4 })[0]!.key).toBe("NoseBroken");
    expect(woundNotes({ ...wound, row: "nose", crippled: true, uncappedInjury: 5 })[0]!.key).toBe("NoseLopped");
    expect(woundNotes({ ...wound, row: "nose", crippled: true, uncappedInjury: 9 })[0]!.key).toBe("NoseRemoved");
  });

  it("cripples the spine over HP, and breaks the neck when it is the neck", () => {
    expect(woundNotes({ ...wound, row: "spineTorso", type: "cr", uncappedInjury: 13 })[0]!.key).toBe("SpineCrippled");
    expect(woundNotes({ ...wound, row: "spineTorso", type: "cr", uncappedInjury: 12 })).toEqual([]);
    expect(woundNotes({ ...wound, row: "spineNeck", type: "cr", uncappedInjury: 13 })[0]!.key).toBe("NeckBroken");
  });

  it("fells the target on a major pelvis wound", () => {
    expect(woundNotes({ ...wound, row: "pelvis", majorWound: true, uncappedInjury: 8 })[0]!.key).toBe("PelvisBroken");
    expect(woundNotes({ ...wound, row: "pelvis", uncappedInjury: 3 })).toEqual([]);
  });

  it("names a crippled joint, the veins ruling and the decapitation ruling", () => {
    expect(woundNotes({ ...wound, row: "jointLeg", crippled: true, uncappedInjury: 6 })[0]!.key).toBe("JointCrippled");
    expect(woundNotes({ ...wound, row: "veinsNeck", deathCheck: true, uncappedInjury: 20 })[0]!.key).toBe("VeinsBleedOut");
    expect(woundNotes({ ...wound, row: null, hitLocation: "neck", deathCheck: true, uncappedInjury: 20 })[0]!.key).toBe("Decapitation");
    expect(woundNotes({ ...wound, row: null, hitLocation: "neck", type: "cr", deathCheck: true, uncappedInjury: 20 })).toEqual([]);
  });

  it("breaks the neck of a neck snap over HP", () => {
    expect(neckSnapBreaksNeck(11, 10)).toBe(true);
    expect(neckSnapBreaksNeck(10, 10)).toBe(false);
  });
});
