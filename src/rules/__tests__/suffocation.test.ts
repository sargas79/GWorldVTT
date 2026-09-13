import { describe, expect, it } from "vitest";

import { holdBreathSeconds } from "../suffocation.js";

describe("holding your breath (Campaigns p. 351)", () => {
  it("lasts HT x 10 at rest, HT x 4 under mild exertion, and HT under heavy", () => {
    expect(holdBreathSeconds({ health: 12, exertion: "none" })).toBe(120);
    expect(holdBreathSeconds({ health: 12, exertion: "mild" })).toBe(48);
    expect(holdBreathSeconds({ health: 12, exertion: "heavy" })).toBe(12);
  });

  it("stretches for hyperventilating, more on pure oxygen, and more again for Breath Control", () => {
    expect(holdBreathSeconds({ health: 10, exertion: "heavy", hyperventilated: "air" })).toBe(15);
    expect(holdBreathSeconds({ health: 10, exertion: "heavy", hyperventilated: "oxygen" })).toBe(25);
    expect(holdBreathSeconds({ health: 10, exertion: "heavy", hyperventilated: "air", breathControl: true })).toBe(22);
  });

  it("halves when a gas grenade gives no chance to breathe in first", () => {
    expect(holdBreathSeconds({ health: 10, exertion: "heavy", surprised: true })).toBe(5);
  });

  it("doubles for every level of Breath-Holding", () => {
    expect(holdBreathSeconds({ health: 10, exertion: "mild", breathHoldingLevels: 2 })).toBe(160);
  });
});
