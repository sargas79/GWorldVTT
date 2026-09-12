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
  /** The defender is very tired (below 1/3 FP), which halves Dodge again. */
  veryTired?: boolean;
  /**
   * A rider whose Riding is below 12 defends worse by the difference
   * (Campaigns p. 397). Zero for anybody on their own feet.
   */
  mountedPenalty?: number;
  cannotSeeAttacker?: boolean;
  /** GM-assigned situational penalties: bad footing, distraction, and so on. */
  situational?: number;
  /** Combat Reflexes: "+1 to all active defense rolls" (Characters p. 43). */
  combatReflexes?: boolean;
  /**
   * Enhanced Dodge, Parry or Block (Characters p. 51): the levels bought of
   * whichever this is, "+1 per level".
   */
  enhanced?: number;
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
  if (context.combatReflexes) modifiers.push({ label: "Combat Reflexes", value: 1 });
  if (context.enhanced) modifiers.push({ label: "Enhanced defense", value: context.enhanced });
  // "A rider can Dodge, Block, or Parry. If he has Riding at 12+, all of these
  // defenses are at normal levels" -- and worse by the shortfall if not.
  if (context.mountedPenalty) {
    modifiers.push({ label: "Mounted", value: context.mountedPenalty });
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
 *
 * Being very tired halves it as well (Campaigns p. 426). The two charts are
 * separate and the fatigue one says its effects are cumulative, so somebody
 * both hurt and exhausted is halved twice rather than once.
 */
export function dodge(basicSpeed: number, context: DodgeContext = {}): DefenseResult {
  const raw = baseDodge(basicSpeed);
  const hurt = context.reeling ? halveForReeling(raw) : raw;
  const base = context.veryTired ? halveForReeling(hurt) : hurt;

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

/** A weapon that might be parried with, as the chooser needs to see it. */
export interface ParryOption {
  /** The parry score this weapon offers, or null when it cannot parry at all. */
  parry: number | null;
  /**
   * An unbalanced weapon, marked "U" in the Parry column (GURPS Basic Set:
   * Characters p. 269).
   */
  unbalanced: boolean;
}

/**
 * The best weapon to parry an attack with.
 *
 * An unbalanced weapon cannot parry in a turn it has already attacked in: an
 * axe swung this turn is not coming back in time to turn a blade. So on such a
 * turn it is out of the running entirely, and a lesser but balanced weapon --
 * or nothing at all -- is what the character actually has.
 *
 * Returns null when no weapon can parry, which is the difference between a bad
 * parry and no parry.
 */
export function bestParryOption<T extends ParryOption>(
  options: readonly T[],
  attackedThisTurn = false,
): T | null {
  let best: T | null = null;
  for (const option of options) {
    if (option.parry === null) continue;
    if (attackedThisTurn && option.unbalanced) continue;
    if (best === null || option.parry > (best.parry ?? -Infinity)) best = option;
  }
  return best;
}
