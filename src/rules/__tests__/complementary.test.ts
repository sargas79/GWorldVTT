import { describe, expect, it } from "vitest";

import {
  COMPLEMENTARY_CAP,
  complementaryBonus,
  complementaryRoom,
  complementaryTotal,
  contestMarginFor,
  teamEffort,
} from "../complementary.js";
import { quickContest, resolveSuccess } from "../success.js";

/**
 * Complementary skills (Basic Set Revised p. 206) and team efforts (p. 185).
 */

describe("the modifier a complementary skill gives (p. 206)", () => {
  it("reads an uncontested roll: +2 critical success, +1 success, -1 failure, -2 critical failure", () => {
    expect(complementaryBonus({ success: true, criticalSuccess: true })).toBe(2);
    expect(complementaryBonus({ success: true })).toBe(1);
    expect(complementaryBonus({ success: false })).toBe(-1);
    expect(complementaryBonus({ success: false, criticalFailure: true })).toBe(-2);
  });

  it("reads a roll as the system resolves it", () => {
    // Skill 12: a 4 is a critical success, a 10 a success, a 14 a failure, an 18 a critical failure.
    expect(complementaryBonus(resolveSuccess(4, 12, [1, 1, 2]))).toBe(2);
    expect(complementaryBonus(resolveSuccess(10, 12, [3, 3, 4]))).toBe(1);
    expect(complementaryBonus(resolveSuccess(14, 12, [4, 5, 5]))).toBe(-1);
    expect(complementaryBonus(resolveSuccess(18, 12, [6, 6, 6]))).toBe(-2);
  });

  it("reads a Quick Contest by the margin of victory: 5+ is +2, 0-4 is +1, lost by 1-4 is -1, lost by 5+ is -2", () => {
    expect(complementaryBonus({ contestMargin: 9 })).toBe(2);
    expect(complementaryBonus({ contestMargin: 5 })).toBe(2);
    expect(complementaryBonus({ contestMargin: 4 })).toBe(1);
    expect(complementaryBonus({ contestMargin: 0 })).toBe(1);
    expect(complementaryBonus({ contestMargin: -1 })).toBe(-1);
    expect(complementaryBonus({ contestMargin: -4 })).toBe(-1);
    expect(complementaryBonus({ contestMargin: -5 })).toBe(-2);
    expect(complementaryBonus({ contestMargin: -12 })).toBe(-2);
  });

  it("signs a Quick Contest's margin for the side that rolled the complementary skill", () => {
    const won = quickContest(resolveSuccess(6, 12, [2, 2, 2]), resolveSuccess(13, 12, [4, 4, 5]));
    expect(contestMarginFor(won)).toBe(won.marginOfVictory);
    expect(complementaryBonus({ contestMargin: contestMarginFor(won) })).toBe(2);
    const lost = quickContest(resolveSuccess(13, 12, [4, 4, 5]), resolveSuccess(6, 12, [2, 2, 2]));
    expect(contestMarginFor(lost)).toBe(-lost.marginOfVictory);
    expect(complementaryBonus({ contestMargin: contestMarginFor(lost) })).toBe(-2);
    expect(contestMarginFor({ outcome: "tie", marginOfVictory: 0 })).toBe(0);
  });
});

describe("several complementary skills on a long task", () => {
  it("caps the total at +4", () => {
    expect(COMPLEMENTARY_CAP).toBe(4);
    expect(complementaryTotal([2, 2])).toBe(4);
    expect(complementaryTotal([2, 2, 1])).toBe(4);
    expect(complementaryTotal([2, 1])).toBe(3);
    expect(complementaryTotal([2, 2, -2])).toBe(2);
    expect(complementaryTotal([])).toBe(0);
  });

  it("leaves a new bonus only the room the held ones leave, and a penalty whole", () => {
    expect(complementaryRoom([], 2)).toBe(2);
    expect(complementaryRoom([2], 2)).toBe(2);
    expect(complementaryRoom([2, 1], 2)).toBe(1);
    expect(complementaryRoom([2, 2], 1)).toBe(0);
    expect(complementaryRoom([2, 2], -2)).toBe(-2);
    expect(complementaryRoom([-2], 2)).toBe(2);
  });
});

describe("a team effort (p. 185)", () => {
  it("rolls at the best level, plus the number who know the skill, less the group's size", () => {
    // Four in the group; three know Stealth (at least a point), the best at 14.
    const effort = teamEffort([
      { level: 12, points: 2 },
      { level: 14, points: 4 },
      { level: 10, points: 1 },
      { level: null, points: 0 },
    ]);
    expect(effort).toEqual({ best: 14, bonus: 3, penalty: 4, effective: 13 });
  });

  it("gives a lone expert a penalty for the company he carries", () => {
    expect(
      teamEffort([
        { level: 15, points: 8 },
        { level: null, points: 0 },
        { level: null, points: 0 },
      ]),
    ).toEqual({
      best: 15,
      bonus: 1,
      penalty: 3,
      effective: 13,
    });
  });

  it("counts no defaults: a level reached by default earns nothing and can't be the best", () => {
    const effort = teamEffort([
      { level: 9, points: 1 },
      { level: 13, points: 0 },
    ]);
    expect(effort).toEqual({ best: 9, bonus: 1, penalty: 2, effective: 8 });
  });

  it("is nothing where no one knows the skill", () => {
    expect(
      teamEffort([
        { level: 8, points: 0 },
        { level: null, points: 0 },
      ]),
    ).toBeNull();
    expect(teamEffort([])).toBeNull();
  });
});
