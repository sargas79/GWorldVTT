import { describe, expect, it } from "vitest";

import {
  BIPOD_READY_MANEUVERS,
  HEARING_A_SHOT,
  MOUNT_READY_MANEUVERS,
  heardUpClose,
  hearingTarget,
  laserSight,
  scopeBonus,
  silencerModifier,
  supportEffect,
} from "../accessories.js";
import {
  accuracyApplies,
  areaDamageFallsOff,
  coneMayStillCatch,
  coneWidth,
  defendsAgainstArea,
  flightPlan,
  guidanceModifiers,
  halvesDamage,
  projectileSpeed,
  steeringDuty,
} from "../guided.js";

describe("bipods and tripods (Campaigns p. 411)", () => {
  it("takes a third off the ST of a weapon on a bipod, for a shooter lying down", () => {
    // "reduce its ST requirement to 2/3 normal (round up)."
    expect(supportEffect({ support: "bipod", minimumSt: 12, prone: true }))
      .toEqual({ minimumSt: 8, braced: true, rooted: false });
    expect(supportEffect({ support: "bipod", minimumSt: 10, prone: true }).minimumSt).toBe(7);
  });

  it("does nothing for a bipod nobody is lying behind", () => {
    expect(supportEffect({ support: "bipod", minimumSt: 12, prone: false }))
      .toEqual({ minimumSt: 12, braced: false, rooted: false });
  });

  it("lifts the ST requirement on a tripod and roots the gunner", () => {
    // "He may ignore the weapon's ST requirement while it is on its mount"
    // and "cannot move or step on any turn he fires."
    expect(supportEffect({ support: "tripod", minimumSt: 20, prone: false }))
      .toEqual({ minimumSt: null, braced: true, rooted: true });
  });

  it("counts the Ready maneuvers each takes", () => {
    expect(BIPOD_READY_MANEUVERS).toBe(1);
    expect(MOUNT_READY_MANEUVERS).toBe(3);
  });
});

describe("scopes (p. 411)", () => {
  it("gives its full bonus once you have aimed long enough, either kind", () => {
    expect(scopeBonus({ bonus: 4, secondsAimed: 4 })).toBe(4);
    expect(scopeBonus({ bonus: 4, secondsAimed: 6, fixed: true })).toBe(4);
  });

  it("is the whole difference when you have not", () => {
    // Variable loses a point a second; fixed gives nothing at all.
    expect(scopeBonus({ bonus: 4, secondsAimed: 2 })).toBe(2);
    expect(scopeBonus({ bonus: 4, secondsAimed: 2, fixed: true })).toBe(0);
    expect(scopeBonus({ bonus: 4, secondsAimed: 0 })).toBe(0);
  });
});

describe("laser sights (p. 411)", () => {
  it("is worth one to the shooter and one to the target who spots it", () => {
    expect(laserSight({ rangeYards: 50, halfDamageRange: 100, targetSeesDot: true }))
      .toEqual({ toHit: 1, targetDodge: 1 });
    expect(laserSight({ rangeYards: 50, halfDamageRange: 100 }))
      .toEqual({ toHit: 1, targetDodge: 0 });
  });

  it("stops helping anybody past the range the dot carries", () => {
    // "If no maximum range is given, assume the sight's range is matched to
    // the 1/2D range of the weapon."
    expect(laserSight({ rangeYards: 150, halfDamageRange: 100, targetSeesDot: true }))
      .toEqual({ toHit: 0, targetDodge: 0 });
    expect(laserSight({ rangeYards: 60, sightRange: 50, halfDamageRange: 200 }).toHit).toBe(0);
  });
});

describe("silencers (p. 411)", () => {
  it("rolls Hearing+5 from somewhere else, worse for a silenced gun", () => {
    expect(HEARING_A_SHOT).toBe(5);
    expect(hearingTarget({ hearing: 10, silencer: "none" })).toBe(15);
    expect(silencerModifier("typical")).toBe(-4);
    expect(silencerModifier("best")).toBe(-6);
    expect(hearingTarget({ hearing: 10, silencer: "best" })).toBe(9);
    // "up to +4 for a high-powered weapon or quiet environment, or down to -4."
    expect(hearingTarget({ hearing: 10, silencer: "typical", loudness: 4 })).toBe(15);
  });

  it("is heard for certain up close, and localized only by an IQ roll", () => {
    // "Anyone who is... close enough for you to attack with it automatically
    // hears the shot - even with a silencer."
    expect(heardUpClose({ silencer: "best", inPlainSight: false }))
      .toEqual({ hears: true, locates: false, rollsAgainst: "iq" });
    expect(heardUpClose({ silencer: "best", inPlainSight: true }).locates).toBe(true);
    expect(heardUpClose({ silencer: "none", inPlainSight: false }).locates).toBe(true);
  });
});

