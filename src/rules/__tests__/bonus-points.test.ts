import { describe, expect, it } from "vitest";

import {
  buySuccessCost,
  destinyPoints,
  guidanceCost,
  outcomeStep,
  purchasableSteps,
  regainDestiny,
  sourceMayPay,
  wildcardBonusPoints,
  wildcardIgnoresFamiliarity,
} from "../bonus-points.js";

describe("buying successes (Monster Hunters 1 p. 31)", () => {
  it("costs 2, 1 and 2 a step, cumulatively: critical failure to critical success is 5", () => {
    expect(buySuccessCost("criticalFailure", "failure", { combat: false })).toBe(2);
    expect(buySuccessCost("failure", "success", { combat: false })).toBe(1);
    expect(buySuccessCost("success", "criticalSuccess", { combat: false })).toBe(2);
    expect(buySuccessCost("criticalFailure", "criticalSuccess", { combat: false })).toBe(5);
  });

  it("refuses a bought critical in combat, but not a bought success", () => {
    expect(buySuccessCost("criticalFailure", "criticalSuccess", { combat: true })).toBe(null);
    expect(buySuccessCost("criticalFailure", "success", { combat: true })).toBe(3);
    expect(purchasableSteps("failure", { combat: true })).toEqual([{ step: "success", cost: 1 }]);
  });

  it("does not sell a step down", () => {
    expect(buySuccessCost("success", "failure", { combat: false })).toBe(null);
  });

  it("reads a roll's step", () => {
    expect(outcomeStep({ success: false, criticalSuccess: false, criticalFailure: true })).toBe("criticalFailure");
    expect(outcomeStep({ success: true, criticalSuccess: false, criticalFailure: false })).toBe("success");
  });
});

describe("wildcard bonus points (p. 28)", () => {
  it("gives Blade! with 36 points three a session, for Blade! rolls only", () => {
    expect(wildcardBonusPoints(36)).toBe(3);
    const blade = { kind: "wildcard" as const, skill: "Blade!" };
    expect(sourceMayPay(blade, "buySuccess", { skill: "Blade!" })).toEqual({ allowed: true, gmCheck: false });
    expect(sourceMayPay(blade, "buySuccess", { skill: "Gun!" }).allowed).toBe(false);
  });

  it("leaves flesh wounds and guidance to the GM", () => {
    expect(sourceMayPay({ kind: "wildcard", skill: "Blade!" }, "fleshWound")).toEqual({ allowed: true, gmCheck: true });
    expect(sourceMayPay({ kind: "destiny" }, "buySuccess", { skill: "Gun!" })).toEqual({ allowed: true, gmCheck: false });
  });

  it("ignores familiarity from 12 points", () => {
    expect(wildcardIgnoresFamiliarity(12)).toBe(true);
    expect(wildcardIgnoresFamiliarity(11)).toBe(false);
    expect(wildcardBonusPoints(11)).toBe(0);
  });
});

describe("destiny points (p. 23)", () => {
  it("gives 1, 2 or 3, or the GM as many against a negative Destiny", () => {
    expect(destinyPoints(15)).toEqual({ own: 3, gm: 0 });
    expect(destinyPoints(5)).toEqual({ own: 1, gm: 0 });
    expect(destinyPoints(-10)).toEqual({ own: 0, gm: 2 });
  });

  it("regains one a session, never past the start", () => {
    expect(regainDestiny(1, 3)).toBe(2);
    expect(regainDestiny(3, 3)).toBe(3);
  });
});

describe("player guidance (p. 31)", () => {
  it("is 1, 2 or 3, a point less after a critical success but at least 1", () => {
    expect(guidanceCost("moderate")).toBe(2);
    expect(guidanceCost("major", true)).toBe(2);
    expect(guidanceCost("minor", true)).toBe(1);
  });
});
