import { describe, expect, it } from "vitest";

import {
  addModifier,
  averageRoll,
  maxRoll,
  minRoll,
  rollDice,
  rollDiceAdds,
  rollDie,
} from "../dice.js";
import { isStepPostureChange, postureMove } from "../posture.js";
import { sizeModifier, speedRangeModifier } from "../ranged.js";
import { encumberedMove, encumbranceLevel } from "../encumbrance.js";

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

  it("totals a dice+adds roll including the modifier", () => {
    const result = rollDiceAdds({ dice: 2, adds: 3 }, scriptedRng([4, 5]));
    expect(result.dice).toEqual([4, 5]);
    expect(result.total).toBe(12);
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

describe("Size Modifier lookups (GURPS Lite p. 27)", () => {
  it("puts a human-sized target at SM 0", () => {
    expect(sizeModifier(2)).toBe(0);
  });

  it("penalises targets smaller than a yard", () => {
    expect(sizeModifier(1)).toBe(-2);
    expect(sizeModifier(1 / 3)).toBe(-5);
  });

  it("rewards large targets", () => {
    expect(sizeModifier(10)).toBe(4);
    expect(sizeModifier(100)).toBe(10);
  });

  it("keeps extending past the printed table", () => {
    expect(sizeModifier(10000)).toBe(22);
    expect(speedRangeModifier(10000)).toBe(-22);
  });

  it("floors degenerate sizes at the bottom row", () => {
    expect(sizeModifier(0)).toBe(-5);
    expect(sizeModifier(-4)).toBe(-5);
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
