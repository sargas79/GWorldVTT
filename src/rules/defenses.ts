/**
 * Active defenses: Dodge, Parry, and Block (GURPS Lite p. 28).
 */

import { halveForReeling } from "./injury.js";
import { POSTURE_EFFECTS } from "./posture.js";
import type { EncumbranceLevel, Posture } from "./types.js";

/** Dodge is Basic Speed + 3, dropping all fractions (GURPS Lite p. 6). */
export function baseDodge(basicSpeed: number): number {
  return Math.floor(basicSpeed) + 3;
}

/** Parry is 3 + half your skill with the weapon, dropping fractions. */
export function baseParry(weaponSkill: number): number {
  return 3 + Math.floor(weaponSkill / 2);
}

/** Block is 3 + half your Shield skill, dropping fractions. */
export function baseBlock(shieldSkill: number): number {
  return 3 + Math.floor(shieldSkill / 2);
}

/** A single named contribution to a defense score, for display in chat cards. */
export interface DefenseModifier {
  label: string;
  value: number;
}

export interface DefenseContext {
  /** Shield Defense Bonus, applied only against attacks from the front or shield side. */
  shieldDb?: number;
  attackFromFrontOrShieldSide?: boolean;
  posture?: Posture;
  /** All-Out Defense (Increased Defense) grants +2 to one defense. */
  allOutDefenseIncreased?: boolean;
  stunned?: boolean;
  /** The defender is reeling (below 1/3 HP), which halves Dodge. */
  reeling?: boolean;
  cannotSeeAttacker?: boolean;
  /** GM-assigned situational penalties: bad footing, distraction, and so on. */
  situational?: number;
}

export interface DodgeContext extends DefenseContext {
  encumbrance?: EncumbranceLevel;
}

export interface ParryContext extends DefenseContext {
  /** Weapon-specific parry modifier: -1 for a knife, +2 for a quarterstaff. */
  weaponParryModifier?: number;
  /** Parrying bare-handed against an armed attack. */
  unarmedVsWeapon?: boolean;
  /** Karate (or a thrusting attack) removes the unarmed-vs-weapon penalty. */
  usingKarate?: boolean;
  attackIsThrust?: boolean;
  /** Parrying a thrown weapon: -1, or -2 if it weighs 1 lb. or less. */
  thrownWeapon?: "none" | "normal" | "small";
  /** Flails are -4 to parry. */
  attackerUsingFlail?: boolean;
  /** Encumbrance penalises a Karate parry, but not an ordinary weapon parry. */
  encumbrance?: EncumbranceLevel;
}

export interface BlockContext extends DefenseContext {
  /** Flails are -2 to block. */
  attackerUsingFlail?: boolean;
}

export interface DefenseResult {
  total: number;
  base: number;
  modifiers: DefenseModifier[];
}

function finish(base: number, modifiers: DefenseModifier[]): DefenseResult {
  const applied = modifiers.filter((m) => m.value !== 0);
  const total = applied.reduce((sum, m) => sum + m.value, base);
  return { total, base, modifiers: applied };
}

/** Modifiers shared by all three active defenses. */
function commonModifiers(context: DefenseContext): DefenseModifier[] {
  const modifiers: DefenseModifier[] = [];

  if (context.shieldDb && context.attackFromFrontOrShieldSide !== false) {
    modifiers.push({ label: "Shield DB", value: context.shieldDb });
  }
  if (context.posture && context.posture !== "standing") {
    modifiers.push({ label: "Posture", value: POSTURE_EFFECTS[context.posture].defense });
  }
  if (context.allOutDefenseIncreased) {
    modifiers.push({ label: "All-Out Defense (Increased)", value: 2 });
  }
  if (context.stunned) modifiers.push({ label: "Stunned", value: -4 });
  if (context.cannotSeeAttacker) modifiers.push({ label: "Cannot see attacker", value: -4 });
  if (context.situational) modifiers.push({ label: "Situational", value: context.situational });

  return modifiers;
}

/**
 * Effective Dodge.
 *
 * Reeling halves the score, rounding up. Because GURPS Lite states the halving
 * as an effect on the Dodge score itself, it is applied to the base before
 * modifiers rather than to the final total.
 */
export function dodge(basicSpeed: number, context: DodgeContext = {}): DefenseResult {
  const raw = baseDodge(basicSpeed);
  const base = context.reeling ? halveForReeling(raw) : raw;

  const modifiers = commonModifiers(context);
  if (context.encumbrance) {
    modifiers.unshift({ label: "Encumbrance", value: -context.encumbrance });
  }

  return finish(base, modifiers);
}

/** Effective Parry with a given weapon skill. */
export function parry(weaponSkill: number, context: ParryContext = {}): DefenseResult {
  const base = baseParry(weaponSkill);
  const modifiers = commonModifiers(context);

  if (context.weaponParryModifier) {
    modifiers.unshift({ label: "Weapon", value: context.weaponParryModifier });
  }
  if (context.unarmedVsWeapon && !context.usingKarate && !context.attackIsThrust) {
    modifiers.push({ label: "Unarmed vs. weapon", value: -3 });
  }
  if (context.thrownWeapon === "normal") {
    modifiers.push({ label: "Thrown weapon", value: -1 });
  } else if (context.thrownWeapon === "small") {
    modifiers.push({ label: "Small thrown weapon", value: -2 });
  }
  if (context.attackerUsingFlail) modifiers.push({ label: "Flail", value: -4 });
  if (context.usingKarate && context.encumbrance) {
    modifiers.push({ label: "Encumbrance (Karate)", value: -context.encumbrance });
  }

  return finish(base, modifiers);
}

/** Effective Block with a given Shield skill. */
export function block(shieldSkill: number, context: BlockContext = {}): DefenseResult {
  const base = baseBlock(shieldSkill);
  const modifiers = commonModifiers(context);
  if (context.attackerUsingFlail) modifiers.push({ label: "Flail", value: -2 });
  return finish(base, modifiers);
}
