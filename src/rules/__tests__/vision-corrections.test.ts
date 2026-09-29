import { describe, expect, it } from "vitest";
import {
  AQUATIC_FORAGING, arcticTravelFor, combatVision, concealedAttackDefense, concealedShotDefense, concealedVision, exposedLocations, foragingModifier,
  frostbiteDamage, horizonMiles, horizonMilesForHeight, illuminationPenalty, modifierRange, plainSightBonus,
  pointSourcePenalty, signalRange, signalVisionBonus, trackingModifier, travelMultiplier,
} from "../vision-corrections.js";

describe("terrain types redux (p. 573)", () => {
  it("gives the foraging ranges and averages", () => {
    expect(modifierRange({ dice: 1, add: -7 })).toEqual({ min: -6, max: -1 });
    expect(modifierRange({ dice: 2, add: -7 })).toEqual({ min: -5, max: 5 });
    expect(foragingModifier("desert")).toBe(-4);
    expect(foragingModifier("woodlands")).toBe(0);
    expect(foragingModifier("mountain", { roll: 4 })).toBe(-3);
    expect(foragingModifier("mountain", { exceptional: "desolate" })).toBe(-6);
    expect(foragingModifier("island", { exceptional: "rich" })).toBe(5);
  });

  it("gives Tracking with the wind and water footnote", () => {
    expect(trackingModifier("swampland")).toBe(-4);
    expect(trackingModifier("arctic")).toBe(-2);
    expect(trackingModifier("arctic", { loose: true })).toBe(0);
    expect(trackingModifier("desert", { loose: true, windy: true })).toBe(-4);
    expect(trackingModifier("jungle")).toBe(0);
  });

  it("gives travel multipliers, with skis and skates", () => {
    expect(travelMultiplier("plains")).toBe(1);
    expect(travelMultiplier("plains", "max")).toBe(1.25);
    expect(travelMultiplier("jungle")).toBe(0.2);
    expect(arcticTravelFor("walking", "loose")).toBe(0.2);
    expect(arcticTravelFor("skiing", "loose")).toBe(1);
    expect(arcticTravelFor("skating", "ice")).toBe(1.25);
    expect(arcticTravelFor("walking", "average")).toBe(0.5);
  });

  it("gives aquatic foraging", () => {
    expect(modifierRange(AQUATIC_FORAGING.reef)).toEqual({ min: -4, max: 6 });
    expect(modifierRange(AQUATIC_FORAGING.openOcean)).toEqual({ min: -6, max: 4 });
  });
});

describe("illumination levels (p. 574)", () => {
  it("names the levels", () => {
    expect(illuminationPenalty({ level: "fullMoon" })).toBe(-4);
    expect(illuminationPenalty({ level: "totalDarkness" })).toBe(-10);
    expect(illuminationPenalty({ level: "daylight" })).toBe(0);
  });

  it("adds cloud, polar, flicker and adaptation, never past -10", () => {
    expect(illuminationPenalty({ level: "fullMoon", heavyCloud: true })).toBe(-5);
    expect(illuminationPenalty({ level: "fullMoon", heavyCloud: true, polar: true })).toBe(-6);
    expect(illuminationPenalty({ level: "torch", flicker: 2 })).toBe(-3);
    expect(illuminationPenalty({ level: "quarterMoon", unadapted: true })).toBe(-8);
    expect(illuminationPenalty({ level: "overcastMoonless", flicker: 3, unadapted: true })).toBe(-10);
  });

  it("falls off a point source with distance", () => {
    // The book's candle: -3 at 1 yard, -4 at 2, -5 out to 5, -6 out to 10.
    expect(pointSourcePenalty(-3, 1)).toBe(-3);
    expect(pointSourcePenalty(-3, 2)).toBe(-4);
    expect(pointSourcePenalty(-3, 5)).toBe(-5);
    expect(pointSourcePenalty(-3, 10)).toBe(-6);
    // Never darker than the ambient.
    expect(pointSourcePenalty(-3, 10, -4)).toBe(-4);
    expect(illuminationPenalty({ level: "candlelight", yards: 5 })).toBe(-5);
  });
});

