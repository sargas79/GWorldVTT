/**
 * Working for a living (GURPS Basic Set: Campaigns pp. 516-518).
 *
 * "At the end of every month in which a character works, he must roll
 * against one of the prerequisite skills for his job." What the roll is worth
 * depends on the kind of job. "Most jobs offer a fixed wage or salary. On
 * anything but a critical success or critical failure, the worker collects
 * the monthly pay ... On a critical success, he gets a 10% permanent raise."
 * Freelance work "on commission" is paid by the margin: "the worker earns the
 * monthly pay if he makes his job roll exactly. For greater success, increase
 * that month's income by 10% times the margin of success; a critical success
 * triples the month's income! On a failure, decrease that month's income by
 * 10% times the margin of failure."
 *
 * "For any kind of job, a critical failure is always bad. At best, the worker
 * will earn no pay for the month." The rest of what it might mean --
 * demotion, lost savings, the sack, an injury, an arrest -- is the GM's, and
 * the card says so.
 */

export type JobKind = "wage" | "freelance";

export interface JobOutcome {
  /** The month's income as a multiple of the monthly pay: 1 for the pay itself. */
  payMultiplier: number;
  /** A critical success at a wage: "a 10% permanent raise". */
  raise: boolean;
  /** A critical failure, which "is always bad" and is the GM's to name. */
  disaster: boolean;
}

/** The raise a critical success at a fixed wage is worth. */
export const CRITICAL_RAISE = 0.1;

/** What a month's roll came to (p. 516). */
export function jobRoll(options: {
  kind: JobKind;
  success: boolean;
  criticalSuccess?: boolean;
  criticalFailure?: boolean;
  /** Margin of success (positive) or failure (negative). */
  margin?: number;
}): JobOutcome {
  if (options.criticalFailure) return { payMultiplier: 0, raise: false, disaster: true };

  if (options.kind === "wage") {
    return { payMultiplier: 1, raise: options.criticalSuccess === true, disaster: false };
  }

  if (options.criticalSuccess) return { payMultiplier: 3, raise: false, disaster: false };
  const margin = options.margin ?? 0;
  const swing = options.success ? Math.max(0, margin) : -Math.abs(margin);
  return { payMultiplier: Math.max(0, 1 + 0.1 * swing), raise: false, disaster: false };
}
