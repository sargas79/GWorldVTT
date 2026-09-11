/**
 * Regular Contests (GURPS Basic Set: Campaigns pp. 348-349).
 *
 * The other kind of contest. A Quick Contest is settled by one roll each; a
 * Regular Contest is arm wrestling -- both sides roll again and again, and
 * nothing happens until one makes their roll on a turn the other misses theirs.
 *
 * What makes it worth writing down rather than leaving to two people rolling
 * dice is the Extreme Scores rule, which exists because the naive version
 * either never ends or ends at once: two contestants at skill 5 spend a dozen
 * rolls both failing, and two at 17 spend a dozen rolls both succeeding.
 */

import { resolveSuccess, type SuccessRollResult } from "./success.js";

/** The score a Regular Contest is normalised around. */
export const CONTEST_MIDPOINT = 10;

/** Two scores as a contest will actually be rolled. */
export interface ContestScores {
  first: number;
  second: number;
  /** True when the scores were moved to keep the contest from bogging down. */
  adjusted: boolean;
}

/**
 * The scores a Regular Contest is rolled at (p. 349).
 *
 * Both low: "raise the lower score to 10 and add the same amount to the higher
 * score". Both high: the mirror image. Both above 20, where subtracting is not
 * enough: the lower becomes 10 and the higher is scaled by the same ratio.
 *
 * The gap between the two is what decides the contest, so every one of these
 * preserves it -- except the scaling case, where it cannot be preserved and the
 * ratio is kept instead.
 */
export function balanceContestScores(first: number, second: number): ContestScores {
  const lower = Math.min(first, second);
  const higher = Math.max(first, second);
  const unchanged = { first, second, adjusted: false };

  // Above 20 the difference is meaningless -- ST 600 against ST 500 is not a
  // hundred-point contest -- so the ratio is what carries over.
  if (lower > 20) {
    const scaled = Math.floor((higher * CONTEST_MIDPOINT) / lower);
    return withHigher(first, second, scaled, CONTEST_MIDPOINT);
  }

  if (lower <= 6 && higher <= 6) {
    const shift = CONTEST_MIDPOINT - lower;
    return withHigher(first, second, higher + shift, CONTEST_MIDPOINT);
  }

  if (lower >= 14) {
    const shift = lower - CONTEST_MIDPOINT;
    return withHigher(first, second, higher - shift, CONTEST_MIDPOINT);
  }

  return unchanged;
}

/** Puts the two adjusted scores back on the side each of them came from. */
function withHigher(
  first: number,
  second: number,
  higher: number,
  lower: number,
): ContestScores {
  return first >= second
    ? { first: higher, second: lower, adjusted: true }
    : { first: lower, second: higher, adjusted: true };
}

/**
 * Who won an exchange. There is no tie: an exchange that settles nothing is
 * not a draw, it is a re-roll, which is what the null says.
 */
export type RegularContestOutcome = "first" | "second";

/**
 * One exchange of a Regular Contest.
 *
 * Returns who won, or null when nothing was settled -- both made their rolls or
 * both missed them, "the competitors' relative positions are unchanged and they
 * roll again".
 */
export function regularContestRound(
  first: SuccessRollResult,
  second: SuccessRollResult,
): RegularContestOutcome | null {
  if (first.success === second.success) return null;
  return first.success ? "first" : "second";
}

/** One exchange, as it happened. */
export interface ContestRound {
  first: SuccessRollResult;
  second: SuccessRollResult;
  outcome: RegularContestOutcome | null;
}

/**
 * Rolls a whole Regular Contest, given something to roll 3d with.
 *
 * `maxRounds` is a stop, not a rule: even balanced scores can go a long way,
 * and a contest that has gone thirty exchanges is one the GM should be settling
 * rather than one the dice should keep chewing on. An unsettled contest returns
 * a null outcome rather than pretending somebody won.
 */
export function regularContest(options: {
  first: number;
  second: number;
  roll: () => number;
  maxRounds?: number;
}): { scores: ContestScores; rounds: ContestRound[]; outcome: RegularContestOutcome | null } {
  const { roll, maxRounds = 20 } = options;
  const scores = balanceContestScores(options.first, options.second);
  const rounds: ContestRound[] = [];

  for (let i = 0; i < Math.max(1, maxRounds); i += 1) {
    const first = resolveSuccess(roll(), scores.first);
    const second = resolveSuccess(roll(), scores.second);
    const outcome = regularContestRound(first, second);
    rounds.push({ first, second, outcome });
    if (outcome) return { scores, rounds, outcome };
  }

  return { scores, rounds, outcome: null };
}