describe("in plain sight (p. 574)", () => {
  it("gives +10 for a watched light and an unmodified object, +20 for detail", () => {
    expect(plainSightBonus({ watching: true, subject: "light", unconcealedLight: true })).toBe(10);
    expect(plainSightBonus({ watching: true, subject: "object", unmodified: true })).toBe(10);
    expect(plainSightBonus({ watching: true, subject: "object", unmodified: false })).toBe(0);
    expect(plainSightBonus({ watching: true, subject: "object", detail: true })).toBe(20);
  });

  it("never applies when not watching, in a contest or to an attack", () => {
    expect(plainSightBonus({ watching: false, subject: "light", unconcealedLight: true })).toBe(0);
    expect(plainSightBonus({ watching: true, subject: "light", unconcealedLight: true, excluded: "contest" })).toBe(0);
    expect(plainSightBonus({ watching: true, subject: "light", unconcealedLight: true, excluded: "attack" })).toBe(0);
  });
});

describe("vision rolls in combat (pp. 574-575)", () => {
  it("rolls against a tiny attacker: SM -14 is Vision-4", () => {
    expect(combatVision({ attackerSm: -14 })).toEqual({ needsRoll: true, modifier: -4 });
    expect(combatVision({ attackerSm: -10 })).toEqual({ needsRoll: true, modifier: 0 });
    expect(combatVision({ attackerSm: -9 }).needsRoll).toBe(false);
  });

  it("rolls against a distant shooter: 200 yards is Vision-2", () => {
    expect(combatVision({ rangePenalty: -12 })).toEqual({ needsRoll: true, modifier: -2 });
    expect(combatVision({ rangePenalty: -9 }).needsRoll).toBe(false);
  });

  it("never rolls at a bonus", () => {
    expect(combatVision({ attackerSm: -10, other: 3 })).toEqual({ needsRoll: false, modifier: 3 });
  });

  it("leaves a concealed attacker's target no defense, then a dodge at -4", () => {
    expect(concealedAttackDefense({ firstAttack: true })).toBe("none");
    expect(concealedAttackDefense({ firstAttack: false, seen: false })).toBe("dodgeMinus4");
    expect(concealedAttackDefense({ firstAttack: false, seen: true })).toBe("normal");
  });
});

describe("frostbite (p. 574)", () => {
  it("costs 1 HP per FP on each exposed location", () => {
    expect(frostbiteDamage(2, ["face", "hand"])).toEqual([{ location: "face", hp: 2 }, { location: "hand", hp: 2 }]);
    expect(frostbiteDamage(0, ["face"])).toEqual([]);
  });

  it("finds the exposed locations from what is covered", () => {
    expect(exposedLocations(["hand", "torso", "arm", "leg", "foot", "neck", "skull"])).toEqual(["face"]);
    expect(exposedLocations([])).toContain("hand");
  });
});

describe("the horizon (p. 575)", () => {
  it("reads the table by SM", () => {
    expect(horizonMiles(0)).toBe(3);
    expect(horizonMiles(4)).toBe(6.5);
    expect(horizonMiles(10)).toBe(21);
    expect(horizonMiles(-10)).toBe(0.4);
    expect(horizonMiles(22)).toBe(210);
  });

  it("reads it by height", () => {
    expect(horizonMilesForHeight(2)).toBe(3);
    expect(horizonMilesForHeight(10)).toBe(6.5);
    expect(horizonMilesForHeight(100)).toBe(21);
    expect(horizonMilesForHeight(10000)).toBe(210);
  });

  it("adds both parties' horizons and gives the signal bonus", () => {
    expect(signalRange(0, 4)).toBe(9.5);
    expect(signalVisionBonus({ deliberate: true })).toBe(10);
    // A light at night: the darkness penalty of -6 reverses to +6.
    expect(signalVisionBonus({ deliberate: true, light: true, darknessPenalty: -6 })).toBe(16);
  });
});

describe("a shot from concealment (p. 575)", () => {
  it("rolls Vision without the +10, and only at no bonus", () => {
    expect(concealedVision({ attackerSm: -2, rangePenalty: -5 })).toEqual({ needsRoll: true, modifier: -7 });
    expect(concealedVision({ attackerSm: 0 })).toEqual({ needsRoll: true, modifier: 0 });
    expect(concealedVision({ attackerSm: 1 })).toEqual({ needsRoll: false, modifier: 1 });
  });

  it("grants no defense to the first, then a Vision roll: normal defenses or a dodge at -4", () => {
    expect(concealedShotDefense({ first: true, seen: null })).toBe("none");
    expect(concealedShotDefense({ first: false, seen: null })).toBe("roll");
    expect(concealedShotDefense({ first: false, seen: true })).toBe("normal");
    expect(concealedShotDefense({ first: false, seen: false })).toBe("dodgeMinus4");
  });
});
