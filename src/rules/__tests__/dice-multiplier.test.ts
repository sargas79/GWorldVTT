import { describe, expect, it } from "vitest";

import {
  addModifier,
  averageRoll,
  formatDiceAdds,
  maxRoll,
  minRoll,
  parseDiceAdds,
  rollDiceAdds,
  toRollFormula,
} from "../dice.js";

/**
 * The heaviest weapons and largest explosives are written with a multiplier --
 * "6dx10" -- which the dice model had no room for, so those entries could not
 * be imported at all.
 */
describe("multiplied damage", () => {
  it("parses the multiplier", () => {
    expect(parseDiceAdds("6dx10")).toEqual({ dice: 6, adds: 0, multiplier: 10 });
    expect(parseDiceAdds("5dx2")).toEqual({ dice: 5, adds: 0, multiplier: 2 });
  });

  it("accepts the book's own times sign as well as an x", () => {
    expect(parseDiceAdds("6d×10")).toEqual({ dice: 6, adds: 0, multiplier: 10 });
  });

  it("parses a multiplier alongside adds", () => {
    expect(parseDiceAdds("2d+2x3")).toEqual({ dice: 2, adds: 2, multiplier: 3 });
  });

  /** A multiplier of one is no multiplier, and is not worth carrying. */
  it("leaves an unmultiplied roll alone", () => {
    expect(parseDiceAdds("2d+1")).toEqual({ dice: 2, adds: 1 });
    expect(parseDiceAdds("6dx1")).toEqual({ dice: 6, adds: 0 });
  });

  /** A multiplier of zero would erase the attack rather than scale it. */
  it("refuses a multiplier that would zero the damage", () => {
    expect(parseDiceAdds("6dx0")).toBeNull();
  });

  it("writes the multiplier back out", () => {
    expect(formatDiceAdds({ dice: 6, adds: 0, multiplier: 10 })).toBe("6dx10");
    expect(formatDiceAdds({ dice: 2, adds: 2, multiplier: 3 })).toBe("2d+2x3");
    expect(formatDiceAdds({ dice: 2, adds: 1 })).toBe("2d+1");
  });

  it("round-trips", () => {
    for (const text of ["6dx10", "2d+2x3", "1d-2", "3d", "4"]) {
      expect(formatDiceAdds(parseDiceAdds(text)!)).toBe(text);
    }
  });

  /**
   * The multiplier applies to the whole roll. Without the brackets,
   * "6d6 + 2 * 10" multiplies only the 2, which is a different and much
   * smaller attack.
   */
  it("brackets the roll before multiplying it", () => {
    expect(toRollFormula({ dice: 6, adds: 0, multiplier: 10 })).toBe("(6d6) * 10");
    expect(toRollFormula({ dice: 2, adds: 2, multiplier: 3 })).toBe("(2d6 + 2) * 3");
    expect(toRollFormula({ dice: 2, adds: 2 })).toBe("2d6 + 2");
  });

  it("scales the range and the average", () => {
    const big = { dice: 6, adds: 0, multiplier: 10 };
    expect(minRoll(big)).toBe(60);
    expect(maxRoll(big)).toBe(360);
    expect(averageRoll(big)).toBe(210);
  });

  it("scales a rolled total", () => {
    // Every die reads 4, so 6d is 24 and the multiplier makes it 240.
    const rolled = rollDiceAdds({ dice: 6, adds: 0, multiplier: 10 }, () => 0.5);
    expect(rolled.total).toBe(240);
    expect(rolled.dice).toHaveLength(6);
  });

  it("keeps the multiplier when a modifier is added", () => {
    expect(addModifier({ dice: 6, adds: 0, multiplier: 10 }, 2)).toEqual({
      dice: 6,
      adds: 2,
      multiplier: 10,
    });
    expect(addModifier({ dice: 2, adds: 0 }, 1)).toEqual({ dice: 2, adds: 1 });
  });

  it("treats a missing or nonsense multiplier as none", () => {
    expect(minRoll({ dice: 2, adds: 0 })).toBe(2);
    expect(minRoll({ dice: 2, adds: 0, multiplier: 0 })).toBe(2);
  });
});
