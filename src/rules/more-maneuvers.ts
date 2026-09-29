/**
 * More maneuvers (GURPS Basic Set, Fourth Edition Revised, Addendum 4, pp.
 * 575-576): All-Out Attack with slams, All-Out Concentrate, All-Out Defense
 * (Mental Defense), Committed Attack and Defensive Attack.
 *
 * Pure figures only; the wiring is in `system/more-maneuvers.ts`.
 */

import type { DefenseAllowance, MovementAllowance } from "./maneuvers.js";

/** The maneuvers this addendum adds, beside the Basic Set's. */
export type AddendumManeuver = "committedAttack" | "defensiveAttack" | "allOutConcentrate";

export interface AddendumManeuverInfo {
  key: AddendumManeuver;
  label: string;
  movement: MovementAllowance;
  defense: DefenseAllowance;
  attacks: boolean;
}

/**
 * What each allows (pp. 575-576). Committed Attack's refusals depend on how
 * the attack is made, so it reads "any" here and `committedRefuses` narrows it.
 */
export const ADDENDUM_MANEUVERS: Record<AddendumManeuver, AddendumManeuverInfo> = {
  committedAttack: { key: "committedAttack", label: "Committed Attack", movement: "step", defense: "any", attacks: true },
  defensiveAttack: { key: "defensiveAttack", label: "Defensive Attack", movement: "step", defense: "any", attacks: true },
  allOutConcentrate: { key: "allOutConcentrate", label: "All-Out Concentrate", movement: "step", defense: "none", attacks: false },
};

export const ADDENDUM_MANEUVER_ORDER: readonly AddendumManeuver[] = ["committedAttack", "defensiveAttack", "allOutConcentrate"];

/** Whether a key is one of the maneuvers above. */
export function isAddendumManeuver(key: string): key is AddendumManeuver {
  return Object.prototype.hasOwnProperty.call(ADDENDUM_MANEUVERS, key);
}

// ── All-Out Attack with slams ──────────────────────────────────────────────

/**
 * How far an All-Out Attack that slams may move (p. 575): full Move, forward
 * only, for Determined, Feint or Strong; half Move for Double, which lets one
 * more melee attack come before the slam.
 */
export function allOutSlamMovement(option: string): { movement: "full" | "half"; forwardOnly: boolean; extraAttack: boolean } {
  if (option === "double") return { movement: "half", forwardOnly: true, extraAttack: true };
  return { movement: "full", forwardOnly: true, extraAttack: false };
}

/** Whether an All-Out Attack option may slam at all: the three the book names, and Double for its half Move. */
export function allOutMaySlam(option: string): boolean {
  return option === "determined" || option === "feint" || option === "strong" || option === "double";
}

// ── All-Out Concentrate ────────────────────────────────────────────────────

/** +1 to the task concentrated on (p. 575). */
export const ALL_OUT_CONCENTRATE_BONUS = 1;

/** The Will roll to keep concentrating through a distraction: Will-3, at +1 on this maneuver. */
export function distractionPenalty(allOutConcentrate: boolean, usual = -3): number {
  return allOutConcentrate ? usual + ALL_OUT_CONCENTRATE_BONUS : usual;
}

/**
 * Whether every turn of a run of concentration so far was All-Out Concentrate,
 * after a turn ends on this maneuver: null once anything else is done (the
 * run is over), false once a plain Concentrate is in it, true otherwise
 * (p. 575: "you get the +1 only if you take All-Out Concentrate the entire
 * time").
 */
export function concentrationRunAfterTurn(allOutSoFar: boolean | null, maneuver: string): boolean | null {
  if (maneuver === "allOutConcentrate") return allOutSoFar === false ? false : true;
  if (maneuver === "concentrate") return false;
  return null;
}

