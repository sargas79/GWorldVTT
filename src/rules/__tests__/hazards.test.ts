import { describe, expect, it } from "vitest";

import { collisionDamage, collisionVelocity, overrunDamage } from "../collisions.js";
import { lethalShock, lethalShockModifier, nonlethalShock } from "../electricity.js";
import { catchingFire, FIRE_DAMAGE, ignites, prolongedContactTarget } from "../fire.js";
import { dailyMiles, marchingFatiguePerHour } from "../hiking.js";
import {
  protectedDose, radiationEffect, radiationRow, radiationToleranceFrom, remainingDose,
} from "../radiation.js";
import {
  dozingOff, sleepPeriodFrom, sleepRecovery, stayingUpFatigue, wakingDayHours,
} from "../sleep.js";
import { controlRoll, cruisingSpeedMph, occupants, safeDecelerationPerTurn } from "../vehicles.js";

describe("missed sleep", () => {
  it("reads the sleep period off the traits", () => {
    expect(sleepPeriodFrom([])).toBe(8);
    expect(sleepPeriodFrom([{ name: "Less Sleep", levels: 2 }])).toBe(6);
    expect(sleepPeriodFrom([{ name: "Extra Sleep", levels: 1 }])).toBe(9);
    expect(sleepPeriodFrom([{ name: "Doesn't Sleep" }])).toBeNull();
  });

  it("shortens the day by twice the sleep missed", () => {
    expect(wakingDayHours(8)).toBe(16);
    // "if ... you sleep only six hours ... your usual 16-hour day, minus four hours".
    expect(wakingDayHours(8, 2)).toBe(12);
  });

  it("costs a point at the end of the day and one a quarter-day after", () => {
    expect(stayingUpFatigue({ hoursAwake: 16, dayHours: 16 })).toBe(0);
    expect(stayingUpFatigue({ hoursAwake: 17, dayHours: 16 })).toBe(1);
    expect(stayingUpFatigue({ hoursAwake: 20, dayHours: 16 })).toBe(2);
    expect(stayingUpFatigue({ hoursAwake: 28, dayHours: 16 })).toBe(4);
  });

  it("gives a point back for a full period and one an hour beyond it", () => {
    expect(sleepRecovery({ hoursSlept: 6, sleepPeriod: 8 })).toBe(0);
    expect(sleepRecovery({ hoursSlept: 8, sleepPeriod: 8 })).toBe(1);
    expect(sleepRecovery({ hoursSlept: 11, sleepPeriod: 8 })).toBe(4);
  });

  it("knows when staying awake is a roll", () => {
    expect(dozingOff({ lostToSleep: 1, maxFp: 10, currentFp: 9 }).rolls).toBe(false);
    expect(dozingOff({ lostToSleep: 5, maxFp: 10, currentFp: 5 })).toEqual({ rolls: true, inactiveMinutes: 120, activeMinutes: null });
    expect(dozingOff({ lostToSleep: 7, maxFp: 10, currentFp: 3 })).toEqual({ rolls: true, inactiveMinutes: 30, activeMinutes: 120 });
  });
});

describe("hiking", () => {
  it("is ten miles a Move, by the ground and the sky, a fifth more on a Hiking roll", () => {
    expect(dailyMiles({ move: 5 })).toBe(50);
    expect(dailyMiles({ move: 5, terrain: "veryBad" })).toBe(10);
    expect(dailyMiles({ move: 5, terrain: "good", weather: "rain" })).toBe(31.3);
    expect(dailyMiles({ move: 5, hikingSuccess: true })).toBe(60);
    expect(dailyMiles({ move: 6, enhancedMove: 2 })).toBe(120);
  });

  it("costs the fatigue of a battle an hour", () => {
    expect(marchingFatiguePerHour({ encumbranceLevel: 0 })).toBe(1);
    expect(marchingFatiguePerHour({ encumbranceLevel: 1, hot: true })).toBe(3);
    expect(marchingFatiguePerHour({ encumbranceLevel: 4 })).toBe(5);
  });
});

