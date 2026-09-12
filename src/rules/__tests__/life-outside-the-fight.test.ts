import { describe, expect, it } from "vitest";

import { agingModifier, agingRoll, agingRollsPerYear, diesOfAge, lifespanFrom } from "../aging.js";
import { jobRoll } from "../jobs.js";
import { culturePenalty, languagePenalty } from "../languages.js";
import { studyPoints } from "../study.js";
import {
  costOfLiving, gearCost, monthlyIncomeFromTraits, monthlyPay, startingWealth, statusFrom,
  wealthFrom, wealthMultiplier,
} from "../wealth.js";

describe("study", () => {
  it("makes a point every 200 hours of learning, at the conversion the method has", () => {
    expect(studyPoints({ hours: 200, method: "education" })).toEqual({ points: 1, bankedHours: 0 });
    expect(studyPoints({ hours: 450, method: "education" })).toEqual({ points: 2, bankedHours: 50 });
    expect(studyPoints({ hours: 100, method: "intensive" })).toEqual({ points: 1, bankedHours: 0 });
    expect(studyPoints({ hours: 400, method: "selfTeaching" })).toEqual({ points: 1, bankedHours: 0 });
    expect(studyPoints({ hours: 800, method: "onTheJob" })).toEqual({ points: 1, bankedHours: 0 });
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

  it("prices a month at Status off the one generic table", () => {
    expect(costOfLiving(0)).toBe(600);
    expect(costOfLiving(3)).toBe(12000);
    expect(costOfLiving(-2)).toBe(100);
    expect(costOfLiving(8)).toBe(600000000);
  });

  it("reads Status, and pays a job by the tech level and the level of Wealth it was written for", () => {
    expect(statusFrom([{ name: "Status", levels: 2 }, { name: "Status (Disadvantage)", levels: 1 }])).toBe(1);
    expect(monthlyPay(8, "average")).toBe(2600);
    // "At TL8, ... monthly income for those of Comfortable wealth is typically $5,200".
    expect(monthlyPay(8, "comfortable")).toBe(5200);
    expect(monthlyPay(3, "struggling")).toBe(350);
    expect(monthlyPay(0, "poor")).toBe(125);
  });

  it("reads Independent Income and Debt as a percentage of starting wealth, to a fifth", () => {
    expect(monthlyIncomeFromTraits([{ name: "Independent Income", levels: 5 }], 20000)).toEqual({ income: 1000, debt: 0 });
    expect(monthlyIncomeFromTraits([{ name: "Debt", levels: 30 }], 20000)).toEqual({ income: 0, debt: 4000 });
  });

  it("adds up the gear", () => {
    expect(gearCost([{ cost: 50, quantity: 2 }, { cost: 600 }, {}])).toBe(700);
  });
});

describe("a month at the job", () => {
  it("pays a wage on anything but a critical, with a raise on a critical success", () => {
    expect(jobRoll({ kind: "wage", success: true })).toEqual({ payMultiplier: 1, raise: false, disaster: false });
    expect(jobRoll({ kind: "wage", success: false, margin: -3 })).toMatchObject({ payMultiplier: 1 });
    expect(jobRoll({ kind: "wage", success: true, criticalSuccess: true })).toMatchObject({ payMultiplier: 1, raise: true });
  });

  it("pays freelance work by the margin, tripled on a critical", () => {
    expect(jobRoll({ kind: "freelance", success: true, margin: 0 }).payMultiplier).toBe(1);
    expect(jobRoll({ kind: "freelance", success: true, margin: 3 }).payMultiplier).toBeCloseTo(1.3);
    expect(jobRoll({ kind: "freelance", success: false, margin: -4 }).payMultiplier).toBeCloseTo(0.6);
    expect(jobRoll({ kind: "freelance", success: true, criticalSuccess: true, margin: 6 }).payMultiplier).toBe(3);
  });

  it("is a disaster on a critical failure, whatever the kind", () => {
    expect(jobRoll({ kind: "wage", success: false, criticalFailure: true })).toEqual({ payMultiplier: 0, raise: false, disaster: true });
    expect(jobRoll({ kind: "freelance", success: false, criticalFailure: true, margin: -1 }).disaster).toBe(true);
  });
});

describe("languages and cultures", () => {
  it("charge -3 broken and -1 accented, and nothing at native", () => {
    expect(languagePenalty("broken")).toBe(-3);
    expect(languagePenalty("accented")).toBe(-1);
    expect(languagePenalty("native")).toBe(0);
    expect(languagePenalty("none")).toBeNull();
  });

  it("charge -3 on a skill in an unfamiliar culture unless the character adapts to any", () => {
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

  it("stretches the ages and intervals with Extended Lifespan, shrinks them with Short, and stops with Unaging", () => {
    expect(agingRollsPerYear(80, lifespanFrom([{ name: "Extended Lifespan", levels: 1 }]))).toBe(0);
    expect(agingRollsPerYear(100, lifespanFrom([{ name: "Extended Lifespan", levels: 1 }]))).toBe(0.5);
    // Short Lifespan 1: "25 years [6 months]" (Characters p. 154).
    expect(agingRollsPerYear(25, lifespanFrom([{ name: "Short Lifespan", levels: 1 }]))).toBe(2);
    expect(agingRollsPerYear(200, lifespanFrom([{ name: "Unaging" }]))).toBe(0);
  });

  it("is modified by the medical tech level and by fitness", () => {
    expect(agingModifier({ medicalTl: 0 })).toBe(-3);
    expect(agingModifier({ medicalTl: 7 })).toBe(4);
    expect(agingModifier({ medicalTl: 3, fit: 2 })).toBe(2);
  });

  it("costs one level on a failure and two on a critical or a 17 or 18", () => {
    expect(agingRoll({ attribute: "ST", success: true, rolled: 9 })).toEqual({ attribute: "ST", lost: 0, savedByLongevity: false });
    expect(agingRoll({ attribute: "DX", success: false, rolled: 14 })).toMatchObject({ lost: 1 });
    expect(agingRoll({ attribute: "IQ", success: false, criticalFailure: true, rolled: 15 })).toMatchObject({ lost: 2 });
    expect(agingRoll({ attribute: "HT", success: false, rolled: 17 })).toMatchObject({ lost: 2 });
  });

  it("with Longevity fails only on a 17 or 18, and then as an ordinary failure", () => {
    expect(agingRoll({ attribute: "ST", success: false, rolled: 15, longevity: true })).toMatchObject({ lost: 0, savedByLongevity: true });
    expect(agingRoll({ attribute: "ST", success: false, rolled: 17, longevity: true })).toMatchObject({ lost: 1 });
    expect(agingRoll({ attribute: "ST", success: false, rolled: 17, longevity: true, modifiedHt: 17 })).toMatchObject({ lost: 0 });
    expect(diesOfAge(0)).toBe(true);
    expect(diesOfAge(1)).toBe(false);
  });
});
