/**
 * The chance of making a success roll on 3d6 (Characters pp. 343-348).
 *
 * "A roll of 3 or 4 is always a success"; "a roll of 17 or 18 is always a
 * failure". A 5 is a critical success at effective skill 15 and a 6 at 16; an
 * 18 is always a critical failure, a 17 is one at effective skill 15 or less,
 * and so is any roll ten or more over the effective skill.
 *
 * Worked out by counting the 216 ways three dice fall, so the figures are
 * exact rather than simulated.
 */

/** How many of the 216 throws of 3d6 come to each total, 3 through 18. */
export const THREE_D6: Readonly<Record<number, number>> = {
  3: 1, 4: 3, 5: 6, 6: 10, 7: 15, 8: 21, 9: 25, 10: 27,
  11: 27, 12: 25, 13: 21, 14: 15, 15: 10, 16: 6, 17: 3, 18: 1,
};

export type RollOutcome = "criticalSuccess" | "success" | "failure" | "criticalFailure";

/** What a single total does against an effective skill. */
export function outcomeOf(roll: number, target: number): RollOutcome {
  if (roll <= 4 || (roll === 5 && target >= 15) || (roll === 6 && target >= 16)) return "criticalSuccess";
  if (roll === 18 || (roll === 17 && target <= 15) || roll - target >= 10) return "criticalFailure";
  if (roll >= 17) return "failure";
  return roll <= target ? "success" : "failure";
}

export interface SuccessChance {
  target: number;
  /** Percentages, 0-100, to one decimal place. A critical success counts as a success. */
  success: number;
  criticalSuccess: number;
  criticalFailure: number;
  /** Each total with how often it comes up and what it does, for a chart. */
  distribution: Array<{ roll: number; ways: number; percent: number; outcome: RollOutcome }>;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** The chance of success, and of each critical, against an effective skill. */
export function successChance(target: number): SuccessChance {
  const t = Math.round(Number(target) || 0);
  let success = 0;
  let critSuccess = 0;
  let critFailure = 0;
  const distribution: SuccessChance["distribution"] = [];
  for (let roll = 3; roll <= 18; roll++) {
    const ways = THREE_D6[roll]!;
    const outcome = outcomeOf(roll, t);
    if (outcome === "success" || outcome === "criticalSuccess") success += ways;
    if (outcome === "criticalSuccess") critSuccess += ways;
    if (outcome === "criticalFailure") critFailure += ways;
    distribution.push({ roll, ways, percent: round1((ways / 216) * 100), outcome });
  }
  return {
    target: t,
    success: round1((success / 216) * 100),
    criticalSuccess: round1((critSuccess / 216) * 100),
    criticalFailure: round1((critFailure / 216) * 100),
    distribution,
  };
}
