import { describe, expect, it } from "vitest";

import {
  AFFLICTIONS,
  AGONY_FP_PER_MINUTE,
  COMA_CHECK_HOURS,
  INCAPACITATED_DEFENSE,
  TORTURE_BONUS,
  afflictionEffect,
  afflictionsOf,
  agonyCost,
  canHaveHeartAttack,
  hallucinationOutcome,
  heartAttackMinutes,
  heartAttackSurvival,
  nauseaTarget,
  painAffliction,
  painPenalty,
  vomitingSeconds,
} from "../afflictions.js";

describe("the irritating conditions (Campaigns p. 428)", () => {
  it("costs a coughing man his hands and his hiding place", () => {
    const coughing = afflictionEffect("coughing");
    expect(coughing).toMatchObject({ dx: -3, iq: -1, severity: "irritating", helpless: false });
    expect(coughing.forbids).toEqual(["Stealth"]);
  });

  it("hits drink harder on the will than on the hands", () => {
    expect(afflictionEffect("tipsy")).toMatchObject({ dx: -1, iq: -1, selfControl: -2 });
    expect(afflictionEffect("drunk")).toMatchObject({ dx: -2, iq: -2, selfControl: -4 });
  });

  it("puts euphoria on everything and nausea on the defenses too", () => {
    expect(afflictionEffect("euphoria")).toMatchObject({ dx: -3, iq: -3, selfControl: -3 });
    // "-2 to all attribute and skill rolls, and -1 to active defenses."
    expect(afflictionEffect("nauseated")).toMatchObject({ dx: -2, iq: -2, defense: -1 });
  });

  it("leaves all of them able to act", () => {
    for (const key of afflictionsOf("irritating")) {
      expect(afflictionEffect(key).helpless).toBe(false);
    }
  });
});

describe("pain (p. 428)", () => {
  it("runs two, four and six", () => {
    expect(painPenalty("moderate")).toBe(-2);
    expect(painPenalty("severe")).toBe(-4);
    expect(painPenalty("terrible")).toBe(-6);
  });

  it("is halved by a high threshold and doubled by a low one", () => {
    expect(painPenalty("moderate", "high")).toBe(-1);
    expect(painPenalty("terrible", "high")).toBe(-3);
    expect(painPenalty("moderate", "low")).toBe(-4);
    expect(painPenalty("terrible", "low")).toBe(-12);
  });

  it("names the condition each grade inflicts", () => {
    expect(painAffliction("severe")).toBe("severePain");
    expect(afflictionEffect(painAffliction("terrible")).dx).toBe(-6);
  });
});

describe("the incapacitating conditions (pp. 428-429)", () => {
  it("stops them acting and takes four off every defense", () => {
    expect(INCAPACITATED_DEFENSE).toBe(-4);
    for (const key of afflictionsOf("incapacitating")) {
      expect(afflictionEffect(key).defense).toBe(-4);
    }
  });

  it("leaves the two that can still try to act able to try", () => {
    // "You can try to act, but you must roll vs. Will before each success roll."
    expect(afflictionEffect("hallucinating").helpless).toBe(false);
    // "You can try to act, but you will be at -5 to DX, IQ, and Per."
    expect(afflictionEffect("retching")).toMatchObject({ helpless: false, dx: -5, iq: -5 });
  });

  it("keeps a dazed man on his feet and puts a paralysed one down", () => {
    // "You are conscious - if you are standing, you remain upright."
    expect(afflictionEffect("daze").fallsDown).toBe(false);
    expect(afflictionEffect("paralysis").fallsDown).toBe(true);
    expect(afflictionEffect("seizure").fallsDown).toBe(true);
  });
});