describe("guided and homing weapons (p. 412)", () => {
  it("ignores range for both, and the firer's state for a homing one only", () => {
    expect(guidanceModifiers("guided"))
      .toEqual({ range: false, firersCondition: true, firersSenses: true, sizeAndSpeed: true });
    expect(guidanceModifiers("homing"))
      .toEqual({ range: false, firersCondition: false, firersSenses: false, sizeAndSpeed: true });
    expect(guidanceModifiers("none").range).toBe(true);
  });

  it("reads the 1/2D column as a speed rather than as a halving", () => {
    // "do not halve damage. Instead, read this as the attack's speed."
    expect(halvesDamage("guided")).toBe(false);
    expect(halvesDamage("homing")).toBe(false);
    expect(halvesDamage("none")).toBe(true);
    expect(projectileSpeed(400)).toBe(400);
  });

  it("reaches anything inside its speed on the turn it is fired", () => {
    expect(flightPlan({ rangeYards: 300, speed: 400, maxRange: 4000 }))
      .toMatchObject({ hitsThisTurn: true, falls: false });
  });

  it("takes turns to reach anything further, and the roll waits for it", () => {
    const plan = flightPlan({ rangeYards: 1200, speed: 400, maxRange: 4000 });
    expect(plan).toMatchObject({ hitsThisTurn: false, seconds: 3, falls: false });
  });

  it("can be outrun, which is the point of the reach", () => {
    // "If it still has not hit, it will crash, self-destruct, etc."
    expect(flightPlan({ rangeYards: 5000, speed: 400, maxRange: 4000 }).falls).toBe(true);
  });

  it("makes the firer of a guided weapon work, and the firer of a homing one not", () => {
    expect(steeringDuty("guided"))
      .toEqual({ concentrates: true, needsSight: true, attacksOnArrival: true });
    expect(steeringDuty("homing"))
      .toEqual({ concentrates: false, needsSight: false, attacksOnArrival: false });
  });

  it("counts a long flight as aimed without an Aim maneuver", () => {
    // "If the projectile takes multiple seconds to reach its target, the
    // attack is automatically aimed and gets its Acc bonus."
    expect(accuracyApplies({ guidance: "homing", aimed: false, secondsInFlight: 3 })).toBe(true);
    expect(accuracyApplies({ guidance: "homing", aimed: false, secondsInFlight: 1 })).toBe(false);
    expect(accuracyApplies({ guidance: "guided", aimed: true, secondsInFlight: 1 })).toBe(true);
    // An ordinary shell gets nothing for being slow.
    expect(accuracyApplies({ guidance: "none", aimed: false, secondsInFlight: 5 })).toBe(false);
  });
});

describe("area and cone attacks (p. 413)", () => {
  it("cannot be defended against, and does not fall off", () => {
    expect(defendsAgainstArea()).toBe(false);
    // Which is what tells it apart from an explosion (p. 414).
    expect(areaDamageFallsOff()).toBe(false);
  });

  it("works the book's own cone", () => {
    // "a cone with a maximum range of 100 yards and a maximum width of 5 yards
    // would spread by one yard per 20 yards of range; out at 60 yards, it
    // would be three yards wide."
    expect(coneWidth({ rangeYards: 60, maxRange: 100, maxWidth: 5 })).toBe(3);
    expect(coneWidth({ rangeYards: 100, maxRange: 100, maxWidth: 5 })).toBe(5);
  });

  it("is a yard wide where it leaves the mouth", () => {
    expect(coneWidth({ rangeYards: 0, maxRange: 100, maxWidth: 5 })).toBe(1);
    expect(coneWidth({ rangeYards: 10, maxRange: 100, maxWidth: 5 })).toBe(1);
  });

  it("spreads a yard a yard when the table says nothing", () => {
    expect(coneWidth({ rangeYards: 7, maxRange: 30 })).toBe(7);
    expect(coneMayStillCatch()).toBe(true);
  });
});

describe("an aiming roll before a guided attack (since API 1.63.0)", () => {
  it("reads the aiming skill and the projectile's own skill off the mode", async () => {
    const { aimedThenGuided } = await import("../guided.js");
    expect(aimedThenGuided({ aimingSkill: "Gunner (Rockets)", guidedSkillLevel: 13 })).toEqual({ aimingSkill: "Gunner (Rockets)", skillLevel: 13 });
    expect(aimedThenGuided({ aimingSkill: "Gunner (Rockets)" })).toEqual({ aimingSkill: "Gunner (Rockets)", skillLevel: null });
    expect(aimedThenGuided({ aimingSkill: "  " })).toBeNull();
    expect(aimedThenGuided(null)).toBeNull();
  });
});