describe("collisions", () => {
  it("adds velocities head-on and subtracts them rear-end", () => {
    expect(collisionVelocity({ angle: "headOn", velocity: 10, otherVelocity: 5 })).toBe(15);
    expect(collisionVelocity({ angle: "rearEnd", velocity: 25, otherVelocity: 5 })).toBe(20);
    expect(collisionVelocity({ angle: "side", velocity: 25, otherVelocity: 5 })).toBe(25);
  });

  it("is HP times velocity over a hundred dice, doubled against something hard", () => {
    // "The car inflicts (60 x 20)/100 = 12d crushing damage on the pedestrian".
    expect(collisionDamage({ hitPoints: 60, velocity: 20 })).toEqual({ dice: 12, modifier: 0, type: "cr" });
    // Bill: 10 HP, twice for the street, velocity 19: 3.8d rounds up to 4d.
    expect(collisionDamage({ hitPoints: 10, velocity: 19, hard: true })).toEqual({ dice: 4, modifier: 0, type: "cr" });
    expect(collisionDamage({ hitPoints: 10, velocity: 20, sharp: "imp" })).toEqual({ dice: 1, modifier: 0, type: "imp" });
  });

  it("overruns something two sizes smaller for thrust at half its HP", () => {
    expect(overrunDamage({ strikerSm: 3, struckSm: 0, strikerHp: 60 })).toEqual({ dice: 3, adds: 0 });
    expect(overrunDamage({ strikerSm: 1, struckSm: 0, strikerHp: 60 })).toBeNull();
  });
});

describe("electricity", () => {
  it("stuns for a second on a jolt, and for 20 minus HT after a continuous shock", () => {
    expect(nonlethalShock({ success: true, ht: 12 })).toEqual({ stunned: false, stunSeconds: 0 });
    expect(nonlethalShock({ success: false, ht: 12 })).toEqual({ stunned: true, stunSeconds: 1 });
    expect(nonlethalShock({ success: false, ht: 12, continuous: true })).toEqual({ stunned: true, stunSeconds: 8 });
    expect(nonlethalShock({ success: false, ht: 19, continuous: true }).stunSeconds).toBe(1);
  });

  it("rolls at -1 per 2 injury against a lethal shock, and stops the heart on a bad failure", () => {
    expect(lethalShockModifier(7)).toBe(-3);
    expect(lethalShock({ success: false, margin: 2, ht: 11 })).toEqual({
      unconscious: true, unconsciousMinutes: 9, dazedMinutes: 9, heartAttack: false,
    });
    expect(lethalShock({ success: false, margin: 5, ht: 11 }).heartAttack).toBe(true);
    expect(lethalShock({ success: false, criticalFailure: true, ht: 11 }).heartAttack).toBe(true);
  });
});

describe("fire", () => {
  it("burns 1d-3 for part of a turn and 1d-1 for all of it", () => {
    expect(FIRE_DAMAGE.partTurn).toEqual({ dice: 1, adds: -3 });
    expect(FIRE_DAMAGE.fullTurn).toEqual({ dice: 1, adds: -1 });
  });

  it("sets clothing alight at 3 points and all of it at 10", () => {
    expect(catchingFire(2)).toBeNull();
    expect(catchingFire(3)).toMatchObject({ alight: "part", damage: { dice: 1, adds: -4 }, dxPenalty: -2, readiesToPutOut: 1 });
    expect(catchingFire(10)).toMatchObject({ alight: "all", damage: { dice: 1, adds: -1 }, dxPenalty: -3, readiesToPutOut: 3 });
  });

  it("lights materials by class, and slowly by prolonged contact", () => {
    expect(ignites("flammable", 3)).toBe(true);
    expect(ignites("resistant", 3)).toBe(false);
    expect(ignites("nonflammable", 100)).toBe(false);
    // Flammable materials taking 1 point a second: one category up, 16 or less.
    expect(prolongedContactTarget("flammable", 1)).toBe(16);
    // Flammable materials touching a candle flame: two up, 6 or less.
    expect(prolongedContactTarget("flammable", 0)).toBe(6);
    expect(prolongedContactTarget("flammable", 3)).toBeNull();
  });
});