/**
 * Whether All-Out Concentrate's +1 applies to a roll: the actor is on the
 * maneuver, and it has been All-Out Concentrate the whole time. A distraction
 * roll takes the +1 on the maneuver alone ("Will-2 ... at +1 for this
 * maneuver").
 */
export function allOutConcentrateApplies(options: { maneuver: string; allOutSoFar: boolean | null; distraction?: boolean }): boolean {
  if (options.maneuver !== "allOutConcentrate") return false;
  return options.distraction === true || options.allOutSoFar !== false;
}

/**
 * The steps a maneuver allows (pp. 575-576): a step is one, Committed Attack
 * may take a second, and a Giant Step (p. 571) adds another. A maneuver that
 * allows no step, or moves further than one, counts none.
 */
export function maneuverSteps(options: { movement: MovementAllowance; secondStep?: boolean; giantStep?: boolean }): number {
  if (options.movement !== "step") return 0;
  return 1 + (options.secondStep ? 1 : 0) + (options.giantStep ? 1 : 0);
}

/** The +2 a Defensive Attack with a kick gives DX rolls to avoid falling (p. 576). */
export const DEFENSIVE_KICK_BALANCE = 2;

/** What an attack made before an All-Out Attack (Double)'s slam may be: another melee attack, at half Move (p. 575). */
export function slamAllowsAttackBefore(option: string): boolean {
  return allOutSlamMovement(option).extraAttack;
}

/** +2 to resist supernatural attacks until the next turn (p. 575). */
export const MENTAL_DEFENSE_BONUS = 2;

// ── Committed Attack ───────────────────────────────────────────────────────

export type CommittedKind = "determined" | "strong";

/** What the attacker attacks with, which decides the defense it costs (p. 576). */
export type CommittedWith = "hand" | "shield" | "kick" | "other";

/** The to-hit line: Determined +2, and -2 for the second step. */
export function committedToHit(kind: string, secondStep: boolean): number {
  return (kind === "determined" ? 2 : 0) + (secondStep ? -2 : 0);
}

/**
 * Strong: +1 damage, or +1 per two full dice of basic damage if better; ST-based
 * damage only (p. 575).
 */
export function committedDamageBonus(kind: string, dice: number, stBased: boolean): number {
  if (kind !== "strong" || !stBased) return 0;
  return Math.max(1, Math.floor(Math.max(0, dice) / 2));
}

/** The penalty on every defense that stays open. */
export const COMMITTED_DEFENSE_PENALTY = -2;

/**
 * The defense a Committed Attack costs outright (p. 576): no parry with the
 * hand that attacks, no block if the shield or cloak attacked, no dodge after a
 * kick. And no retreat, ever.
 */
export function committedRefuses(attackedWith: string, defense: "dodge" | "parry" | "block"): boolean {
  return (attackedWith === "hand" && defense === "parry")
    || (attackedWith === "shield" && defense === "block")
    || (attackedWith === "kick" && defense === "dodge");
}

// ── Defensive Attack ───────────────────────────────────────────────────────

/** -2 damage or -1 per die, whichever is worse (p. 576). */
export function defensiveDamagePenalty(dice: number): number {
  return -Math.max(2, Math.floor(Math.max(0, dice)));
}

/** A grab or grapple makes the target defend at +1 (p. 576). */
export const DEFENSIVE_GRAPPLE_BONUS = 1;

/** What a Defensive Attack buys, chosen before attacking. */
export type DefensiveBenefit = "parry" | "block" | "sameWeapon";

/** +1 to Parry or to Block (whichever was chosen); parrying with the weapon that attacked comes at no bonus. */
export function defensiveDefenseBonus(benefit: string, defense: string): number {
  return (benefit === "parry" && defense === "parry") || (benefit === "block" && defense === "block") ? 1 : 0;
}

/** Whether an unbalanced weapon may parry again this turn despite attacking with it. */
export function defensiveAllowsSameWeaponParry(benefit: string): boolean {
  return benefit === "sameWeapon";
}
