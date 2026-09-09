import { describe, expect, it } from "vitest";

import {
  canAttempt,
  isCriticalFailure,
  isCriticalSuccess,
  quickContest,
  resolveDefense,
  resolveSuccess,
  successRoll,
} from "../success.js";

describe("success rolls (GURPS Lite p. 2)", () => {
  it("succeeds when the roll is at or below effective skill", () => {
    expect(resolveSuccess(12, 12).success).toBe(true);
    expect(resolveSuccess(13, 12).success).toBe(false);
  });

  it("reports the margin of success from the p. 2 example: skill 18, roll 12", () => {
    const result = resolveSuccess(12, 18);
    expect(result.success).toBe(true);
    expect(result.margin).toBe(6);
  });

  it("reports the margin of failure from the p. 2 example: skill 9, roll 12", () => {
    const result = resolveSuccess(12, 9);
    expect(result.success).toBe(false);
    expect(result.margin).toBe(3);
  });

  it("always succeeds on 3 or 4 no matter how low the skill", () => {
    expect(resolveSuccess(3, 1).success).toBe(true);
    expect(resolveSuccess(4, -5).success).toBe(true);
  });

  it("always fails on 17 or 18 no matter how high the skill", () => {
    expect(resolveSuccess(17, 25).success).toBe(false);
    expect(resolveSuccess(18, 25).success).toBe(false);
  });

  it("blocks attempts below effective skill 3", () => {
    expect(canAttempt(3)).toBe(true);
    expect(canAttempt(2)).toBe(false);
  });
});

describe("critical success", () => {
  it("crits on 3 and 4 at any skill", () => {
    expect(isCriticalSuccess(3, 5)).toBe(true);
    expect(isCriticalSuccess(4, 5)).toBe(true);
  });

  it("crits on 5 only at skill 15 or better", () => {
    expect(isCriticalSuccess(5, 14)).toBe(false);
    expect(isCriticalSuccess(5, 15)).toBe(true);
  });

  it("crits on 6 only at skill 16 or better", () => {
    expect(isCriticalSuccess(6, 15)).toBe(false);
    expect(isCriticalSuccess(6, 16)).toBe(true);
  });

  it("does not crit on 7 at any skill", () => {
    expect(isCriticalSuccess(7, 30)).toBe(false);
  });
});

describe("critical failure", () => {
  it("always fumbles on 18", () => {
    expect(isCriticalFailure(18, 30)).toBe(true);
  });

  it("fumbles on 17 only at skill 15 or less", () => {
    expect(isCriticalFailure(17, 15)).toBe(true);
    expect(isCriticalFailure(17, 16)).toBe(false);
  });

  it("fumbles on any roll 10 or more over effective skill", () => {
    // The rules give 16 on a skill of 6 and 15 on a skill of 5 as examples.
    expect(isCriticalFailure(16, 6)).toBe(true);
    expect(isCriticalFailure(15, 5)).toBe(true);
    expect(isCriticalFailure(15, 6)).toBe(false);
  });

  it("treats a 17 at high skill as an ordinary failure", () => {
    const result = resolveSuccess(17, 16);
    expect(result.success).toBe(false);
    expect(result.criticalFailure).toBe(false);
  });
});

describe("active defense rolls (GURPS Lite p. 28)", () => {
  it("always succeeds on 3 or 4 even against an effective defense of 1", () => {
    expect(resolveDefense(3, 1).success).toBe(true);
    expect(resolveDefense(4, 2).success).toBe(true);
  });

  it("always fails on 17 or 18", () => {
    expect(resolveDefense(17, 20).success).toBe(false);
    expect(resolveDefense(18, 20).success).toBe(false);
  });

  it("reports no critical results, which GURPS Lite does not define for defenses", () => {
    const result = resolveDefense(3, 10);
    expect(result.criticalSuccess).toBe(false);
    expect(result.criticalFailure).toBe(false);
  });
});

describe("quick contests (GURPS Lite p. 3)", () => {
  const roll = (value: number, skill: number) => resolveSuccess(value, skill);

  it("gives the win to the only side that succeeded", () => {
    expect(quickContest(roll(8, 12), roll(14, 12)).outcome).toBe("first");
    expect(quickContest(roll(14, 12), roll(8, 12)).outcome).toBe("second");
  });

  it("gives the win to the larger margin when both succeed", () => {
    // Margins of 4 and 2.
    expect(quickContest(roll(8, 12), roll(10, 12)).outcome).toBe("first");
  });

  it("gives the win to the smaller margin when both fail", () => {
    // Margins of failure 1 and 3.
    expect(quickContest(roll(13, 12), roll(15, 12)).outcome).toBe("first");
  });

  it("reports a tie when nobody won", () => {
    expect(quickContest(roll(10, 12), roll(10, 12)).outcome).toBe("tie");
  });
});

describe("rolling", () => {
  it("produces totals in the 3-18 range and reports three dice", () => {
    let sequence = 0;
    const rng = () => [0, 0.5, 0.99][sequence++ % 3]!;

    const result = successRoll(12, rng);
    expect(result.dice).toHaveLength(3);
    expect(result.roll).toBe(result.dice.reduce((a, b) => a + b, 0));
    expect(result.roll).toBeGreaterThanOrEqual(3);
    expect(result.roll).toBeLessThanOrEqual(18);
  });
});
