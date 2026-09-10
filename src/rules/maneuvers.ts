/**
 * Combat maneuvers and the manoeuvre-driven rules that go with them
 * (GURPS Basic Set: Campaigns pp. 363-367, 378).
 *
 * GURPS Lite offers nine maneuvers. The Basic Set adds Evaluate, Feint and
 * Wait, and defines what each one permits by way of movement and active
 * defense — which is what makes the maneuver choice matter mechanically rather
 * than being a label.
 */

import type { DamageType } from "./types.js";

export type Maneuver =
  | "doNothing"
  | "move"
  | "changePosture"
  | "aim"
  | "evaluate"
  | "attack"
  | "feint"
  | "allOutAttack"
  | "moveAndAttack"
  | "allOutDefense"
  | "concentrate"
  | "ready"
  | "wait";

/** How far a maneuver lets you move. */
export type MovementAllowance = "none" | "step" | "half" | "full";

/** Which active defenses a maneuver leaves available. */
export type DefenseAllowance = "any" | "none" | "dodgeAndBlockOnly";

export interface ManeuverInfo {
  key: Maneuver;
  label: string;
  movement: MovementAllowance;
  defense: DefenseAllowance;
  /** True when the maneuver itself makes an attack. */
  attacks: boolean;
}

export const MANEUVERS: Record<Maneuver, ManeuverInfo> = {
  doNothing: { key: "doNothing", label: "Do Nothing", movement: "none", defense: "any", attacks: false },
  move: { key: "move", label: "Move", movement: "full", defense: "any", attacks: false },
  changePosture: { key: "changePosture", label: "Change Posture", movement: "none", defense: "any", attacks: false },
  aim: { key: "aim", label: "Aim", movement: "step", defense: "any", attacks: false },
  evaluate: { key: "evaluate", label: "Evaluate", movement: "step", defense: "any", attacks: false },
  attack: { key: "attack", label: "Attack", movement: "step", defense: "any", attacks: true },
  feint: { key: "feint", label: "Feint", movement: "step", defense: "any", attacks: false },
  // All-Out Attack trades every defense for offence.
  allOutAttack: { key: "allOutAttack", label: "All-Out Attack", movement: "half", defense: "none", attacks: true },
  // Move and Attack forbids parrying specifically, not defending outright.
  moveAndAttack: { key: "moveAndAttack", label: "Move and Attack", movement: "full", defense: "dodgeAndBlockOnly", attacks: true },
  allOutDefense: { key: "allOutDefense", label: "All-Out Defense", movement: "half", defense: "any", attacks: false },
  concentrate: { key: "concentrate", label: "Concentrate", movement: "step", defense: "any", attacks: false },
  ready: { key: "ready", label: "Ready", movement: "step", defense: "any", attacks: false },
  wait: { key: "wait", label: "Wait", movement: "none", defense: "any", attacks: false },
};

/** All-Out Attack options (GURPS Basic Set: Campaigns p. 365). */
export type AllOutAttackOption = "determined" | "double" | "feint" | "strong";

/** The to-hit bonus an All-Out Attack option grants, if any. */
export function allOutAttackBonus(option: AllOutAttackOption, ranged = false): number {
  if (ranged) return option === "determined" ? 1 : 0;
  return option === "determined" ? 4 : 0;
}

/** All-Out Defense options (GURPS Basic Set: Campaigns p. 366). */
export type AllOutDefenseOption = "increased" | "double";

/**
 * The maximum bonus repeated Evaluate maneuvers can accumulate
 * (GURPS Basic Set: Campaigns p. 364).
 */
export const MAX_EVALUATE_BONUS = 3;

/** Evaluate gives +1 per consecutive turn spent evaluating, capped at +3. */
export function evaluateBonus(consecutiveTurns: number): number {
  return Math.max(0, Math.min(MAX_EVALUATE_BONUS, Math.floor(consecutiveTurns)));
}

export interface FeintResult {
  /** True when the feint landed. */
  success: boolean;
  /**
   * Penalty applied to the target's active defenses against the feinter's next
   * attack. Zero when the feint failed.
   */
  defensePenalty: number;
}

/**
 * Resolves a Feint as a Quick Contest (GURPS Basic Set: Campaigns p. 365).
 *
 * The winner's margin of victory becomes a penalty to the loser's defenses
 * against the feinter's next attack. A feint that ties or loses achieves
 * nothing — it never helps the defender.
 */
export function resolveFeint(feinterMargin: number, defenderMargin: number): FeintResult {
  const difference = feinterMargin - defenderMargin;
  if (difference <= 0) return { success: false, defensePenalty: 0 };
  return { success: true, defensePenalty: difference };
}

export interface KnockbackInput {
  /** Damage rolled BEFORE subtracting DR — knockback ignores armor. */
  basicDamage: number;
  type: DamageType;
  /** Whether the blow got through the target's DR. */
  penetratedDr: boolean;
  /** The target's ST, or its HP when it has no ST (a wall, say). */
  targetStrength: number;
}

export interface KnockbackResult {
  /** Yards the target is pushed back. */
  yards: number;
  /**
   * Penalty to the target's roll to stay standing: -1 per yard after the first.
   * Zero when there is no knockback.
   */
  fallRollPenalty: number;
}

/**
 * Knockback (GURPS Basic Set: Campaigns p. 378).
 *
 * Only crushing and cutting attacks cause it, and the two behave differently:
 * a crushing blow knocks back whether or not it penetrates DR, while a cutting
 * blow only does so when it fails to penetrate — a cut that gets through wounds
 * instead of shoving.
 *
 * Distance is one yard per full multiple of the target's ST-2, computed from
 * damage before DR. Very weak targets are shoved a yard per point.
 */
export function knockback({
  basicDamage,
  type,
  penetratedDr,
  targetStrength,
}: KnockbackInput): KnockbackResult {
  const causes = type === "cr" || (type === "cut" && !penetratedDr);
  if (!causes || basicDamage <= 0) return { yards: 0, fallRollPenalty: 0 };

  const perYard = targetStrength <= 3 ? 1 : targetStrength - 2;
  const yards = Math.floor(basicDamage / perYard);

  return { yards, fallRollPenalty: yards > 1 ? -(yards - 1) : 0 };
}

/** Whether a maneuver permits parrying at all. */
export function canParryWith(maneuver: Maneuver): boolean {
  const info = MANEUVERS[maneuver];
  return info.defense === "any";
}

/** Whether a maneuver permits any active defense. */
export function canDefendWith(maneuver: Maneuver): boolean {
  return MANEUVERS[maneuver].defense !== "none";
}

/** Every maneuver, in the order a combat UI should offer them. */
export const MANEUVER_ORDER: readonly Maneuver[] = [
  "doNothing", "move", "changePosture", "ready", "aim", "evaluate",
  "attack", "feint", "allOutAttack", "moveAndAttack", "allOutDefense",
  "concentrate", "wait",
];
