/**
 * Complementary skills and team efforts (GURPS Basic Set Revised pp. 206
 * and 185; long tasks p. 346).
 *
 * A complementary skill is rolled before the master skill it assists, at
 * personal modifiers only, and the outcome is a modifier to the master roll:
 *
 *   critical success, or a Quick Contest won by 5+  +2
 *   success, or a Quick Contest won by 0-4           +1
 *   failure, or a Quick Contest lost by 1-4          -1
 *   critical failure, or a Quick Contest lost by 5+  -2
 *
 * Bonuses don't chain, and a long task that involves several PCs may take
 * several complementary skills at once, the total capped at +4. A team
 * effort is one roll for the whole party at the best member's skill, plus the
 * number of members who know the skill, less the size of the group.
 */

/** The most several complementary skills add to one master skill on a long task (p. 206). */
export const COMPLEMENTARY_CAP = 4;

/** What a complementary skill roll came to, in either of the two forms the table reads. */
export type ComplementaryOutcome =
  /** An uncontested roll. */
  | { success: boolean; criticalSuccess?: boolean; criticalFailure?: boolean }
  /** A Quick Contest: the margin of victory, negative for a loss (a tie is 0). */
  | { contestMargin: number };

/** The modifier a complementary skill roll gives the master skill: +2, +1, -1 or -2 (p. 206). */
export function complementaryBonus(outcome: ComplementaryOutcome): 2 | 1 | -1 | -2 {
  if ("contestMargin" in outcome) {
    const margin = outcome.contestMargin;
    if (margin >= 5) return 2;
    if (margin >= 0) return 1;
    return margin <= -5 ? -2 : -1;
  }
  if (outcome.criticalSuccess) return 2;
  if (outcome.criticalFailure) return -2;
  return outcome.success ? 1 : -1;
}

/**
 * A Quick Contest's result as the signed margin the table reads: the margin of
 * victory when the complementary roller won, minus it when they lost.
 */
export function contestMarginFor(result: {
  outcome: "first" | "second" | "tie";
  marginOfVictory: number;
}): number {
  if (result.outcome === "first") return result.marginOfVictory;
  if (result.outcome === "second") return -result.marginOfVictory;
  return 0;
}

/** What the complementary skills held for one master skill add up to: their sum, never above +4 (p. 206). */
export function complementaryTotal(values: readonly number[]): number {
  return Math.min(
    COMPLEMENTARY_CAP,
    values.reduce((sum, value) => sum + value, 0),
  );
}

/**
 * How much of a new complementary modifier a master skill can still take on a
 * long task: all of a penalty, and a bonus only up to the +4 the skills
 * already held leave room for.
 */
export function complementaryRoom(held: readonly number[], value: number): number {
  if (value <= 0) return value;
  const sum = held.reduce((total, v) => total + v, 0);
  return Math.max(0, Math.min(value, COMPLEMENTARY_CAP - sum));
}

/** One member of a team, as a team effort reads them. */
export interface TeamMember {
  /** The member's level in the skill, or null for one without the skill. */
  level: number | null;
  /** Character points in it: a defaulted skill (no points) doesn't count. */
  points: number;
}

/** A team effort's roll (p. 185). */
export interface TeamEffort {
  /** The group's best skill level. */
  best: number;
  /** How many of the group know the skill: at least a point in it, no defaults. */
  bonus: number;
  /** The group's size, which comes off the roll. */
  penalty: number;
  /** What the single roll is made against. */
  effective: number;
}

/**
 * The roll a team makes as one (p. 185): the best skill level in the group,
 * plus the number who know the skill, minus the size of the group. Null where
 * nobody in it knows the skill, since defaults don't count.
 */
export function teamEffort(members: readonly TeamMember[]): TeamEffort | null {
  const knowers = members.filter(
    (m) => m.level !== null && Number.isFinite(m.level) && m.points > 0,
  );
  if (knowers.length === 0) return null;
  const best = Math.max(...knowers.map((m) => m.level as number));
  const bonus = knowers.length;
  const penalty = members.length;
  return { best, bonus, penalty, effective: best + bonus - penalty };
}
