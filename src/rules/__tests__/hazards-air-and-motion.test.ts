import { describe, expect, it } from "vitest";

import {
  ACID_TREATMENT_SKILLS,
  ACID_VIAL_COST,
  SWALLOWED_MINUTES_PER_POINT,
  acidHarm,
  eyeOutcome,
  eyeRisk,
} from "../acid.js";
import {
  ALTITUDE_SICKNESS_BONUS,
  EXPLOSIVE_DECOMPRESSION,
  airDensity,
  airEffect,
  altitudeOutcome,
  atmosphereHarm,
  corrosiveToll,
  vacuumBreathSeconds,
} from "../atmosphere.js";
import {
  FEET_PER_ATMOSPHERE,
  RECOMPRESSION_BONUS,
  bendsOutcome,
  bendsThreshold,
  crushingInjury,
  crushingTarget,
  crushingThreshold,
  pressureAtDepth,
  risksBends,
  safeMinutesAt,
} from "../pressure.js";
import {
  ACCELERATION_ROLL_AT,
  SEASICKNESS_BONUS,
  accelerationHarm,
  accelerationNeedsRoll,
  accelerationTarget,
  canAdaptToFreeFall,
  seasicknessOutcome,
  seasicknessTarget,
  spaceSicknessTarget,
  thrownVelocity,
} from "../motion.js";

describe("acid (Campaigns p. 428)", () => {
  it("hurts at three very different rates", () => {
    // "1d-3 points of corrosion damage" splashed.
    expect(acidHarm("splashed")).toMatchObject({ damage: { dice: 1, adds: -3 }, everySeconds: 0 });
    // "1d-1 corrosion damage per second" immersed.
    expect(acidHarm("immersed")).toMatchObject({ damage: { dice: 1, adds: -1 }, everySeconds: 1 });
    // "3d damage at the rate of 1 HP per 15 minutes" swallowed.
    expect(acidHarm("swallowed")).toMatchObject({ damage: { dice: 3, adds: 0 }, overTime: true });
    expect(SWALLOWED_MINUTES_PER_POINT).toBe(15);
  });

  it("risks the eyes only where it lands on a face", () => {
    expect(eyeRisk("body")).toEqual({ rolls: false, automatic: false });
    expect(eyeRisk("face")).toEqual({ rolls: true, automatic: false });
    // "or on a direct hit to the eyes, the damage is to his eyes."
    expect(eyeRisk("eyes")).toEqual({ rolls: false, automatic: true });
    expect(acidHarm("swallowed").risksEyes).toBe(false);
  });

  it("blinds for certain on a critical failure", () => {
    expect(eyeOutcome({ success: true, criticalFailure: false })).toBe("unharmed");
    expect(eyeOutcome({ success: false, criticalFailure: false })).toBe("damaged");
    expect(eyeOutcome({ success: false, criticalFailure: true })).toBe("blinded");
  });

  it("can be bought for ten dollars and stopped by two skills", () => {
    expect(ACID_VIAL_COST).toBe(10);
    expect(ACID_TREATMENT_SKILLS).toEqual(["Physician", "Poisons"]);
  });
});

describe("atmospheric pressure (p. 429)", () => {
  it("sorts the air into the book's bands", () => {
    expect(airDensity(0.005)).toBe("trace");
    expect(airDensity(0.01)).toBe("trace");
    expect(airDensity(0.4)).toBe("veryThin");
    expect(airDensity(0.5)).toBe("veryThin");
    expect(airDensity(0.7)).toBe("thin");
    expect(airDensity(0.8)).toBe("thin");
    expect(airDensity(1)).toBe("standard");
  });

  it("treats the thinnest air as vacuum and the next as unbreathable", () => {
    expect(airEffect("trace").vacuum).toBe(true);
    expect(airEffect("veryThin")).toMatchObject({ vacuum: false, suffocates: true, vision: -2 });
  });

  it("makes thin air tiring rather than deadly", () => {
    // "Increase all fatigue costs for exertion by 1 FP. Vision rolls are at -1."
    expect(airEffect("thin")).toMatchObject({
      suffocates: false, vision: -1, extraFatigue: 1, altitudeSickness: true,
    });
    expect(airEffect("standard")).toMatchObject({ vision: 0, extraFatigue: 0 });
  });

  it("rolls daily at plus four, and lets a critical success end the rolling", () => {
    expect(ALTITUDE_SICKNESS_BONUS).toBe(4);
    expect(altitudeOutcome({ success: true, criticalSuccess: true, criticalFailure: false })).toBe("acclimatized");
    expect(altitudeOutcome({ success: true, criticalSuccess: false, criticalFailure: false })).toBe("unaffected");
    expect(altitudeOutcome({ success: false, criticalSuccess: false, criticalFailure: false })).toBe("sickened");
    expect(altitudeOutcome({ success: false, criticalSuccess: false, criticalFailure: true })).toBe("coma");
  });
});

