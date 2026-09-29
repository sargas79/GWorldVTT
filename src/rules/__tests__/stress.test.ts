import { describe, expect, it } from "vitest";
import {
  addHardship,
  cureByPoints,
  derangementRecoveryTarget,
  derangementRollPenalty,
  frightHardship,
  stressFrightPenalty,
  stressRecovered,
  stressRollPenalty,
} from "../stress.js";

describe("Stress and Derangement (Basic Set Revised pp. 572-573)", () => {
  it("costs 1 on a failure and 3 on a critical failure", () => {
    expect(frightHardship({ criticalFailure: false })).toBe(1);
    expect(frightHardship({ criticalFailure: true })).toBe(3);
  });
  it("penalizes Fright Checks by half of both, rounded against the character", () => {
    expect(stressFrightPenalty(0, 0)).toBe(0);
    expect(stressFrightPenalty(3, 0)).toBe(-2);
    expect(stressFrightPenalty(2, 2)).toBe(-2);
  });
  it("turns Stress past -Will into Derangement, and Derangement past it into points", () => {
    expect(addHardship({ stress: 9, derangement: 0, will: 10, kind: "ordinary", amount: 3 })).toEqual({ stress: 10, derangement: 2, permanentPoints: 0 });
    expect(addHardship({ stress: 0, derangement: 9, will: 10, kind: "sanity", amount: 3 })).toEqual({ stress: 0, derangement: 10, permanentPoints: 2 });
    expect(addHardship({ stress: 4, derangement: 0, will: 10, kind: "sanity", amount: 1 })).toEqual({ stress: 4, derangement: 1, permanentPoints: 0 });
  });
  it("recovers Stress 1 per 10 minutes and 1 more for an indulgence", () => {
    expect(stressRecovered({ minutes: 35 })).toBe(3);
    expect(stressRecovered({ minutes: 10, indulgence: true })).toBe(2);
  });
  it("applies half of Stress, offset by Fearlessness, never as a bonus", () => {
    expect(stressRollPenalty(5)).toBe(-3);
    expect(stressRollPenalty(5, 2)).toBe(-1);
    expect(stressRollPenalty(2, 3)).toBe(0);
  });
  it("applies half of Derangement, which Fearlessness never offsets", () => {
    expect(derangementRollPenalty(5)).toBe(-3);
  });
  it("gives a clinician +1 to the day's-end Will roll", () => {
    expect(derangementRecoveryTarget({ will: 11 })).toBe(11);
    expect(derangementRecoveryTarget({ will: 11, clinician: true })).toBe(12);
  });
  it("cures 2 Derangement or all Stress per point of a new disadvantage", () => {
    expect(cureByPoints({ stress: 5, derangement: 5, points: 1, target: "stress" })).toEqual({ stress: 0, derangement: 5 });
    expect(cureByPoints({ stress: 5, derangement: 5, points: 2, target: "derangement" })).toEqual({ stress: 5, derangement: 1 });
  });
});
