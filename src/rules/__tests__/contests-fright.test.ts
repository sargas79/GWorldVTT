import { describe, expect, it } from "vitest";

import {
  CONTEST_MIDPOINT,
  balanceContestScores,
  regularContest,
  regularContestRound,
} from "../contests.js";
import {
  FRIGHT_CHECK_CEILING,
  FRIGHT_CHECK_TABLE,
  frightCheckResult,
  frightCheckTotal,
  frightCheckWill,
} from "../fright.js";
import { resolveSuccess } from "../success.js";

describe("balancing a Regular Contest (Campaigns p. 349)", () => {
  it("leaves ordinary scores alone", () => {
    expect(balanceContestScores(12, 10)).toEqual({ first: 12, second: 10, adjusted: false });
    expect(balanceContestScores(13, 7)).toEqual({ first: 13, second: 7, adjusted: false });
  });

  /** "For a 5 vs. 3 Contest, add 7 to each score to make it 12 vs. 10." */
  it("lifts two low scores, keeping the gap", () => {
    expect(balanceContestScores(5, 3)).toEqual({ first: 12, second: 10, adjusted: true });
    expect(balanceContestScores(3, 5)).toEqual({ first: 10, second: 12, adjusted: true });
  });

  /** "For a 19 vs. 16 Contest, subtract 6 from each ... 13 vs. 10." */
  it("lowers two high scores, keeping the gap", () => {
    expect(balanceContestScores(19, 16)).toEqual({ first: 13, second: 10, adjusted: true });
    expect(balanceContestScores(16, 19)).toEqual({ first: 10, second: 13, adjusted: true });
  });

  /** "For a 600 vs. 500 Contest ... 12 vs. 10." */
  it("scales two enormous scores by their ratio", () => {
    expect(balanceContestScores(600, 500)).toEqual({ first: 12, second: 10, adjusted: true });
  });

  /**
   * Above 20 the difference means nothing -- 600 against 500 is not a
   * hundred-point contest -- so the scaling rule takes over from subtraction.
   */
  it("scales rather than subtracts once both are above 20", () => {
    expect(balanceContestScores(30, 25)).toEqual({ first: 12, second: 10, adjusted: true });
  });

  it("does not adjust when only one side is extreme", () => {
    expect(balanceContestScores(18, 9).adjusted).toBe(false);
    expect(balanceContestScores(6, 11).adjusted).toBe(false);
  });

  it("puts equal scores at the midpoint", () => {
    expect(balanceContestScores(5, 5)).toEqual({
      first: CONTEST_MIDPOINT,
      second: CONTEST_MIDPOINT,
      adjusted: true,
    });
  });
});

describe("one exchange of a Regular Contest", () => {
  const made = resolveSuccess(8, 12);
  const missed = resolveSuccess(15, 12);

  it("settles nothing while both succeed or both fail", () => {
    expect(regularContestRound(made, made)).toBeNull();
    expect(regularContestRound(missed, missed)).toBeNull();
  });

  it("is won by whoever made their roll alone", () => {
    expect(regularContestRound(made, missed)).toBe("first");
    expect(regularContestRound(missed, made)).toBe("second");
  });
});

describe("rolling out a whole Regular Contest", () => {
  /**
   * A scripted sequence of 3d totals, in the order the contest asks for them.
   * Synchronous, which the roller is allowed to be even though it need not be.
   */
  const scripted = (totals: number[]) => {
    let i = 0;
    return () => totals[Math.min(i++, totals.length - 1)]!;
  };

  it("keeps rolling until one side alone makes their roll", async () => {
    // Both succeed, both fail, then the first succeeds alone.
    const result = await regularContest({
      first: 12,
      second: 12,
      roll: scripted([8, 8, 16, 16, 9, 15]),
    });
    expect(result.rounds).toHaveLength(3);
    expect(result.outcome).toBe("first");
  });

  it("reports an unsettled contest rather than inventing a winner", async () => {
    // Both sides roll the same every time, so nothing is ever settled.
    const result = await regularContest({ first: 12, second: 12, roll: () => 8, maxRounds: 5 });
    expect(result.outcome).toBeNull();
    expect(result.rounds).toHaveLength(5);
  });

  it("rolls at the balanced scores, not the given ones", async () => {
    const result = await regularContest({ first: 5, second: 3, roll: () => 11 });
    expect(result.scores).toEqual({ first: 12, second: 10, adjusted: true });
    // 11 makes a 12 and misses a 10, which the raw scores could never show.
    expect(result.outcome).toBe("first");
  });

  it("always rolls at least once", async () => {
    const result = await regularContest({ first: 12, second: 12, roll: () => 8, maxRounds: 0 });
    expect(result.rounds).toHaveLength(1);
  });
});

describe("the Rule of 14 (Campaigns p. 360)", () => {
  it("caps Will at 13, so a 14 always fails", () => {
    expect(frightCheckWill(18)).toBe(FRIGHT_CHECK_CEILING);
    expect(frightCheckWill(14)).toBe(13);
  });

  it("leaves a Will below the cap alone, penalties included", () => {
    expect(frightCheckWill(10)).toBe(10);
    expect(frightCheckWill(-2)).toBe(-2);
  });
});

describe("the Fright Check Table (Campaigns pp. 360-361)", () => {
  it("runs unbroken from 4 to the open-ended end", () => {
    let expected = 4;
    for (const row of FRIGHT_CHECK_TABLE) {
      expect(row.from).toBe(expected);
      if (row.to === null) {
        expect(row).toBe(FRIGHT_CHECK_TABLE[FRIGHT_CHECK_TABLE.length - 1]);
        break;
      }
      expect(row.to).toBeGreaterThanOrEqual(row.from);
      expected = row.to + 1;
    }
  });

  it("reads the row a total lands on", () => {
    expect(frightCheckResult(4).effect).toBe("stunnedRecovers");
    expect(frightCheckResult(5).effect).toBe("stunnedRecovers");
    expect(frightCheckResult(13).effect).toBe("quirk");
    expect(frightCheckResult(21).effect).toBe("panic");
  });

  it("sends everything from 40 up to the last row", () => {
    expect(frightCheckResult(40).effect).toBe("comaAndPhobiaAndIq");
    expect(frightCheckResult(75).effect).toBe("comaAndPhobiaAndIq");
  });

  /** The dice cannot produce this, but a caller asking must still get a row. */
  it("clamps a total below the table to its first row", () => {
    expect(frightCheckResult(3)).toBe(FRIGHT_CHECK_TABLE[0]);
    expect(frightCheckResult(-4)).toBe(FRIGHT_CHECK_TABLE[0]);
  });

  it("adds the margin of failure to the roll", () => {
    expect(frightCheckTotal(11, 4)).toBe(15);
    expect(frightCheckTotal(11, 0)).toBe(11);
    // A margin is never negative; a Fright Check that succeeded is not rolled.
    expect(frightCheckTotal(11, -3)).toBe(11);
  });
});
