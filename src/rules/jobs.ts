/**
 * Working for a living (GURPS Basic Set: Campaigns pp. 516-518).
 *
 * A job is a skill, a level of Wealth it pays at, and a risk. Once a month
 * the character rolls against the skill: "on a success, you earn your monthly
 * pay"; a critical success is worth a bonus, a raise or a promotion; a failure
 * costs the month's pay or the job; a critical failure costs the job and
 * brings the risk down on you -- a fine, an injury, a lawsuit, whatever the
 * job's entry says.
 *
 * What a failure by less than five costs is the GM's option in the book, and
 * this takes the gentler reading: the pay is lost and the job is kept. The
 * harsher one is a click away, since the card says what happened.
 */

/** How badly a job roll has to fail before the job goes with the pay. */
export const FIRED_AT_MARGIN = 5;

export interface JobOutcome {
  /** Months of pay earned: 0, 1, or 2 for a bonus month. */
  monthsPaid: number;
  /** True when the critical success is worth more than money: a raise or a promotion. */
  promoted: boolean;
  /** True when the job is gone. */
  fired: boolean;
  /** True when the job's risk lands as well. */
  risk: boolean;
}

/** What a month's roll came to (p. 517). */
export function jobRoll(outcome: {
  success: boolean;
  criticalSuccess?: boolean;
  criticalFailure?: boolean;
  /** Margin of failure, positive, on a failed roll. */
  margin?: number;
}): JobOutcome {
  if (outcome.criticalFailure) return { monthsPaid: 0, promoted: false, fired: true, risk: true };
  if (outcome.criticalSuccess) return { monthsPaid: 2, promoted: true, fired: false, risk: false };
  if (outcome.success) return { monthsPaid: 1, promoted: false, fired: false, risk: false };
  const margin = Math.abs(outcome.margin ?? 0);
  return { monthsPaid: 0, promoted: false, fired: margin >= FIRED_AT_MARGIN, risk: false };
}