describe("hazardous atmospheres (p. 429)", () => {
  it("rolls once a minute against a corrosive trace", () => {
    expect(atmosphereHarm({ hazard: "corrosive", strength: "trace" })).toMatchObject({
      everySeconds: 60, modifier: -4, damageType: "cor", suffocates: false, unresistable: false,
    });
  });

  it("rolls daily against pollution and every minute against a lethal gas", () => {
    expect(atmosphereHarm({ hazard: "toxic", strength: "trace" })).toMatchObject({
      everySeconds: 86400, modifier: 0,
    });
    expect(atmosphereHarm({ hazard: "toxic", strength: "lethal" })).toMatchObject({
      everySeconds: 60, modifier: -6,
    });
  });

  it("allows no roll at all when the air is mostly the problem, and suffocates besides", () => {
    const toxic = atmosphereHarm({ hazard: "toxic", strength: "mostly" });
    // "at least 1d toxic damage per 15 seconds (no resistance possible)".
    expect(toxic).toMatchObject({
      everySeconds: 15, damage: { dice: 1, adds: 0 }, unresistable: true, suffocates: true,
    });
    // "effects comparable to immersion in acid", which is 1d-1 a second.
    expect(atmosphereHarm({ hazard: "corrosive", strength: "mostly" })).toMatchObject({
      everySeconds: 1, damage: { dice: 1, adds: -1 }, unresistable: true, suffocates: true,
    });
  });

  it("coughs at a third of the hit points and blinds at two thirds", () => {
    expect(corrosiveToll({ hpLost: 3, maxHp: 12 })).toEqual({ coughing: false, blinded: false });
    expect(corrosiveToll({ hpLost: 4, maxHp: 12 })).toEqual({ coughing: true, blinded: false });
    expect(corrosiveToll({ hpLost: 8, maxHp: 12 })).toEqual({ coughing: true, blinded: true });
  });
});

describe("vacuum (p. 437)", () => {
  it("buys half the held-breath time, and only with the mouth open", () => {
    expect(vacuumBreathSeconds({ heldBreathSeconds: 40, mouthOpen: true })).toBe(20);
    // "You can't hold your breath in vacuum - and you may rupture your lungs."
    expect(vacuumBreathSeconds({ heldBreathSeconds: 40, mouthOpen: false })).toBe(0);
  });

  it("costs a die and three rolls in a blowout", () => {
    expect(EXPLOSIVE_DECOMPRESSION).toEqual({
      injury: { dice: 1, adds: 0 },
      bendsModifier: 0,
      eyeModifier: 2,
      hearingModifier: -1,
    });
  });
});

describe("pressure (p. 435)", () => {
  it("counts an atmosphere every thirty-three feet, on top of the air", () => {
    expect(FEET_PER_ATMOSPHERE).toBe(33);
    expect(pressureAtDepth(0)).toBe(1);
    expect(pressureAtDepth(33)).toBe(2);
    expect(pressureAtDepth(99)).toBe(4);
  });

  it("moves both thresholds with Pressure Support, and lifts them at three", () => {
    expect(crushingThreshold(0)).toBe(10);
    expect(crushingThreshold(2)).toBe(100);
    expect(crushingThreshold(3)).toBe(null);
    expect(bendsThreshold(0)).toBe(2);
    expect(bendsThreshold(1)).toBe(10);
    expect(bendsThreshold(2)).toBe(null);
  });

  it("rolls at plus three, less one per ten atmospheres", () => {
    expect(crushingTarget({ health: 11, multiple: 10 })).toBe(13);
    expect(crushingTarget({ health: 11, multiple: 50 })).toBe(9);
    // Pressure Support 2 reads that as one per hundred instead.
    expect(crushingTarget({ health: 11, multiple: 50, support: 2 })).toBe(14);
  });

  it("hurts by the margin, and by the margin times SM for something large", () => {
    expect(crushingInjury({ margin: -4 })).toBe(4);
    expect(crushingInjury({ margin: -4, sizeModifier: 1 })).toBe(4);
    expect(crushingInjury({ margin: -4, sizeModifier: 3 })).toBe(12);
  });

  it("gives a diver all day at two atmospheres and no time at all past five and a half", () => {
    expect(safeMinutesAt(2)).toBe(Infinity);
    expect(safeMinutesAt(2.5)).toBe(80);
    expect(safeMinutesAt(4)).toBe(22);
    expect(safeMinutesAt(5.5)).toBe(0);
  });

  it("risks the bends only past the threshold and past the safe time", () => {
    expect(risksBends({ atmospheres: 2, minutes: 600 })).toBe(false);
    expect(risksBends({ atmospheres: 2.5, minutes: 40 })).toBe(false);
    expect(risksBends({ atmospheres: 2.5, minutes: 120 })).toBe(true);
    // Pressure Support 1 raises the bar to ten atmospheres.
    expect(risksBends({ atmospheres: 4, minutes: 120, support: 1 })).toBe(false);
  });

  it("hurts even on a success, which is the whole shape of the roll", () => {
    expect(bendsOutcome({ success: true, criticalSuccess: true, criticalFailure: false })).toBe("clear");
    expect(bendsOutcome({ success: true, criticalSuccess: false, criticalFailure: false })).toBe("agony");
    expect(bendsOutcome({ success: false, criticalSuccess: false, criticalFailure: false })).toBe("collapse");
    expect(bendsOutcome({ success: false, criticalSuccess: false, criticalFailure: true })).toBe("death");
    expect(RECOMPRESSION_BONUS).toBe(4);
  });
});

