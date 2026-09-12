import { describe, expect, it } from "vitest";

import { computeInjury } from "../damage.js";
import {
  diffuseInjuryCap,
  hasInjuryTolerance,
  injuryToleranceFrom,
  noInjuryTolerance,
  toleratedLocation,
  toleratedWoundingModifier,
} from "../injury-tolerance.js";

/** Injury Tolerance (GURPS Basic Set: Characters pp. 60-61). */
describe("reading the kind", () => {
  it("reads it from the trait's name or from a modifier", () => {
    expect(injuryToleranceFrom(["Injury Tolerance (Unliving)"]).unliving).toBe(true);
    expect(injuryToleranceFrom(["Injury Tolerance", "No Blood"]).noBlood).toBe(true);
    expect(hasInjuryTolerance(noInjuryTolerance())).toBe(false);
  });

  /** A solid or a diffuse body has no vitals, brain, eyes or blood to speak of. */
  it("gives a Homogenous or Diffuse body the four absences", () => {
    const solid = injuryToleranceFrom(["Homogenous"]);
    expect(solid).toMatchObject({ noBlood: true, noBrain: true, noEyes: true, noVitals: true });
    expect(injuryToleranceFrom(["Diffuse"]).noVitals).toBe(true);
    expect(injuryToleranceFrom(["Unliving"]).noVitals).toBe(false);
  });
});

describe("toleratedLocation", () => {
  it("moves a blow to the part that is actually there", () => {
    expect(toleratedLocation("skull", injuryToleranceFrom(["No Brain"]))).toBe("face");
    expect(toleratedLocation("eye", injuryToleranceFrom(["No Eyes"]))).toBe("skull");
    expect(toleratedLocation("eye", injuryToleranceFrom(["No Head"]))).toBe("torso");
    expect(toleratedLocation("neck", injuryToleranceFrom(["No Neck"]))).toBe("torso");
    expect(toleratedLocation("vitals", injuryToleranceFrom(["No Vitals"]))).toBe("torso");
    expect(toleratedLocation("arm", injuryToleranceFrom(["Homogenous"]))).toBe("arm");
  });

  it("takes a blind, brainless eye to the face rather than the skull", () => {
    expect(toleratedLocation("eye", injuryToleranceFrom(["No Eyes", "No Brain"]))).toBe("face");
  });
});

describe("wounding against a body that is not flesh", () => {
  it("cuts piercing and impaling down against Unliving and Homogenous", () => {
    const golem = injuryToleranceFrom(["Unliving"]);
    expect(toleratedWoundingModifier("imp", golem)).toBe(1);
    expect(toleratedWoundingModifier("pi", golem)).toBeCloseTo(1 / 3);
    const rock = injuryToleranceFrom(["Homogenous"]);
    expect(toleratedWoundingModifier("imp", rock)).toBe(0.5);
    expect(toleratedWoundingModifier("pi-", rock)).toBe(0.1);
  });

  it("leaves cutting and crushing alone", () => {
    expect(toleratedWoundingModifier("cut", injuryToleranceFrom(["Homogenous"]))).toBeNull();
    expect(toleratedWoundingModifier("cr", injuryToleranceFrom(["Unliving"]))).toBeNull();
  });

  it("caps a Diffuse body's injury at a point or two", () => {
    const swarm = injuryToleranceFrom(["Diffuse"]);
    expect(diffuseInjuryCap("imp", swarm)).toBe(1);
    expect(diffuseInjuryCap("pi+", swarm)).toBe(1);
    expect(diffuseInjuryCap("cut", swarm)).toBe(2);
    expect(diffuseInjuryCap("cut", noInjuryTolerance())).toBeNull();
  });
});

describe("computeInjury with a tolerance", () => {
  it("prices an impaling blow to a golem's vitals at x1, on the torso", () => {
    const golem = injuryToleranceFrom(["Unliving", "No Vitals"]);
    const result = computeInjury({ basicDamage: 10, dr: 0, type: "imp", hitLocation: "vitals", tolerance: golem });
    expect(result.woundingModifier).toBe(1);
    expect(result.injury).toBe(10);
  });

  it("gives a rock's skull no x4 and no brain", () => {
    const rock = injuryToleranceFrom(["Homogenous"]);
    const result = computeInjury({ basicDamage: 10, dr: 0, type: "cr", hitLocation: "skull", maxHp: 20, tolerance: rock });
    expect(result.woundingModifier).toBe(1);
    expect(result.injury).toBe(10);
  });

  it("stops a swarm at two points however hard it is hit", () => {
    const swarm = injuryToleranceFrom(["Diffuse"]);
    expect(computeInjury({ basicDamage: 30, dr: 0, type: "cut", tolerance: swarm }).injury).toBe(2);
    expect(computeInjury({ basicDamage: 30, dr: 0, type: "imp", tolerance: swarm }).injury).toBe(1);
    expect(computeInjury({ basicDamage: 1, dr: 5, type: "imp", tolerance: swarm }).injury).toBe(0);
  });

  it("changes nothing for a body of flesh", () => {
    const flesh = computeInjury({ basicDamage: 10, dr: 0, type: "imp", hitLocation: "vitals", tolerance: noInjuryTolerance() });
    expect(flesh.woundingModifier).toBe(3);
  });
});
