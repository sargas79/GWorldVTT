/**
 * Where a character's points came from and where they went
 * (GURPS Basic Set: Characters p. 10; Campaigns pp. 292-294).
 *
 * A character has two kinds of points and they are not the same thing. The
 * first is what the campaign handed them at the start -- "the GM decides how
 * many character points the PCs get". The second is what they have earned
 * since, a few points at a time, at the end of each session.
 *
 * Adding them into one number loses the distinction the moment it matters:
 * a player wants to know what they have left to spend *now*, and a GM wants to
 * know what the character was built with and what the campaign has given them.
 * So both are kept, and what has been spent is counted against the sum.
 */

/** One award of earned points, as it was handed out. */
export interface PointAward {
  /** Points given. Negative for a correction, which is rarer but real. */
  points: number;
  /** What it was for -- "Session 12", "solved the murder". */
  note?: string;
  /** When it was awarded, as epoch milliseconds. Zero for one never stamped. */
  at?: number;
}

export interface PointsLedger {
  /** What the campaign started them with. */
  starting: number;
  /** What they have been awarded since, added up. */
  earned: number;
  /** Everything they have to spend: starting plus earned. */
  available: number;
  /** What the sheet's traits, skills and attributes come to. */
  spent: number;
  /** What is left. Negative when they have spent more than they have. */
  unspent: number;
  /** True when they are over their budget, which is allowed but worth saying. */
  overBudget: boolean;
}

/** What a list of awards comes to. */
export function earnedPoints(awards: readonly PointAward[]): number {
  return awards.reduce((sum, award) => sum + (Number(award.points) || 0), 0);
}

/**
 * The whole ledger, from what they started with, what they earned and what the
 * sheet says they spent.
 *
 * Spending past the total is flagged rather than prevented: a GM may allow it,
 * and a character part-way through being built is over and under by turns.
 */
export function pointsLedger(options: {
  starting: number;
  awards: readonly PointAward[];
  spent: number;
}): PointsLedger {
  const starting = Math.round(options.starting) || 0;
  const earned = Math.round(earnedPoints(options.awards));
  const available = starting + earned;
  const spent = Math.round(options.spent) || 0;

  return {
    starting,
    earned,
    available,
    spent,
    unspent: available - spent,
    overBudget: spent > available,
  };
}

/**
 * Awards ordered newest first, which is the order a log is read in.
 *
 * Anything never stamped with a time sorts to the end rather than the front:
 * an award with no date is older than one with, because stamping them is what
 * this system does and not stamping them is what an earlier version did.
 */
export function awardsNewestFirst(awards: readonly PointAward[]): PointAward[] {
  return [...awards].sort((a, b) => (Number(b.at) || 0) - (Number(a.at) || 0));
}