describe("radiation", () => {
  it("reads the table by accumulated dose", () => {
    expect(radiationRow(0)).toBeNull();
    expect(radiationRow(5)).toMatchObject({ htModifier: 0, effects: ["-", "-", "A", "B"] });
    expect(radiationRow(100)).toMatchObject({ htModifier: -3 });
    expect(radiationRow(1000)).toMatchObject({ htModifier: -5, effects: ["C", "D", "E", "E"] });
    expect(radiationRow(5000)?.effects).toEqual(["D", "E", "E", "E"]);
  });

  it("picks the column by the roll", () => {
    const row = radiationRow(30)!;
    expect(radiationEffect(row, { success: true, criticalSuccess: true })).toBe("A");
    expect(radiationEffect(row, { success: true })).toBe("B");
    expect(radiationEffect(row, { success: false })).toBe("C");
    expect(radiationEffect(row, { success: false, criticalFailure: true })).toBe("D");
  });

  it("heals ten rads a day after thirty, down to a tenth that stays", () => {
    // "After 30 days, that particular dose starts to heal at 10 rads/day. After
    // another 18 days, the remaining dose is 20 rads -- 10% of 200 rads".
    expect(remainingDose(200, 30)).toBe(200);
    expect(remainingDose(200, 40)).toBe(100);
    expect(remainingDose(200, 48)).toBe(20);
    expect(remainingDose(200, 400)).toBe(20);
  });

  it("is divided by the Protection Factor", () => {
    expect(protectedDose(200, 2)).toBe(100);
    expect(radiationToleranceFrom([{ name: "Radiation Tolerance", levels: 3 }])).toBe(10);
    expect(radiationToleranceFrom([])).toBe(1);
  });
});

describe("vehicles", () => {
  it("grades a control roll by the Stability Rating", () => {
    expect(controlRoll({ success: true, stabilityRating: 3 })).toBe("ok");
    expect(controlRoll({ success: false, margin: 3, stabilityRating: 3 })).toBe("minor");
    expect(controlRoll({ success: false, margin: 4, stabilityRating: 3 })).toBe("major");
    expect(controlRoll({ success: false, criticalFailure: true, stabilityRating: 3 })).toBe("disaster");
  });

  it("finds the cruising speed the book's example does", () => {
    // "A luxury car with Move 3/57 gets an average travel speed of 57 x 1.25 = 71 mph on a paved road".
    expect(cruisingSpeedMph({ topSpeed: 57, acceleration: 3, locomotion: "wheels", terrain: "good", roadBound: true, onRoad: true })).toBe(71.3);
    // "On a dirt road (Average), it could manage 57 x 0.5 = 28 mph."
    expect(cruisingSpeedMph({ topSpeed: 57, acceleration: 3, locomotion: "wheels", terrain: "average", roadBound: true, onRoad: true })).toBe(28.5);
    // "But off road in Average terrain, it would drop to 3 x 4 x 0.5 = 6 mph!"
    expect(cruisingSpeedMph({ topSpeed: 57, acceleration: 3, locomotion: "wheels", terrain: "average", roadBound: true, onRoad: false })).toBe(6);
    expect(cruisingSpeedMph({ topSpeed: 20, locomotion: "water" })).toBe(40);
  });

  it("knows how fast a vehicle can safely slow, and how many it carries", () => {
    expect(safeDecelerationPerTurn({ locomotion: "wheels", handling: -1 })).toBe(5);
    expect(safeDecelerationPerTurn({ locomotion: "air", handling: -4 })).toBe(1);
    expect(safeDecelerationPerTurn({ locomotion: "tracks", handling: 0 })).toBe(10);
    expect(occupants("1+3")).toEqual({ crew: 1, passengers: 3 });
    expect(occupants("2")).toEqual({ crew: 2, passengers: 0 });
  });
});