describe("agony and ecstasy (pp. 428-429)", () => {
  it("costs a point of fatigue a minute, and every part minute", () => {
    expect(AGONY_FP_PER_MINUTE).toBe(1);
    expect(agonyCost({ minutes: 3 }).fatigue).toBe(3);
    // "1 FP per minute or fraction thereof."
    expect(agonyCost({ minutes: 0.2 }).fatigue).toBe(1);
  });

  it("doubles both the fatigue and the torturer's bonus for a low threshold", () => {
    expect(TORTURE_BONUS).toBe(3);
    expect(agonyCost({ minutes: 2, threshold: "low" })).toMatchObject({ fatigue: 4, torture: 6 });
  });

  it("lets a high threshold act, at three off", () => {
    expect(agonyCost({ minutes: 1, threshold: "high" }).functionsAt).toBe(-3);
    expect(agonyCost({ minutes: 1 }).functionsAt).toBe(null);
  });

  it("is deaf to either threshold when it is ecstasy", () => {
    const low = agonyCost({ minutes: 2, threshold: "low", ecstasy: true });
    expect(low).toMatchObject({ fatigue: 2, torture: 3, functionsAt: null });
  });
});

describe("nausea (p. 428)", () => {
  it("rolls against HT, worse after a rich meal and better on a remedy", () => {
    expect(nauseaTarget({ health: 11 })).toBe(11);
    expect(nauseaTarget({ health: 11, richMeal: true })).toBe(9);
    expect(nauseaTarget({ health: 11, remedy: true })).toBe(13);
  });

  it("vomits for twenty-five seconds less your health", () => {
    expect(vomitingSeconds(10)).toBe(15);
    expect(vomitingSeconds(20)).toBe(5);
    // A very tough constitution does not vomit for a negative time.
    expect(vomitingSeconds(30)).toBe(0);
  });
});

describe("hallucinating (p. 429)", () => {
  it("costs two for a moment and five for a minute", () => {
    expect(hallucinationOutcome({ success: true, criticalFailure: false }))
      .toEqual({ penalty: -2, duration: "2d seconds", freakOut: false });
    expect(hallucinationOutcome({ success: false, criticalFailure: false }))
      .toEqual({ penalty: -5, duration: "1d minutes", freakOut: false });
  });

  it("hands a critical failure to the GM", () => {
    const out = hallucinationOutcome({ success: false, criticalFailure: true });
    expect(out).toMatchObject({ freakOut: true, duration: "3d minutes" });
  });
});

describe("the two that kill (p. 429)", () => {
  it("checks a coma twice a day", () => {
    expect(COMA_CHECK_HOURS).toBe(12);
  });

  it("gives a heart attack a third of the victim's health in minutes", () => {
    expect(heartAttackMinutes(12)).toBe(4);
    expect(heartAttackMinutes(10)).toBeCloseTo(3.33, 1);
  });

  it("leaves a survivor no better off than they were", () => {
    // "0 HP or your current HP, whichever is worse."
    expect(heartAttackSurvival(8)).toBe(0);
    expect(heartAttackSurvival(-4)).toBe(-4);
  });

  it("spares a body with no heart to stop", () => {
    expect(canHaveHeartAttack({})).toBe(true);
    expect(canHaveHeartAttack({ homogenous: true })).toBe(false);
    expect(canHaveHeartAttack({ diffuse: true })).toBe(false);
    expect(canHaveHeartAttack({ noVitals: true })).toBe(false);
  });
});

describe("the table as a whole", () => {
  it("carries every condition the book names, once", () => {
    expect(new Set(AFFLICTIONS).size).toBe(AFFLICTIONS.length);
    expect(AFFLICTIONS.length).toBe(20);
  });

  it("sorts into the book's three bands", () => {
    expect(afflictionsOf("irritating")).toHaveLength(9);
    expect(afflictionsOf("incapacitating")).toHaveLength(9);
    expect(afflictionsOf("mortal")).toEqual(["coma", "heartAttack"]);
  });
});

/**
 * The book writes a condition's cost as "-3 to all DX, IQ, skill, and
 * self-control rolls": one penalty listed across the kinds of roll it reaches,
 * not one penalty per kind. A skill hangs off DX or IQ, so it is already
 * covered, and carrying a separate skill figure would apply it twice.
 */
describe("a penalty is one penalty, however many kinds of roll it names", () => {
  it("carries no figure a skill roll would add on top of its attribute", () => {
    for (const key of AFFLICTIONS) {
      expect(afflictionEffect(key)).not.toHaveProperty("skill");
      expect(afflictionEffect(key)).not.toHaveProperty("per");
    }
  });
});