describe("space sickness and acceleration (p. 434)", () => {
  it("rolls the better of health and Free Fall, four worse for the disadvantage", () => {
    expect(spaceSicknessTarget({ health: 11, freeFall: 13 })).toBe(13);
    expect(spaceSicknessTarget({ health: 11 })).toBe(11);
    expect(spaceSicknessTarget({ health: 11, freeFall: 13, prone: true })).toBe(9);
  });

  it("leaves somebody with Space Sickness unable to ever get used to it", () => {
    expect(canAdaptToFreeFall(false)).toBe(true);
    expect(canAdaptToFreeFall(true)).toBe(false);
  });

  it("asks for a roll from two and a half gravities up", () => {
    expect(ACCELERATION_ROLL_AT).toBe(2.5);
    expect(accelerationNeedsRoll({ gForce: 2 })).toBe(false);
    expect(accelerationNeedsRoll({ gForce: 2.5 })).toBe(true);
    // "Treat a home gravity under 0.1G as 0.1G for this purpose."
    expect(accelerationNeedsRoll({ gForce: 0.25, homeGravity: 0.01 })).toBe(true);
  });

  it("takes two off per doubling, matching the book's own examples", () => {
    // "-2 at 5x home gravity, -4 at 10x, and so on."
    expect(accelerationTarget({ health: 12, gForce: 2.5 })).toBe(12);
    expect(accelerationTarget({ health: 12, gForce: 5 })).toBe(10);
    expect(accelerationTarget({ health: 12, gForce: 10 })).toBe(8);
    expect(accelerationTarget({ health: 12, gForce: 20 })).toBe(6);
  });

  it("gives two for being strapped down and takes two for being upside down", () => {
    expect(accelerationTarget({ health: 12, gForce: 5, braced: true })).toBe(12);
    expect(accelerationTarget({ health: 12, gForce: 5, inverted: true })).toBe(8);
  });

  it("costs the margin in fatigue, and blacks out on a critical failure", () => {
    expect(accelerationHarm({ margin: -3, criticalFailure: false }))
      .toEqual({ fatigue: 3, blackoutSeconds: 0 });
    expect(accelerationHarm({ margin: -3, criticalFailure: true }))
      .toEqual({ fatigue: 3, blackoutSeconds: 30 });
  });

  it("throws you at ten yards a second per gravity", () => {
    expect(thrownVelocity(4)).toBe(40);
  });
});

describe("seasickness (p. 436)", () => {
  it("rolls five better without the disadvantage", () => {
    expect(SEASICKNESS_BONUS).toBe(5);
    expect(seasicknessTarget({ health: 10 })).toBe(15);
    expect(seasicknessTarget({ health: 10, motionSickness: true })).toBe(10);
  });

  it("spares the sailor for good on a wide success, and only for today on a narrow one", () => {
    expect(seasicknessOutcome({ success: true, margin: 6, criticalSuccess: false })).toBe("immune");
    expect(seasicknessOutcome({ success: true, margin: 0, criticalSuccess: true })).toBe("immune");
    expect(seasicknessOutcome({ success: true, margin: 2, criticalSuccess: false })).toBe("unaffected");
    expect(seasicknessOutcome({ success: false, margin: -2, criticalSuccess: false })).toBe("nauseated");
  });
});
