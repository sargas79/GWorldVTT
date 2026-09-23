import { describe, expect, it } from "vitest";

import { computeInjury } from "../damage.js";
import {
  HIT_LOCATIONS,
  applyCrippling,
  canTarget,
  cripplingThreshold,
  locationDrAgainst,
  randomHitLocation,
  woundingModifierAt,
} from "../hit-locations.js";

describe("the hit location table (GURPS Basic Set: Campaigns p. 552)", () => {
  it.each([
    ["torso", 0],
    ["vitals", -3],
    ["groin", -3],
    ["arm", -2],
    ["leg", -2],
    ["hand", -4],
    ["foot", -4],
    ["face", -5],
    ["neck", -5],
    ["skull", -7],
    ["eye", -9],
  ] as const)("puts %s at %s to hit", (location, penalty) => {
    expect(HIT_LOCATIONS[location].toHit).toBe(penalty);
  });

  it("gives only the skull extra DR", () => {
    expect(HIT_LOCATIONS.skull.extraDr).toBe(2);
    for (const key of ["torso", "eye", "face", "neck", "vitals", "arm"] as const) {
      expect(HIT_LOCATIONS[key].extraDr, key).toBe(0);
    }
  });

  it("penalises knockdown on the skull, eye, face and groin", () => {
    expect(HIT_LOCATIONS.skull.knockdown).toBe(-10);
    expect(HIT_LOCATIONS.face.knockdown).toBe(-5);
    expect(HIT_LOCATIONS.groin.knockdown).toBe(-5);
    expect(HIT_LOCATIONS.torso.knockdown).toBe(0);
  });
});

describe("random hit location (3d6)", () => {
  it.each([
    [3, "skull"], [4, "skull"],
    [5, "face"],
    [6, "leg"], [7, "leg"],
    [8, "arm"],
    [9, "torso"], [10, "torso"],
    [11, "groin"],
    [12, "arm"],
    [13, "leg"], [14, "leg"],
    [15, "hand"],
    [16, "foot"],
    [17, "neck"], [18, "neck"],
  ] as const)("maps a roll of %s to the %s", (roll, location) => {
    expect(randomHitLocation(roll).location).toBe(location);
  });

  it("distinguishes right from left limbs", () => {
    expect(randomHitLocation(6).side).toBe("right");
    expect(randomHitLocation(8).side).toBe("right");
    expect(randomHitLocation(12).side).toBe("left");
    expect(randomHitLocation(13).side).toBe("left");
  });

  it("never rolls the eye or vitals, which must be targeted deliberately", () => {
    for (let roll = 3; roll <= 18; roll++) {
      expect(["eye", "vitals"]).not.toContain(randomHitLocation(roll).location);
    }
    expect(HIT_LOCATIONS.eye.deliberateOnly).toBe(true);
    expect(HIT_LOCATIONS.vitals.deliberateOnly).toBe(true);
  });

  it("clamps rolls outside 3-18 onto the table", () => {
    expect(randomHitLocation(1).location).toBe("skull");
    expect(randomHitLocation(25).location).toBe("neck");
  });
});

describe("targeting restrictions", () => {
  it("lets only impaling and piercing attacks target the eye and vitals", () => {
    // Burning is handled separately: only a tight-beam burn qualifies.
    for (const type of ["imp", "pi", "pi+", "pi++", "pi-"] as const) {
      expect(canTarget("vitals", type), type).toBe(true);
      expect(canTarget("eye", type), type).toBe(true);
    }
    for (const type of ["cr", "cut", "cor", "tox", "fat"] as const) {
      expect(canTarget("vitals", type), type).toBe(false);
      expect(canTarget("eye", type), type).toBe(false);
    }
  });

  it("puts no restriction on ordinary locations", () => {
    for (const type of ["cr", "cut", "imp", "tox"] as const) {
      expect(canTarget("torso", type)).toBe(true);
      expect(canTarget("arm", type)).toBe(true);
    }
  });
});

