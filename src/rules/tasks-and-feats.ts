/**
 * Tasks and Feats (Basic Set Revised pp. 570-571, 578): the Ham Clause, the
 * probability shortcuts for large groups, Expanded Influence Rolls and Basic
 * Abstract Difficulty. Quick-and-Dirty Modifiers is arithmetic on a
 * description, counted here for the GM screen's calculator.
 */

import type { Reaction } from "./reactions.js";

// ── Ham Clause (p. 570) ─────────────────────────────────────────────────────

/**
 * The penalty to every success roll for a disadvantage played up: -1 per -5
 * points, or fraction, of its value. A trait of 0 or more gives none.
 */
export function hamClausePenalty(points: number): number {
  const value = Number(points);
  if (!Number.isFinite(value) || value >= 0) return 0;
  return -Math.ceil(Math.abs(value) / 5);
}

/** Quick-and-Dirty Modifiers (p. 570): -1 per complication and intensifier, +1 per favourable qualifier. */
export function quickAndDirtyModifier(options: { complications?: number; intensifiers?: number; favourable?: number }): number {
  const count = (n: number | undefined) => Math.max(0, Math.floor(Number(n) || 0));
  return count(options.favourable) - count(options.complications) - count(options.intensifiers);
}

// ── Statistically Speaking (pp. 570-571) ────────────────────────────────────

/** A target under 3 counts as 3 here, "to account for variation within the group and blind luck". */
export function groupTarget(target: number): number {
  return Math.max(3, Math.floor(Number(target) || 0));
}

/** The fraction of a large group who succeed at a target of 3-10, or who fail at 11-18 (the divisor). */
const GROUP_DIVISORS: Readonly<Record<number, number>> = {
  3: 200, 4: 50, 5: 20, 6: 10, 7: 6, 8: 4, 9: 3, 10: 2,
  11: 3, 12: 4, 13: 6, 14: 10, 15: 20, 16: 50, 17: 100, 18: 200,
};

export interface GroupFraction {
  /** The target the table was read at, after the floor of 3. */
  target: number;
  /** Whether the fraction is of those who succeed (target 10 or less) or of those who fail. */
  of: "succeed" | "fail";
  /** The fraction is 1 over this. */
  divisor: number;
}

/** The table's row for a target; a target of 19 or more is read as 18, where the fraction is smallest. */
export function groupFraction(target: number): GroupFraction {
  const t = Math.min(18, groupTarget(target));
  return { target: t, of: t <= 10 ? "succeed" : "fail", divisor: GROUP_DIVISORS[t]! };
}

/**
 * How many of a large group succeed: the fraction applied and rounded down,
 * "the rest experience the opposite result". A fraction under 1 person means
 * everyone does the opposite.
 */
export function groupOutcome(target: number, size: number): { succeed: number; fail: number } {
  const total = Math.max(0, Math.floor(Number(size) || 0));
  const row = groupFraction(target);
  const counted = Math.floor(total / row.divisor);
  return row.of === "succeed"
    ? { succeed: counted, fail: total - counted }
    : { succeed: total - counted, fail: counted };
}

/**
 * The resistance a Contest against a group leaves once the "attacker" has
 * rolled once (p. 570): the average resistance less the margin of success,
 * never under 3. Null where the attacker failed and so affects no one.
 */
export function adjustedResistance(resistance: number, marginOfSuccess: number | null): number | null {
  if (marginOfSuccess === null || marginOfSuccess < 0) return null;
  return groupTarget(resistance - marginOfSuccess);
}

/** The group sizes the Collective Skill table lists. */
export const COLLECTIVE_SIZES: readonly number[] = [5, 10, 20, 50, 100, 200, 500];

/** Effective score by target (rows 3-10; 11 and up is 16 throughout) for each of {@link COLLECTIVE_SIZES}. */
const COLLECTIVE_ROWS: Readonly<Record<number, readonly number[]>> = {
  3: [4, 5, 6, 7, 9, 11, 14],
  4: [6, 7, 8, 11, 13, 16, 16],
  5: [8, 9, 11, 14, 16, 16, 16],
  6: [9, 11, 13, 16, 16, 16, 16],
  7: [11, 13, 16, 16, 16, 16, 16],
  8: [12, 15, 16, 16, 16, 16, 16],
  9: [14, 16, 16, 16, 16, 16, 16],
  10: [15, 16, 16, 16, 16, 16, 16],
};

/** The table's row for a target, "11+" being all 16. */
export function collectiveRow(target: number): readonly number[] {
  return COLLECTIVE_ROWS[groupTarget(target)] ?? COLLECTIVE_SIZES.map(() => 16);
}

/**
 * The effective score when only one of many must succeed (p. 571). A size
 * between two listed ones uses the lower; over 500 is 16; under 5 there is no
 * row, and the target itself is the answer (one to four rolls are rolled).
 */
export function collectiveScore(target: number, size: number): number {
  const count = Math.floor(Number(size) || 0);
  const base = groupTarget(target);
  if (count > 500) return 16;
  let index = -1;
  COLLECTIVE_SIZES.forEach((listed, i) => { if (count >= listed) index = i; });
  return index < 0 ? base : collectiveRow(base)[index]!;
}

// ── Expanded Influence Rolls (p. 571) ───────────────────────────────────────

/**
 * The reaction an Influence roll gives under the optional rule, from the
 * margin of the Quick Contest: positive for the influencer's victory, negative
 * for a loss, 0 for a tie. (The GM's option of a critical for 8 or more either
 * way is left to the table.)
 */
export function expandedInfluenceReaction(margin: number): Reaction {
  const m = Math.trunc(Number(margin) || 0);
  if (m >= 8) return "excellent";
  if (m >= 5) return "veryGood";
  if (m >= 1) return "good";
  if (m === 0) return "neutral";
  if (m >= -2) return "poor";
  if (m >= -4) return "bad";
  if (m >= -7) return "veryBad";
  return "disastrous";
}

// ── Basic Abstract Difficulty (p. 578) ──────────────────────────────────────

/** BAD is a penalty from 0 to -10. Any input is read as a penalty, so 5 and -5 both give -5. */
export function clampBad(value: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n === 0) return 0;
  return -Math.min(10, Math.floor(Math.abs(n)));
}

/** An unstatted NPC's effective skill: 10 plus the absolute value of BAD. */
export function abstractNpcSkill(bad: number): number {
  return 10 + Math.abs(clampBad(bad));
}

/** A suggested BAD for a known enemy group: its point value as an Enemy, divided by 4, dropping fractions. */
export function suggestedBad(enemyPoints: number): number {
  return clampBad(Math.floor(Math.abs(Number(enemyPoints) || 0) / 4));
}
