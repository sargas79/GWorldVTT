import { describe, expect, it } from "vitest";

import { agedAttribute, agingResult, agingRollsPerYear, lifespanFrom } from "../aging.js";
import { jobRoll } from "../jobs.js";
import { culturePenalty, languagePenalty } from "../languages.js";
import { studyPoints } from "../study.js";
import {
  costOfLiving, gearCost, monthlyPay, startingWealth, statusFrom, wealthFrom, wealthMultiplier,
} from "../wealth.js";

describe("study", () => {
  it("makes a point every 200 hours with a teacher and every 400 alone", () => {
    expect(studyPoints({ hours: 200, method: "education" })).toEqual({ points: 1, bankedHours: 0 });
    expect(studyPoints({ hours: 450, method: "education" })).toEqual({ points: 2, bankedHours: 50 });
    expect(studyPoints({ hours: 400, method: "selfTeaching" })).toEqual({ points: 1, bankedHours: 0 });
    expect(studyPoints({ hours: 100, method: "onTheJob" })).toEqual({ points: 0, bankedHours: 100 });
  });

  it("counts the hours already banked", () => {
    expect(studyPoints({ hours: 100, method: "education", banked: 150 })).toEqual({ points: 1, bankedHours: 50 });
  });
});

describe("wealth", () => {
  it("reads the level off the trait, Average without one", () => {
    expect(wealthFrom([])).toEqual({ level: "average", multimillionaire: 0 });
    expect(wealthFrom([{ name: "Wealth", levels: 2 }])).toEqual({ level: "wealthy", multimillionaire: 0 });
    expect(wealthFrom([{ name: "Wealth", levels: 5 }])).toEqual({ level: "multimillionaire", multimillionaire: 1 });
    expect(wealthFrom([{ name: "Wealth (Disadvantage)", levels: 3 }])).toEqual({ level: "deadBroke", multimillionaire: 0 });
  });

  it("multiplies the starting wealth of the tech level", () => {
    expect(startingWealth(3, wealthFrom([]))).toBe(1000);
    expect(startingWealth(8, wealthFrom([{ name: "Wealth", levels: 3 }]))).toBe(400000);
    expect(startingWealth(8, wealthFrom([{ name: "Wealth (Disadvantage)", levels: 2 }]))).toBe(4000);
    expect(wealthMultiplier({ level: "multimillionaire", multimillionaire: 3 })).toBe(100000);
  });

  it("prices a month at Status, scaled to the tech level", () => {
    expect(costOfLiving(0, 8)).toBe(600);
    expect(costOfLiving(3, 8)).toBe(12000);
    expect(costOfLiving(-2, 8)).toBe(100);
    // TL3 starting wealth is a twentieth of TL8's.
    expect(costOfLiving(0, 3)).toBe(30);
  });

  it("reads Status, and pays a job by the level of Wealth it was written for", () => {
    expect(statusFrom([{ name: "Status", levels: 2 }, { name: "Status (Disadvantage)", levels: 1 }])).toBe(1);
    expect(monthlyPay(8, "average")).toBe(2000);
    expect(monthlyPay(8, "wealthy")).toBe(10000);
    expect(monthlyPay(3, "struggling")).toBe(50);
  });

  it("adds up the gear", () => {
    expect(gearCost([{ cost: 50, quantity: 2 }, { cost: 600 }, {}])).toBe(700);
  });
});

describe("a month at the job", () => {
  it("pays on a success, twice on a critical, nothing on a failure", () => {
    expect(jobRoll({ success: true })).toMatchObject({ monthsPaid: 1, fired: false });
    expect(jobRoll({ success: true, criticalSuccess: true })).toMatchObject({ monthsPaid: 2, promoted: true });
    expect(jobRoll({ success: false, margin: 2 })).toMatchObject({ monthsPaid: 0, fired: false, risk: false });
  });

  it("costs the job when failed badly, and the risk on a critical failure", () => {
    expect(jobRoll({ success: false, margin: 5 })).toMatchObject({ fired: true, risk: false });
    expect(jobRoll({ success: false, criticalFailure: true, margin: 1 })).toMatchObject({ fired: true, risk: true });
  });
});

describe("languages and cultures", () => {
  it("charge -3 broken and -1 accented, and nothing at native", () => {
    expect(languagePenalty("broken")).toBe(-3);
    expect(languagePenalty("accented")).toBe(-1);
    expect(languagePenalty("native")).toBe(0);
    expect(languagePenalty("none")).toBeNull();
  });

  it("charge -3 in an unfamiliar culture unless the character adapts to any", () => {
    expect(culturePenalty(true, [])).toBe(-3);
    expect(culturePenalty(false, [])).toBe(0);
    expect(culturePenalty(true, [{ name: "Cultural Adaptability" }])).toBe(0);
    expect(culturePenalty(true, [{ name: "Xeno-Adaptability" }])).toBe(0);
  });
});

describe("aging", () => {
  it("rolls once a year from 50, twice from 70, four times from 90", () => {
    expect(agingRollsPerYear(49)).toBe(0);
    expect(agingRollsPerYear(50)).toBe(1);
    expect(agingRollsPerYear(70)).toBe(2);
    expect(agingRollsPerYear(95)).toBe(4);
  });

  it("stretches with Extended Lifespan, shrinks with Short, and stops with Unaging", () => {
    expect(agingRollsPerYear(80, lifespanFrom([{ name: "Extended Lifespan", levels: 1 }]))).toBe(0);
    expect(agingRollsPerYear(100, lifespanFrom([{ name: "Extended Lifespan", levels: 1 }]))).toBe(1);
    expect(agingRollsPerYear(25, lifespanFrom([{ name: "Short Lifespan", levels: 1 }]))).toBe(1);
    expect(agingRollsPerYear(200, lifespanFrom([{ name: "Unaging" }]))).toBe(0);
  });

  it("names the attribute by a die, and costs one point or two", () => {
    expect([1, 2, 3, 4, 5, 6].map(agedAttribute)).toEqual(["ST", "ST", "DX", "IQ", "HT", "HT"]);
    expect(agingResult({ success: true, rolled: 9 })).toEqual({ held: true, lost: 0, savedByLongevity: false });
    expect(agingResult({ success: false, rolled: 14 })).toMatchObject({ held: false, lost: 1 });
    expect(agingResult({ success: false, criticalFailure: true, rolled: 18 })).toMatchObject({ lost: 2 });
  });

  it("fails only on a 17 or 18 with Longevity", () => {
    expect(agingResult({ success: false, rolled: 15, longevity: true })).toMatchObject({ held: true, savedByLongevity: true });
    expect(agingResult({ success: false, rolled: 17, longevity: true })).toMatchObject({ held: false });
    expect(agingResult({ success: false, rolled: 17, longevity: true, ht: 17 })).toMatchObject({ held: true });
  });
});