describe("per-location wounding modifiers (GURPS Basic Set: Campaigns pp. 398-399)", () => {
  it("quadruples everything to the skull", () => {
    for (const type of ["cr", "cut", "imp", "pi"] as const) {
      expect(woundingModifierAt(type, "skull"), type).toBe(4);
    }
  });

  it("exempts toxic damage from the skull multiplier", () => {
    expect(woundingModifierAt("tox", "skull")).toBe(1);
    expect(woundingModifierAt("tox", "eye")).toBe(1);
  });

  it("triples impaling and piercing to the vitals", () => {
    expect(woundingModifierAt("imp", "vitals")).toBe(3);
    expect(woundingModifierAt("pi", "vitals")).toBe(3);
    expect(woundingModifierAt("pi-", "vitals")).toBe(3);
    // A tight-beam burning attack only doubles, and a plain burn gets nothing.
    expect(woundingModifierAt("burn", "vitals", { tightBeam: true })).toBe(2);
    expect(woundingModifierAt("burn", "vitals")).toBe(1);
  });

  it("raises crushing and corrosion to the neck, and doubles cutting", () => {
    expect(woundingModifierAt("cr", "neck")).toBe(1.5);
    expect(woundingModifierAt("cor", "neck")).toBe(1.5);
    expect(woundingModifierAt("cut", "neck")).toBe(2);
  });

  it("raises only corrosion against the face", () => {
    expect(woundingModifierAt("cor", "face")).toBe(1.5);
    expect(woundingModifierAt("cr", "face")).toBe(1);
    expect(woundingModifierAt("cut", "face")).toBe(1.5); // its own base
  });

  it("caps the big multipliers on limbs rather than raising them", () => {
    // A spear through the arm does far less than one through the chest.
    for (const location of ["arm", "leg", "hand", "foot"] as const) {
      expect(woundingModifierAt("imp", location), location).toBe(1);
      expect(woundingModifierAt("pi+", location), location).toBe(1);
      expect(woundingModifierAt("pi++", location), location).toBe(1);
      // Cutting is unaffected by the limb rule.
      expect(woundingModifierAt("cut", location), location).toBe(1.5);
    }
  });

  it("leaves the torso on the damage type's own modifier", () => {
    expect(woundingModifierAt("imp", "torso")).toBe(2);
    expect(woundingModifierAt("cut", "torso")).toBe(1.5);
    expect(woundingModifierAt("pi-", "torso")).toBe(0.5);
  });
});

describe("crippling", () => {
  it("cripples a limb above half HP and an extremity above a third", () => {
    expect(cripplingThreshold("arm", 12)).toBe(6);
    expect(cripplingThreshold("leg", 12)).toBe(6);
    expect(cripplingThreshold("hand", 12)).toBe(4);
    expect(cripplingThreshold("foot", 12)).toBe(4);
  });

  it("cannot cripple the torso, skull or vitals", () => {
    for (const location of ["torso", "skull", "vitals", "neck", "face", "groin"] as const) {
      expect(cripplingThreshold(location, 12), location).toBeNull();
    }
  });

  it("blinds an eye above a tenth of HP, and loses none of the blow (Campaigns p. 399, #410)", () => {
    expect(cripplingThreshold("eye", 30)).toBe(3);
    expect(applyCrippling(3, "eye", 30)).toEqual({ injury: 3, excessLost: 0, crippled: false });
    expect(applyCrippling(8, "eye", 30)).toEqual({ injury: 8, excessLost: 0, crippled: true });
  });

  it("discards injury beyond the crippling threshold", () => {
    // A hand cannot absorb a killing blow: excess is lost, not carried over.
    // Over 4 cripples a 12 HP hand, so it keeps 5.
    const result = applyCrippling(20, "hand", 12);
    expect(result.injury).toBe(5);
    expect(result.excessLost).toBe(15);
    expect(result.crippled).toBe(true);
  });

  it("keeps the least injury that cripples, not the threshold (Campaigns p. 421, #616)", () => {
    // "If a man has 10 HP and suffers 9 points of injury to his right arm, he
    // loses only 6 HP."
    expect(applyCrippling(9, "arm", 10)).toEqual({ injury: 6, excessLost: 3, crippled: true });
    // Friedrick, 14 HP, takes 11 to the arm and loses 8 (p. 420).
    expect(applyCrippling(11, "arm", 14)).toEqual({ injury: 8, excessLost: 3, crippled: true });
  });

  it("cripples a limb at the first point over HP/2, for even and odd HP (#616)", () => {
    // Even HP: 10 HP, over 5.
    expect(applyCrippling(5, "arm", 10)).toEqual({ injury: 5, excessLost: 0, crippled: false });
    expect(applyCrippling(6, "arm", 10)).toEqual({ injury: 6, excessLost: 0, crippled: true });
    expect(applyCrippling(7, "leg", 10)).toEqual({ injury: 6, excessLost: 1, crippled: true });
    // Odd HP: 11 HP, over 5.5.
    expect(applyCrippling(5, "arm", 11)).toEqual({ injury: 5, excessLost: 0, crippled: false });
    expect(applyCrippling(6, "arm", 11)).toEqual({ injury: 6, excessLost: 0, crippled: true });
    expect(applyCrippling(7, "leg", 11)).toEqual({ injury: 6, excessLost: 1, crippled: true });
  });

  it("cripples an extremity at the first point over HP/3, divisible or not (#616)", () => {
    // 9 HP: over 3.
    expect(applyCrippling(3, "hand", 9)).toEqual({ injury: 3, excessLost: 0, crippled: false });
    expect(applyCrippling(4, "hand", 9)).toEqual({ injury: 4, excessLost: 0, crippled: true });
    expect(applyCrippling(5, "foot", 9)).toEqual({ injury: 4, excessLost: 1, crippled: true });
    // 10 HP: over 3.33.
    expect(applyCrippling(3, "hand", 10)).toEqual({ injury: 3, excessLost: 0, crippled: false });
    expect(applyCrippling(4, "hand", 10)).toEqual({ injury: 4, excessLost: 0, crippled: true });
    expect(applyCrippling(8, "foot", 10)).toEqual({ injury: 4, excessLost: 4, crippled: true });
    // 12 HP: over 4.
    expect(applyCrippling(4, "hand", 12)).toEqual({ injury: 4, excessLost: 0, crippled: false });
    expect(applyCrippling(6, "hand", 12)).toEqual({ injury: 5, excessLost: 1, crippled: true });
  });

  it("passes through injury that does not reach the threshold", () => {
    const result = applyCrippling(3, "arm", 12);
    expect(result).toEqual({ injury: 3, excessLost: 0, crippled: false });
  });
});

