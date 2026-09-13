import { describe, expect, it } from "vitest";

import {
  bonusEnergy,
  damageEnergy,
  durationEnergy,
  governingPath,
  greaterEffectsMultiplier,
  healingEnergy,
  modifierEnergy,
  ritualCost,
  sizeSpeedRangeValue,
  subjectWeightEnergy,
} from "../ritual-cost.js";

/** Monster Hunters 1 pp. 33-35, and the book's own worked examples. */
describe("the book's rituals cost what the book says", () => {
  it("Home Security: a week-long ward over a seven-yard radius is 25 (p. 37)", () => {
    const cost = ritualCost({
      effects: [
        { path: "Spirit", effect: "control", greater: false },
        { path: "Undead", effect: "control", greater: false },
      ],
      modifiers: { areaRadius: 7, durationStep: 9 },
    });
    expect(cost).toMatchObject({ effects: 10, modifiers: 15, multiplier: 1, total: 25 });
  });

  it("Roger's call across the dimensions is 17 before, 51 after its Greater effect (p. 34)", () => {
    const cost = ritualCost({
      effects: [
        { path: "Crossroads", effect: "sense", greater: true },
        { path: "Mind", effect: "sense", greater: false },
        { path: "Mind", effect: "sense", greater: false },
      ],
      modifiers: { durationStep: 1, dimensions: 1 },
    });
    expect(cost).toMatchObject({ effects: 6, modifiers: 11, greater: 1, multiplier: 3, total: 51 });
  });

  it("Artifact Hunter: Sabrina's divination to 200 yards is 6 (p. 37)", () => {
    const cost = ritualCost({
      effects: [{ path: "Magic", effect: "sense", greater: true }],
      modifiers: { informationRangeYards: 200 },
    });
    expect(cost.total).toBe(6);
  });
});

describe("the modifiers' tables", () => {
  it("prices an affliction at +1 per 5%: nausea is +6 (p. 34)", () => {
    expect(modifierEnergy({ afflictionPercent: 30 })).toBe(6);
    expect(modifierEnergy({ afflictionPercent: 0 })).toBe(0);
  });

  it("prices given traits a point each and taken ones a point per five", () => {
    // "Protected Hearing [5] and Hard of Hearing [-10] for a net +7 energy."
    expect(modifierEnergy({ traitsAdded: 5, traitsRemoved: 10 })).toBe(7);
  });

  it("reads the Size and Speed/Range Table beyond a thousand yards", () => {
    expect(sizeSpeedRangeValue(7)).toBe(3);
    expect(sizeSpeedRangeValue(2)).toBe(0);
    // "a gate to your home 12 miles away ... (+25 energy)" (p. 34).
    expect(modifierEnergy({ speedYards: 12 * 1760 })).toBe(25);
  });

  it("charges an area at least +2", () => {
    expect(modifierEnergy({ areaRadius: 1 })).toBe(2);
    expect(modifierEnergy({ areaRadius: 7, excludedSubjects: 2 })).toBe(7);
  });

  it("doubles the bonus table at each step", () => {
    expect(bonusEnergy("broad", 1)).toBe(5);
    expect(bonusEnergy("moderate", 3)).toBe(8);
    expect(bonusEnergy("single", -5)).toBe(16);
    expect(bonusEnergy("broad", 0)).toBe(0);
  });

  it("reads damage off the table, scaled by type and delivery", () => {
    expect(damageEnergy({ dice: "1d" })).toBe(0);
    expect(damageEnergy({ dice: "2d-1" })).toBe(3);
    expect(damageEnergy({ dice: "4d-1" })).toBe(11);
    expect(damageEnergy({ dice: "3d", kind: "heavy" })).toBe(16);
    // "a 3d+3 fireball adds +1 energy" (p. 35).
    expect(damageEnergy({ dice: "3d+3", delivery: "external" })).toBe(1);
    expect(healingEnergy("2d")).toBe(4);
  });

  it("counts duration lines, months past the first, and years", () => {
    expect(durationEnergy({ step: 0 })).toBe(0);
    expect(durationEnergy({ step: 9 })).toBe(9);
    expect(durationEnergy({ step: 11, extraMonths: 2 })).toBe(13);
    expect(durationEnergy({ step: 0, years: 3 })).toBe(24);
  });

  it("reads the weight column, taking the heavier line", () => {
    expect(subjectWeightEnergy(10)).toBe(0);
    expect(subjectWeightEnergy(150)).toBe(3);
    expect(subjectWeightEnergy(2_700_000)).toBe(11);
    expect(subjectWeightEnergy(8_100_000)).toBe(12);
  });

  it("gives up to a quarter off for traditional trappings", () => {
    const base = { effects: [{ path: "Body" as const, effect: "destroy" as const, greater: false }], modifiers: {} };
    expect(ritualCost({ ...base, modifiers: { trappingsPercent: 20 } }).total).toBe(4);
    expect(ritualCost({ ...base, modifiers: { trappingsPercent: 90 } }).total).toBe(4);
  });

  it("notices damage given a duration, which the book forbids", () => {
    const effects = [{ path: "Energy" as const, effect: "destroy" as const, greater: true }];
    expect(ritualCost({ effects, modifiers: { damageDice: "2d", durationStep: 3 } }).durationConflict).toBe(true);
    expect(ritualCost({ effects, modifiers: { damageDice: "2d" } }).durationConflict).toBe(false);
  });
});

describe("the Greater effects multiplier (p. 34)", () => {
  it("is x1, x3, x5, x7, and two more for each after", () => {
    expect([0, 1, 2, 3, 4].map(greaterEffectsMultiplier)).toEqual([1, 3, 5, 7, 9]);
  });
});

describe("which skill a ritual uses (p. 35)", () => {
  it("is the lower of two Paths", () => {
    // "He'll be using Path of Undead, as it's the lower of the two" (p. 37).
    expect(governingPath([{ path: "Spirit" }, { path: "Undead" }], { Spirit: 17, Undead: 15 }))
      .toEqual({ path: "Undead", level: 15, penalty: 0 });
  });

  it("is the lowest of three or more, at -1 for each past the second", () => {
    expect(governingPath([{ path: "Matter" }, { path: "Body" }, { path: "Mind" }], { Matter: 14, Body: 12, Mind: 13 }))
      .toEqual({ path: "Body", level: 11, penalty: -1 });
  });

  it("cannot be rolled where a Path is out of reach", () => {
    expect(governingPath([{ path: "Body" }], { Body: null }).level).toBe(null);
  });
});
