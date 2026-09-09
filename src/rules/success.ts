/**
 * Success rolls, critical results, and contests (GURPS Lite pp. 2-3).
 */

import { rollDice, type Rng } from "./dice.js";

/** The lowest effective skill at which a non-defense roll may be attempted. */
export const MINIMUM_EFFECTIVE_SKILL = 3;

export interface SuccessRollResult {
  /** The individual d6 results. */
  dice: number[];
  /** The 3d6 total. */
  roll: number;
  /** The target number the roll was made against. */
  effectiveSkill: number;
  success: boolean;
  criticalSuccess: boolean;
  criticalFailure: boolean;
  /** Margin of success or failure — always zero or positive. */
  margin: number;
}

/**
 * Whether a roll is a critical success (GURPS Lite p. 2).
 *
 * 3 and 4 always crit; 5 crits at effective skill 15+; 6 crits at 16+.
 */
export function isCriticalSuccess(roll: number, effectiveSkill: number): boolean {
  if (roll <= 4) return true;
  if (roll === 5) return effectiveSkill >= 15;
  if (roll === 6) return effectiveSkill >= 16;
  return false;
}

/**
 * Whether a roll is a critical failure (GURPS Lite p. 2).
 *
 * 18 always fumbles; 17 fumbles at effective skill 15 or less; and any roll that
 * misses by 10 or more is a critical failure.
 */
export function isCriticalFailure(roll: number, effectiveSkill: number): boolean {
  if (roll === 18) return true;
  if (roll === 17) return effectiveSkill <= 15;
  return roll >= effectiveSkill + 10;
}

/** Whether a success roll may be attempted at all (GURPS Lite p. 2). */
export function canAttempt(effectiveSkill: number): boolean {
  return effectiveSkill >= MINIMUM_EFFECTIVE_SKILL;
}

/**
 * Resolves an already-rolled 3d6 total against an effective skill.
 *
 * Rolls of 3 and 4 always succeed regardless of skill; 17 and 18 always fail.
 * Critical success takes precedence over critical failure, which matters only
 * for degenerate effective skills at or below -7.
 */
export function resolveSuccess(
  roll: number,
  effectiveSkill: number,
  dice: number[] = [],
): SuccessRollResult {
  const criticalSuccess = isCriticalSuccess(roll, effectiveSkill);
  const criticalFailure = !criticalSuccess && isCriticalFailure(roll, effectiveSkill);

  // A 17 or 18 always fails, however high the effective skill (GURPS Lite p. 2).
  const success = criticalSuccess ? true : roll >= 17 ? false : roll <= effectiveSkill;
  const margin = success
    ? Math.max(0, effectiveSkill - roll)
    : Math.max(0, roll - effectiveSkill);

  return { dice, roll, effectiveSkill, success, criticalSuccess, criticalFailure, margin };
}

/** Rolls 3d6 against an effective skill. */
export function successRoll(effectiveSkill: number, rng: Rng = Math.random): SuccessRollResult {
  const dice = rollDice(3, rng);
  const roll = dice.reduce((sum, d) => sum + d, 0);
  return resolveSuccess(roll, effectiveSkill, dice);
}

/**
 * Resolves an active defense roll (GURPS Lite p. 28).
 *
 * A 3 or 4 always defends successfully even against an effective defense of 1
 * or 2; 17 and 18 always fail. GURPS Lite defines no critical results for
 * active defenses, so none are reported.
 */
export function resolveDefense(
  roll: number,
  effectiveDefense: number,
  dice: number[] = [],
): SuccessRollResult {
  const success = roll <= 4 ? true : roll >= 17 ? false : roll <= effectiveDefense;
  const margin = success
    ? Math.max(0, effectiveDefense - roll)
    : Math.max(0, roll - effectiveDefense);

  return {
    dice,
    roll,
    effectiveSkill: effectiveDefense,
    success,
    criticalSuccess: false,
    criticalFailure: false,
    margin,
  };
}

/** Rolls 3d6 as an active defense. */
export function defenseRoll(effectiveDefense: number, rng: Rng = Math.random): SuccessRollResult {
  const dice = rollDice(3, rng);
  const roll = dice.reduce((sum, d) => sum + d, 0);
  return resolveDefense(roll, effectiveDefense, dice);
}

export type ContestOutcome = "first" | "second" | "tie";

/**
 * Resolves a Quick Contest (GURPS Lite p. 3).
 *
 * If one side succeeds and the other fails, the successful side wins. If both
 * succeed, the larger margin of success wins; if both fail, the smaller margin
 * of failure wins. Equal results are a tie, meaning nobody won.
 */
export function quickContest(
  first: SuccessRollResult,
  second: SuccessRollResult,
): { outcome: ContestOutcome; marginOfVictory: number } {
  if (first.success && !second.success) {
    return { outcome: "first", marginOfVictory: first.margin + second.margin };
  }
  if (!first.success && second.success) {
    return { outcome: "second", marginOfVictory: first.margin + second.margin };
  }

  // Both succeeded: highest margin wins. Both failed: lowest margin wins.
  const firstScore = first.success ? first.margin : -first.margin;
  const secondScore = second.success ? second.margin : -second.margin;

  if (firstScore === secondScore) return { outcome: "tie", marginOfVictory: 0 };
  return {
    outcome: firstScore > secondScore ? "first" : "second",
    marginOfVictory: Math.abs(firstScore - secondScore),
  };
}