/**
 * "If you have more than two of a particular limb ... a crippling blow is
 * injury over HP/(number of limbs of that kind)", and of an extremity over
 * HP/(1.5 x number of extremities of that kind) (Campaigns p. 421).
 */
describe("crippling extra limbs (#624)", () => {
  it("cripples one of four arms over HP/4, and one of four feet over HP/6", () => {
    expect(cripplingThreshold("arm", 12, { arms: 4 })).toBe(3);
    expect(cripplingThreshold("hand", 12, { arms: 4 })).toBe(2);
    expect(cripplingThreshold("leg", 12, { legs: 4 })).toBe(3);
    expect(cripplingThreshold("foot", 12, { legs: 4 })).toBe(2);
  });

  it("cripples at the first point over the lower threshold, and loses the rest", () => {
    // Four arms, 12 HP: over 3.
    expect(applyCrippling(3, "arm", 12, { arms: 4 })).toEqual({ injury: 3, excessLost: 0, crippled: false });
    expect(applyCrippling(4, "arm", 12, { arms: 4 })).toEqual({ injury: 4, excessLost: 0, crippled: true });
    expect(applyCrippling(9, "arm", 12, { arms: 4 })).toEqual({ injury: 4, excessLost: 5, crippled: true });
    // Four feet, 12 HP: over 2.
    expect(applyCrippling(2, "foot", 12, { legs: 4 })).toEqual({ injury: 2, excessLost: 0, crippled: false });
    expect(applyCrippling(6, "foot", 12, { legs: 4 })).toEqual({ injury: 3, excessLost: 3, crippled: true });
  });

  it("works where HP does not divide by the count", () => {
    // Three arms, 10 HP: an arm over 3.33, a hand over 10/4.5 = 2.22.
    expect(applyCrippling(3, "arm", 10, { arms: 3 })).toEqual({ injury: 3, excessLost: 0, crippled: false });
    expect(applyCrippling(4, "arm", 10, { arms: 3 })).toEqual({ injury: 4, excessLost: 0, crippled: true });
    expect(applyCrippling(2, "hand", 10, { arms: 3 })).toEqual({ injury: 2, excessLost: 0, crippled: false });
    expect(applyCrippling(5, "hand", 10, { arms: 3 })).toEqual({ injury: 3, excessLost: 2, crippled: true });
  });

  it("reads arms for arms and hands and legs for legs and feet, and never fewer than two", () => {
    expect(cripplingThreshold("arm", 12, { legs: 6 })).toBe(6);
    expect(cripplingThreshold("foot", 12, { arms: 6 })).toBe(4);
    expect(cripplingThreshold("arm", 12, { arms: 1 })).toBe(6);
    expect(cripplingThreshold("hand", 12, { arms: 2 })).toBe(4);
    // The eye and the torso are not limbs.
    expect(cripplingThreshold("eye", 30, { arms: 6, legs: 6 })).toBe(3);
    expect(cripplingThreshold("torso", 12, { arms: 6 })).toBeNull();
  });

  it("is what computeInjury caps a blow at", () => {
    const result = computeInjury({ basicDamage: 6, dr: 0, type: "cr", hitLocation: "leg", maxHp: 12, limbs: { legs: 6 } });
    // Six legs, 12 HP: over 2.
    expect(result.crippled).toBe(true);
    expect(result.injury).toBe(3);
    expect(result.excessLost).toBe(3);
  });
});

