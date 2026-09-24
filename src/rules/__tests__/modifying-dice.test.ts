import { describe, expect, it } from "vitest";

import { addModifier, formatDiceAdds, modifyDiceAdds, parseDiceAdds } from "../dice.js";
import { perDieOfBasicDamage, swingDamage } from "../damage.js";

/** Converts a written formula, for tables of examples. */
function modified(formula: string): string {
  return formatDiceAdds(modifyDiceAdds(parseDiceAdds(formula)!));
}

/**
 * Modifying Dice + Adds (GURPS Basic Set: Characters p. 269): +7 becomes +2d
 * and +4 becomes +1d, the bigger step first, until less than +4 is left.
 */
describe("modifyDiceAdds", () => {
  it.each([
    ["1d+4", "2d"],
    ["1d+7", "3d"],
    ["1d+9", "3d+2"],
    ["2d+5", "3d+1"],
    ["2d+6", "3d+2"],
    ["2d+3", "2d+3"],
    ["3d+18", "8d"],
  ])("rolls %s as %s", (input, output) => {
    expect(modified(input)).toBe(output);
  });

  it.each([
    // Either side of each step: +3 stays, +4 is a die; +6 is a die and +2,
    // +7 is two dice; +8 is two dice and +1, +11 is three dice.
    ["1d+3", "1d+3"],
    ["1d+4", "2d"],
    ["1d+6", "2d+2"],
    ["1d+7", "3d"],
    ["1d+8", "3d+1"],
    ["1d+10", "3d+3"],
    ["1d+11", "4d"],
    ["1d+14", "5d"],
  ])("takes %s to %s at the edges of each step", (input, output) => {
    expect(modified(input)).toBe(output);
  });

  it("never turns negative adds into fewer dice", () => {
    expect(modified("3d-1")).toBe("3d-1");
    expect(modified("1d-6")).toBe("1d-6");
  });

  it("leaves a flat figure with no dice alone", () => {
    expect(modifyDiceAdds({ dice: 0, adds: 9 })).toEqual({ dice: 0, adds: 9 });
  });

  it("converts inside a multiplier and keeps it", () => {
    expect(modifyDiceAdds({ dice: 2, adds: 5, multiplier: 2 })).toEqual({ dice: 3, adds: 1, multiplier: 2 });
    expect(modified("2d+5x2")).toBe("3d+1x2");
  });

  it("gives the same answer every time, and leaves its input alone", () => {
    const input = { dice: 1, adds: 9 };
    expect(modifyDiceAdds(input)).toEqual(modifyDiceAdds(input));
    expect(input).toEqual({ dice: 1, adds: 9 });
  });

  it("does nothing more to a formula it has already converted", () => {
    const once = modifyDiceAdds({ dice: 3, adds: 18 });
    expect(modifyDiceAdds(once)).toEqual(once);
  });
});

/** The order the book gives: every bonus in, per-die ones counted from the dice as they were, then convert. */
describe("modifying dice after the bonuses", () => {
  it("adds flat bonuses before converting", () => {
    // 2d+2, +2 and +2 again: 2d+6, which is 3d+2.
    const summed = addModifier(addModifier({ dice: 2, adds: 2 }, 2), 2);
    expect(formatDiceAdds(summed)).toBe("2d+6");
    expect(formatDiceAdds(modifyDiceAdds(summed))).toBe("3d+2");
  });

  it("counts a per-die bonus from the dice before conversion, and only once", () => {
    // ST 16 swings for 2d+2; +1 per die of it is +2, so 2d+4, which is 3d.
    const swing = swingDamage(16);
    expect(formatDiceAdds(swing)).toBe("2d+2");
    const perDie = perDieOfBasicDamage(1, "sw", 16);
    expect(perDie).toBe(2);
    expect(formatDiceAdds(modifyDiceAdds(addModifier(swing, perDie)))).toBe("3d");
    // With +2 flat as well: 2d+6, which is 3d+2 -- not 3d+3 from a per-die
    // bonus counted again on the three dice the conversion made.
    expect(formatDiceAdds(modifyDiceAdds(addModifier(swing, perDie + 2)))).toBe("3d+2");
  });

  it("resolves a penalty before deciding whether anything converts", () => {
    // 2d+5 at -2 is 2d+3, which is below the first step.
    expect(formatDiceAdds(modifyDiceAdds(addModifier({ dice: 2, adds: 5 }, -2)))).toBe("2d+3");
  });
});
