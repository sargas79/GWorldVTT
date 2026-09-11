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

/**
 * The damage bonus for All-Out Attack (Strong), p. 365.
 *
 * "If you hit, you get +2 to damage -- or +1 damage per die, if that would be
 * better." Which is better depends on the weapon: a knife doing 1d gains 2, and
 * a maul doing 3d gains 3.
 *
 * "This only applies to melee attacks doing ST-based thrust or swing damage,
 * not to weapons such as force swords" -- which the caller decides, since the
 * dice alone cannot say where they came from.
 */
export function strongAttackDamageBonus(dice: number): number {
  return Math.max(2, Math.max(0, Math.floor(dice)));
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
   * Penalty to the target's active defenses against the feinter's next attack,
   * zero or negative to match every other defense modifier. Zero when the
   * feint achieved nothing.
   */
  defensePenalty: number;
}

/**
 * Resolves a Feint (GURPS Basic Set: Campaigns p. 365).
 *
 * Nearly a Quick Contest, but not quite one, and the difference matters twice:
 *
 * "If you fail your roll, your Feint is unsuccessful" -- so a feinter who
 * misses their own roll gains nothing, however badly the foe misses theirs. A
 * Quick Contest would hand the win to whoever failed by less.
 *
 * And when the foe fails, the penalty is the feinter's own margin of success,
 * not the two margins added together as a Quick Contest's margin of victory
 * would be.
 */
export function resolveFeint(
  feinter: { success: boolean; margin: number },
  defender: { success: boolean; margin: number },
): FeintResult {
  if (!feinter.success) return { success: false, defensePenalty: 0 };

  // "if you succeed, but your foe succeeds by as much as or more than you do,
  // your Feint fails."
  const penalty = defender.success ? feinter.margin - defender.margin : feinter.margin;
  if (penalty <= 0) return { success: false, defensePenalty: 0 };

  return { success: true, defensePenalty: -penalty };
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