describe("the injury pipeline with hit locations", () => {
  it("adds the skull's extra DR before subtracting", () => {
    // DR 2 armor plus the skull's own DR 2 stops 4 points.
    const result = computeInjury({ basicDamage: 5, dr: 2, type: "cr", hitLocation: "skull" });
    expect(result.effectiveDr).toBe(4);
    expect(result.penetrating).toBe(1);
    expect(result.injury).toBe(4); // 1 penetrating x4
  });

  it("applies the armor divisor to the skull's natural DR too", () => {
    const result = computeInjury({
      basicDamage: 10, dr: 4, type: "pi", armorDivisor: 2, hitLocation: "skull",
    });
    expect(result.effectiveDr).toBe(3); // (4 + 2) / 2
  });

  it("caps a limb hit at the crippling threshold and reports the loss", () => {
    const result = computeInjury({
      basicDamage: 20, dr: 0, type: "cut", hitLocation: "arm", maxHp: 10,
    });
    expect(result.woundingModifier).toBe(1.5);
    expect(result.crippled).toBe(true);
    expect(result.injury).toBe(6); // the least over half of 10 HP
    expect(result.excessLost).toBe(24); // 30 rolled down to 6
  });

  it("leaves location-agnostic calls behaving exactly as before", () => {
    const result = computeInjury({ basicDamage: 6, dr: 4, type: "cr" });
    expect(result).toMatchObject({ penetrating: 2, injury: 2, crippled: false, excessLost: 0 });
  });
});

describe("review fixes: tight-beam, toxic DR, fatigue, limb sides", () => {
  it("lets only a tight-beam burn target the eye or vitals", () => {
    // A flamethrower cannot be aimed at an eye; a laser can.
    expect(canTarget("vitals", "burn")).toBe(false);
    expect(canTarget("vitals", "burn", { tightBeam: true })).toBe(true);
    expect(canTarget("eye", "burn")).toBe(false);
    expect(canTarget("eye", "burn", { tightBeam: true })).toBe(true);
  });

  it("gives the vitals bonus only to a tight-beam burn", () => {
    expect(woundingModifierAt("burn", "vitals")).toBe(1);
    expect(woundingModifierAt("burn", "vitals", { tightBeam: true })).toBe(2);
  });

  it("exempts toxic damage from the skull's DR as well as its multiplier", () => {
    expect(locationDrAgainst("skull", "tox")).toBe(0);
    expect(locationDrAgainst("skull", "cr")).toBe(2);

    // A toxic attack must not be armored by the skull it is exempt from.
    const toxic = computeInjury({ basicDamage: 5, dr: 0, type: "tox", hitLocation: "skull" });
    expect(toxic.effectiveDr).toBe(0);
    expect(toxic.injury).toBe(5);
  });

  it("routes fatigue damage to FP and ignores hit location entirely", () => {
    const result = computeInjury({
      basicDamage: 6, dr: 0, type: "fat", hitLocation: "skull", maxHp: 10,
    });
    expect(result.costsFatigue).toBe(true);
    // No x4 skull multiplier, no skull DR, no crippling.
    expect(result.woundingModifier).toBe(1);
    expect(result.effectiveDr).toBe(0);
    expect(result.injury).toBe(6);
    expect(result.crippled).toBe(false);
  });

  it("does not treat ordinary damage as fatigue", () => {
    expect(computeInjury({ basicDamage: 5, dr: 0, type: "cr" }).costsFatigue).toBe(false);
  });

  it("picks a hand or foot side from a 1d roll, 1-3 right and 4-6 left", () => {
    expect(randomHitLocation(15, 2).side).toBe("right");
    expect(randomHitLocation(15, 5).side).toBe("left");
    expect(randomHitLocation(16, 1).side).toBe("right");
    expect(randomHitLocation(16, 6).side).toBe("left");
    // Without a side roll the location is still returned, just unsided.
    expect(randomHitLocation(15).location).toBe("hand");
    expect(randomHitLocation(15).side).toBeUndefined();
  });

  it("keeps the printed leg rows, which are sided in the table itself", () => {
    // 6-7 is the right leg and 13-14 the left; these are not paired rows
    // needing a side roll.
    expect(randomHitLocation(6)).toEqual({ location: "leg", side: "right" });
    expect(randomHitLocation(7)).toEqual({ location: "leg", side: "right" });
    expect(randomHitLocation(13)).toEqual({ location: "leg", side: "left" });
    expect(randomHitLocation(14)).toEqual({ location: "leg", side: "left" });
  });
});
