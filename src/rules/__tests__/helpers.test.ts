import { describe, expect, it } from "vitest";

import {
  addModifier,
  averageRoll,
  maxRoll,
  minRoll,
  rollDice,
  rollDie,
  toRollFormula,
} from "../dice.js";
import { isStepPostureChange, postureMove } from "../posture.js";
import { sizeModifier, speedRangeModifier } from "../ranged.js";
import { encumberedMove, encumbranceLevel } from "../encumbrance.js";
import { swingDamage, thrustDamage } from "../damage.js";

/** A deterministic rng that walks a fixed list of die faces. */
function scriptedRng(faces: number[]): () => number {
  let index = 0;
  return () => {
    const face = faces[index++ % faces.length]!;
    return (face - 1) / 6 + 1e-9;
  };
}

describe("dice helpers", () => {
  it("rolls a die in the 1-6 range", () => {
    for (const face of [1, 2, 3, 4, 5, 6]) {
      expect(rollDie(scriptedRng([face]))).toBe(face);
    }
  });

  it("rolls the requested number of dice", () => {
    expect(rollDice(3, scriptedRng([4, 5, 6]))).toEqual([4, 5, 6]);
    expect(rollDice(0, scriptedRng([4]))).toEqual([]);
  });

  it("reports the range and average of a dice+adds expression", () => {
    expect(minRoll({ dice: 2, adds: 1 })).toBe(3);
    expect(maxRoll({ dice: 2, adds: 1 })).toBe(13);
    expect(averageRoll({ dice: 2, adds: 1 })).toBe(8);
  });

  it("adds a flat modifier without touching the dice count", () => {
    expect(addModifier({ dice: 2, adds: -1 }, 3)).toEqual({ dice: 2, adds: 2 });
  });
});

describe("Size Modifier lookups (Campaigns p. 550)", () => {
  it("puts a human-sized target at SM 0", () => {
    expect(sizeModifier(2)).toBe(0);
  });

  it("penalises targets smaller than two yards, row by row", () => {
    expect(sizeModifier(1.5)).toBe(-1);
    expect(sizeModifier(1)).toBe(-2);
    expect(sizeModifier(2 / 3)).toBe(-3);
    expect(sizeModifier(0.5)).toBe(-4);
    expect(sizeModifier(1 / 3)).toBe(-5);
    expect(sizeModifier(8 / 36)).toBe(-6);
    expect(sizeModifier(1 / 36)).toBe(-11);
    expect(sizeModifier(1 / 180)).toBe(-15);
  });

  it("takes the next-highest size between two rows", () => {
    expect(sizeModifier(0.9)).toBe(-2);
    expect(sizeModifier(4)).toBe(2);
    expect(sizeModifier(1200)).toBe(17);
  });

  it("rewards large targets, with the giant's 4 yards at SM +2", () => {
    expect(sizeModifier(4)).toBe(2);
    expect(sizeModifier(10)).toBe(4);
    expect(sizeModifier(100)).toBe(10);
  });

  it("keeps the 1.5/2/3/5/7/10 steps in every decade past 1,000 yards", () => {
    const rows: Array<[number, number]> = [
      [1000, 16], [1500, 17], [2000, 18], [3000, 19], [5000, 20], [7000, 21], [10000, 22],
      [15000, 23], [70000, 27], [200000, 30], [2_000_000, 36],
    ];
    for (const [yards, size] of rows) {
      expect(sizeModifier(yards)).toBe(size);
      expect(speedRangeModifier(yards)).toBe(-size);
    }
  });

  it("keeps losing 6 per factor of ten below the smallest printed row", () => {
    expect(sizeModifier(1 / 1800)).toBe(-21);
  });

  it("floors degenerate sizes at the bottom printed row", () => {
    expect(sizeModifier(0)).toBe(-15);
    expect(sizeModifier(-4)).toBe(-15);
  });
});

describe("posture transitions", () => {
  it("treats the kneeling/standing swap as a step, both ways", () => {
    expect(isStepPostureChange("kneeling", "standing")).toBe(true);
    expect(isStepPostureChange("standing", "kneeling")).toBe(true);
  });

  it("rejects any other transition as needing a Change Posture maneuver", () => {
    expect(isStepPostureChange("lying", "standing")).toBe(false);
    expect(isStepPostureChange("crouching", "standing")).toBe(false);
  });

  it("never grants a lying character more Move than they have", () => {
    expect(postureMove(0, "lying")).toBe(0);
  });
});

describe("encumbrance edge cases", () => {
  it("treats a character with no Basic Lift as maximally encumbered", () => {
    expect(encumbranceLevel(1, 0)).toBe(4);
  });

  it("reports level 4 rather than throwing when overloaded", () => {
    expect(encumbranceLevel(10_000, 20)).toBe(4);
    expect(encumberedMove(5, 4)).toBe(1);
  });
});

describe("roll formula rendering", () => {
  it("renders a negative modifier as a subtraction, not two operators", () => {
    // "1d6 + -2" is what naive interpolation gives, and formula grammars reject it.
    expect(toRollFormula({ dice: 1, adds: -2 })).toBe("1d6 - 2");
  });

  it("renders a positive modifier as an addition", () => {
    expect(toRollFormula({ dice: 2, adds: 3 })).toBe("2d6 + 3");
  });

  it("omits a zero modifier", () => {
    expect(toRollFormula({ dice: 3, adds: 0 })).toBe("3d6");
  });

  it("renders flat damage without a 0d6 term", () => {
    expect(toRollFormula({ dice: 0, adds: 4 })).toBe("4");
  });

  it("round-trips every GURPS damage step into a valid formula", () => {
    for (let st = 1; st <= 20; st++) {
      for (const formula of [thrustDamage(st), swingDamage(st)]) {
        const rendered = toRollFormula(formula);
        expect(rendered, `ST ${st}`).toMatch(/^\d+d6( [+-] \d+)?$/);
      }
    }
  });
});
