import { describe, expect, it } from "vitest";

import {
  DEHYDRATION_HOURS,
  FREEZING_F,
  HEAT_INTERVAL_MINUTES,
  MEALS_PER_DAY,
  SWELTERING_F,
  coldInterval,
  coldModifier,
  dehydrationForDay,
  exposureResult,
  heatModifier,
  heatSurcharge,
  mealsRecoveredByRest,
  starvationFatigue,
  waterNeeded,
} from "../environment.js";

describe("going hungry (Campaigns p. 426)", () => {
  /** "A human needs three meals per day. For each meal you miss, take 1 FP." */
  it("costs a point of fatigue per missed meal", () => {
    expect(MEALS_PER_DAY).toBe(3);
    expect(starvationFatigue(1)).toBe(1);
    expect(starvationFatigue(3)).toBe(3);
    expect(starvationFatigue(0)).toBe(0);
  });

  /** "Each day of rest makes up for three skipped meals." */
  it("makes up three meals per day of rest", () => {
    expect(mealsRecoveredByRest()).toBe(3);
    expect(mealsRecoveredByRest(2)).toBe(6);
    expect(mealsRecoveredByRest(0)).toBe(0);
  });
});

describe("going thirsty (Campaigns p. 426)", () => {
  /** "2 quarts of water a day -- 3 in hot climates, 5 in the heat of the desert!" */
  it("needs more water the hotter it is", () => {
    expect(waterNeeded("temperate")).toBe(2);
    expect(waterNeeded("hot")).toBe(3);
    expect(waterNeeded("desert")).toBe(5);
  });

  it("costs nothing when there is enough to drink", () => {
    expect(dehydrationForDay({ climate: "temperate", quartsDrunk: 2 })).toEqual({
      fpLost: 0,
      hpLost: 0,
    });
  });

  /** "If you get less than you need, you lose 1 FP every eight hours." */
  it("costs three points over a day of drinking too little", () => {
    expect(DEHYDRATION_HOURS).toBe(8);
    expect(dehydrationForDay({ climate: "temperate", quartsDrunk: 1.5 })).toEqual({
      fpLost: 3,
      hpLost: 0,
    });
  });

  /** "If you drink less than a quart a day, you lose an extra 1 FP and 1 HP." */
  it("costs a point of health as well below a quart", () => {
    expect(dehydrationForDay({ climate: "temperate", quartsDrunk: 0.5 })).toEqual({
      fpLost: 4,
      hpLost: 1,
    });
    expect(dehydrationForDay({ climate: "desert", quartsDrunk: 0 })).toEqual({
      fpLost: 4,
      hpLost: 1,
    });
  });

  /** Two quarts is plenty in temperate country and not nearly enough in a desert. */
  it("judges enough by the climate rather than by the amount", () => {
    expect(dehydrationForDay({ climate: "temperate", quartsDrunk: 2 }).fpLost).toBe(0);
    expect(dehydrationForDay({ climate: "desert", quartsDrunk: 2 }).fpLost).toBe(3);
  });
});

describe("the cold (Campaigns p. 430)", () => {
  /** "every 30 minutes... light wind (10+ mph), every 15... strong (30+), 10." */
  it("asks more often the harder the wind blows", () => {
    expect(coldInterval(0)).toBe(30);
    expect(coldInterval(9)).toBe(30);
    expect(coldInterval(10)).toBe(15);
    expect(coldInterval(29)).toBe(15);
    expect(coldInterval(30)).toBe(10);
  });

  it("starts below 35 degrees for an ordinary human", () => {
    expect(FREEZING_F).toBe(35);
  });

  it("prices what somebody is wearing", () => {
    expect(coldModifier({ clothing: "light", temperatureF: 20 })).toBe(-5);
    expect(coldModifier({ clothing: "winter", temperatureF: 20 })).toBe(0);
    expect(coldModifier({ clothing: "arctic", temperatureF: 20 })).toBe(5);
    expect(coldModifier({ clothing: "heatedSuit", temperatureF: 20 })).toBe(10);
  });

  /** "Wet clothes: additional -5." */
  it("is five worse wet, whatever is being worn", () => {
    expect(coldModifier({ clothing: "arctic", wetClothes: true, temperatureF: 20 })).toBe(0);
  });

  /** "Every 10 degrees below 0F effective temperature: -1." */
  it("is a point worse per ten degrees below zero", () => {
    expect(coldModifier({ clothing: "winter", temperatureF: 0 })).toBe(0);
    expect(coldModifier({ clothing: "winter", temperatureF: -10 })).toBe(-1);
    expect(coldModifier({ clothing: "winter", temperatureF: -35 })).toBe(-3);
  });
});

describe("the heat (Campaigns p. 434)", () => {
  it("starts above 80 degrees for somebody moving about", () => {
    expect(SWELTERING_F).toBe(80);
    expect(HEAT_INTERVAL_MINUTES).toBe(30);
  });

  /** "A penalty equal to your encumbrance level; -1 per extra 10 degrees." */
  it("is worse for what you are carrying and how hot it is", () => {
    expect(heatModifier({ temperatureF: 80 })).toBe(0);
    expect(heatModifier({ temperatureF: 100 })).toBe(-2);
    expect(heatModifier({ temperatureF: 80, encumbranceLevel: 2 })).toBe(-2);
    expect(heatModifier({ temperatureF: 105, encumbranceLevel: 1 })).toBe(-3);
  });

  /** "you lose an extra 1 FP whenever you lose FP to exertion or dehydration" */
  it("charges extra for every other exertion once it is really hot", () => {
    expect(heatSurcharge(85)).toBe(0);
    expect(heatSurcharge(100)).toBe(1);
    expect(heatSurcharge(130)).toBe(2);
  });
});

describe("what a failed roll against the weather costs", () => {
  it("costs nothing at all on a success", () => {
    expect(exposureResult({ success: true })).toEqual({ fpLost: 0, heatStroke: false });
  });

  it("costs a point on an ordinary failure, hot or cold", () => {
    expect(exposureResult({ success: false })).toEqual({ fpLost: 1, heatStroke: false });
    expect(exposureResult({ success: false, heat: true })).toEqual({
      fpLost: 1,
      heatStroke: false,
    });
  });

  /** "On a critical failure, you suffer heat stroke: lose 1d FP." */
  it("costs a die of fatigue for heat stroke", () => {
    expect(exposureResult({ success: false, criticalFailure: true, heat: true, strokeRoll: 5 }))
      .toEqual({ fpLost: 5, heatStroke: true });
  });

  /** The cold has no equivalent: a critical failure there is still a point. */
  it("has no equivalent in the cold", () => {
    expect(exposureResult({ success: false, criticalFailure: true })).toEqual({
      fpLost: 1,
      heatStroke: false,
    });
  });
});
