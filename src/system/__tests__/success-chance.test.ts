import { describe, expect, it } from "vitest";

import { THREE_D6, outcomeOf, successChance } from "../sheet-v2/success-chance.js";

describe("3d6", () => {
  it("counts all 216 throws", () => {
    expect(Object.values(THREE_D6).reduce((a, b) => a + b, 0)).toBe(216);
  });
});

describe("the chance of success", () => {
  it("is exactly half at 10", () => {
    expect(successChance(10).success).toBe(50);
  });

  it("matches the book's odds at the usual skill levels", () => {
    expect(successChance(12).success).toBe(74.1);
    expect(successChance(14).success).toBe(90.7);
    expect(successChance(16).success).toBe(98.1);
  });

  it("never falls below 3 or 4, nor rises past 16", () => {
    expect(successChance(0).success).toBe(1.9);
    expect(successChance(3).success).toBe(1.9);
    expect(successChance(25).success).toBe(98.1);
  });

  it("widens the critical success range at 15 and 16", () => {
    expect(successChance(14).criticalSuccess).toBe(1.9);
    expect(successChance(15).criticalSuccess).toBe(4.6);
    expect(successChance(16).criticalSuccess).toBe(9.3);
  });

  it("makes 17 a critical failure only at 15 or less, and any roll ten over", () => {
    expect(outcomeOf(17, 15)).toBe("criticalFailure");
    expect(outcomeOf(17, 16)).toBe("failure");
    expect(outcomeOf(15, 5)).toBe("criticalFailure");
    expect(outcomeOf(14, 5)).toBe("failure");
  });

  it("gives each total its outcome for the chart", () => {
    const { distribution } = successChance(12);
    expect(distribution).toHaveLength(16);
    expect(distribution.find((d) => d.roll === 12)?.outcome).toBe("success");
    expect(distribution.find((d) => d.roll === 13)?.outcome).toBe("failure");
  });
});
