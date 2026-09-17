import { describe, expect, it } from "vitest";

import { pointSteps, snapAmount, steppedAmount } from "../picker-merge.js";

const skill = (difficulty: string) => ({
  type: "skill",
  name: "Test Skill",
  system: { difficulty },
});

const technique = (difficulty: string) => ({
  type: "technique",
  name: "Test Technique",
  system: { difficulty },
});

/** Every total the spinner reaches going up from the cheapest, in order. */
function climb(item: Parameters<typeof pointSteps>[0], rungs: number): number[] {
  const out: number[] = [];
  let points = 1;
  for (let i = 0; i < rungs; i++) {
    const steps = pointSteps(item, points);
    out.push(steps.points);
    points = steps.next;
  }
  return out;
}

describe("the point totals the picker's amount field offers", () => {
  // The Skill Cost Table's steps are the same at every difficulty: 1, 2, 4, 8,
  // then by 4. What differs is the level each total reaches, not its price.
  it.each(["E", "A", "H", "VH"])("steps 1, 2, 4, 8, 12, 16 for a %s skill", (difficulty) => {
    expect(climb(skill(difficulty), 6)).toEqual([1, 2, 4, 8, 12, 16]);
  });

  it("never offers a total that buys no more than the one below", () => {
    // The bug: the spinner went 1, 2, 3, 4, 5..., and 3 bought exactly what 2
    // bought. Each rung must reach a higher level than the last.
    for (const difficulty of ["E", "A", "H", "VH"]) {
      const levels = climb(skill(difficulty), 8)
        .map((points) => pointSteps(skill(difficulty), points).relativeLevel);
      for (let i = 1; i < levels.length; i++) {
        expect(levels[i]).toBeGreaterThan(levels[i - 1]!);
      }
    }
  });

  it("raises the level by one at each step", () => {
    const steps = climb(skill("A"), 5).map((p) => pointSteps(skill("A"), p).relativeLevel);
    // An Average skill starts at attribute-1 and climbs from there.
    expect(steps).toEqual([-1, 0, 1, 2, 3]);
  });

  it("reaches different levels at the same price by difficulty", () => {
    // 4 points is 4 points whatever the difficulty; what it buys is not.
    expect(pointSteps(skill("E"), 4).relativeLevel).toBe(2);
    expect(pointSteps(skill("A"), 4).relativeLevel).toBe(1);
    expect(pointSteps(skill("H"), 4).relativeLevel).toBe(0);
    expect(pointSteps(skill("VH"), 4).relativeLevel).toBe(-1);
  });
});

describe("a typed total that is off the table", () => {
  it("snaps down to the total that buys the same level", () => {
    // 3 buys what 2 buys, and 5, 6 and 7 buy what 4 buys. Snapping goes down:
    // the player is charged for the level they reach, not the one above.
    expect(snapAmount(skill("A"), 3)).toBe(2);
    expect(snapAmount(skill("A"), 5)).toBe(4);
    expect(snapAmount(skill("A"), 6)).toBe(4);
    expect(snapAmount(skill("A"), 7)).toBe(4);
    expect(snapAmount(skill("A"), 9)).toBe(8);
    expect(snapAmount(skill("A"), 11)).toBe(8);
  });

  it("leaves a total that is already on the table alone", () => {
    for (const points of [1, 2, 4, 8, 12, 16, 20]) {
      expect(snapAmount(skill("A"), points)).toBe(points);
    }
  });

  it("floors at the cheapest total that buys anything", () => {
    for (const points of [0, -3, Number.NaN]) {
      expect(snapAmount(skill("A"), points)).toBe(1);
    }
  });

  it("still steps when the entry carries no difficulty", () => {
    const vague = { type: "skill", name: "Vague", system: {} };
    expect(snapAmount(vague, 3)).toBe(2);
    expect(steppedAmount(vague, 2, 1)).toBe(4);
  });
});

describe("techniques, which are not on the skill table", () => {
  it("steps by one for an Average technique (Characters p. 230)", () => {
    expect(climb(technique("A"), 4)).toEqual([1, 2, 3, 4]);
  });

  it("costs 2 for the first level of a Hard one, then one each", () => {
    expect(climb(technique("H"), 4)).toEqual([2, 3, 4, 5]);
  });

  it("snaps a Hard technique's single wasted point up to nothing below 2", () => {
    // One point buys no level of a Hard technique, so the cheapest total is 2.
    expect(snapAmount(technique("H"), 1)).toBe(2);
    expect(snapAmount(technique("H"), 0)).toBe(2);
  });
});

describe("stepping the field", () => {
  it("goes up and down the table rather than by one", () => {
    expect(steppedAmount(skill("A"), 2, 1)).toBe(4);
    expect(steppedAmount(skill("A"), 4, 1)).toBe(8);
    expect(steppedAmount(skill("A"), 8, -1)).toBe(4);
    expect(steppedAmount(skill("A"), 4, -1)).toBe(2);
  });

  it("does not step below the cheapest total", () => {
    expect(steppedAmount(skill("A"), 1, -1)).toBe(1);
    expect(steppedAmount(technique("H"), 2, -1)).toBe(2);
  });

  it("counts a levelled trait in levels, one at a time", () => {
    const trait = { type: "trait", name: "Acute Hearing", system: { pointsPerLevel: 2 } };
    expect(steppedAmount(trait, 2, 1)).toBe(3);
    expect(steppedAmount(trait, 3, -1)).toBe(2);
    expect(snapAmount(trait, 3)).toBe(3);
  });
});
