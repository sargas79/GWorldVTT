import { describe, expect, it } from "vitest";

import {
  BANDAGING_HP,
  FIRST_AID_CRITICAL_FAILURE_HP,
  FIRST_AID_TABLE,
  FP_PER_REST_MINUTES,
  fatigueRecovered,
  firstAidAt,
  firstAidRecovery,
  healingMultiplier,
  naturalRecovery,
  wakingFrom,
} from "../recovery.js";

describe("how fast something large heals (Campaigns p. 424)", () => {
  /** "Multiply HP healed by 2 at 20-29 HP, by 3 at 30-39 HP, by 4 at 40-49." */
  it("scales with HP past human scale", () => {
    expect(healingMultiplier(10)).toBe(1);
    expect(healingMultiplier(19)).toBe(1);
    expect(healingMultiplier(20)).toBe(2);
    expect(healingMultiplier(29)).toBe(2);
    expect(healingMultiplier(30)).toBe(3);
    expect(healingMultiplier(45)).toBe(4);
  });

  it("heals a person one point for a day of rest", () => {
    expect(naturalRecovery(10)).toBe(1);
    expect(naturalRecovery(40)).toBe(4);
  });
});

describe("the First Aid Table (Campaigns p. 424)", () => {
  it("reads the row a tech level falls in", () => {
    expect(firstAidAt(0).restored).toEqual({ dice: 1, adds: -4 });
    expect(firstAidAt(1).restored).toEqual({ dice: 1, adds: -4 });
    expect(firstAidAt(3).restored).toEqual({ dice: 1, adds: -3 });
    expect(firstAidAt(4).minutes).toBe(30);
    expect(firstAidAt(5).minutes).toBe(20);
    expect(firstAidAt(7).restored).toEqual({ dice: 1, adds: -1 });
    expect(firstAidAt(8).restored).toEqual({ dice: 1, adds: 0 });
    expect(firstAidAt(9).restored).toEqual({ dice: 1, adds: 1 });
  });

  it("treats anything past the table as its last row", () => {
    expect(firstAidAt(12)).toBe(FIRST_AID_TABLE[FIRST_AID_TABLE.length - 1]);
  });

  it("gets faster and better as the tech level rises", () => {
    let previousMinutes = Infinity;
    for (const row of FIRST_AID_TABLE) {
      expect(row.minutes).toBeLessThanOrEqual(previousMinutes);
      previousMinutes = row.minutes;
    }
  });
});

describe("what First Aid restores", () => {
  const attempt = (options: Partial<Parameters<typeof firstAidRecovery>[0]>) =>
    firstAidRecovery({
      techLevel: 8,
      outcome: { success: true },
      rolled: 4,
      maxHp: 10,
      ...options,
    });

  it("restores what the dice came up", () => {
    expect(attempt({})).toBe(4);
  });

  /** "A critical success restores the maximum possible HP!" */
  it("restores the maximum on a critical success", () => {
    expect(attempt({ outcome: { success: true, criticalSuccess: true } })).toBe(6);
    expect(attempt({ techLevel: 9, outcome: { success: true, criticalSuccess: true } })).toBe(7);
  });

  it("restores nothing on an ordinary failure", () => {
    expect(attempt({ outcome: { success: false } })).toBe(0);
  });

  /** "On a critical failure, the victim loses 2 HP." */
  it("costs the patient two on a critical failure", () => {
    expect(attempt({ outcome: { success: false, criticalFailure: true } })).toBe(
      FIRST_AID_CRITICAL_FAILURE_HP,
    );
  });

  /**
   * "minimum 1 HP" -- a TL0 roll of 1d-4 can come up at or below zero, and a
   * medic who succeeded never leaves the patient worse off.
   */
  it("never restores less than a point on a success", () => {
    expect(attempt({ techLevel: 0, rolled: -3 })).toBe(1);
    expect(attempt({ techLevel: 0, rolled: 0 })).toBe(1);
  });

  it("heals something large in proportion to its HP", () => {
    expect(attempt({ maxHp: 30 })).toBe(12);
  });

  /** Bandaging is a point on its own, and the roll includes it. */
  it("counts bandaging as the point it is", () => {
    expect(BANDAGING_HP).toBe(1);
  });
});

describe("recovering from fatigue (Campaigns p. 427)", () => {
  it("returns a point per ten minutes of rest", () => {
    expect(FP_PER_REST_MINUTES).toBe(10);
    expect(fatigueRecovered({ minutes: 10 })).toBe(1);
    expect(fatigueRecovered({ minutes: 95 })).toBe(9);
  });

  it("returns nothing for less than ten minutes", () => {
    expect(fatigueRecovered({ minutes: 9 })).toBe(0);
    expect(fatigueRecovered({ minutes: -30 })).toBe(0);
  });

  /** "one extra FP if you eat a decent meal while resting" */
  it("adds one for a decent meal", () => {
    expect(fatigueRecovered({ minutes: 30, meal: true })).toBe(4);
    expect(fatigueRecovered({ minutes: 0, meal: true })).toBe(1);
  });
});

describe("waking up again (Campaigns p. 423)", () => {
  /** "If you have 1 or more HP remaining, you awaken automatically in 15 minutes." */
  it("wakes a wounded but living character by itself", () => {
    expect(wakingFrom(3, 10)).toEqual({ kind: "automatic", minutes: 15, needsRoll: false });
  });

  /** "At 0 HP or worse, but above -1xHP, make a HT roll to awaken every hour." */
  it("asks for a HT roll every hour at zero or below", () => {
    expect(wakingFrom(0, 10)).toEqual({ kind: "hourly", minutes: 60, needsRoll: true });
    expect(wakingFrom(-9, 10)).toMatchObject({ kind: "hourly" });
  });

  /** "At -1xHP or below... a single HT roll to awaken after 12 hours." */
  it("is a much worse business at -1x HP", () => {
    expect(wakingFrom(-10, 10)).toEqual({ kind: "mortal", minutes: 720, needsRoll: true });
    expect(wakingFrom(-25, 10)).toMatchObject({ kind: "mortal" });
  });

  it("does not call a character mortally hurt for want of a maximum", () => {
    expect(wakingFrom(-5, 0)).toMatchObject({ kind: "hourly" });
  });
});
