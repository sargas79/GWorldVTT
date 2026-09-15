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
  /**
   * Bulletproof Nudity (Campaigns p. 417): what wearing very little is worth
   * to every active defense. Zero unless the table is playing that rule.
   */
  undressed?: number;
  /**
   * What the afflictions on the defender come to (Campaigns pp. 428-429):
   * -1 for being nauseated, -4 for any of the incapacitating ones, which the
   * book calls being "effectively stunned".
   */
  afflicted?: number;
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
  if (context.undressed) modifiers.push({ label: "Undressed", value: context.undressed });
  if (context.afflicted) modifiers.push({ label: "Afflicted", value: context.afflicted });
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

// ── what the attacking weapon does to a parry or block ────────────────────

/** A flail, a nunchaku (a flail whose penalties are halved), or neither. */
export type FlailKind = "flail" | "nunchaku" | null;

/**
 * Whether an attack is made with a flail (Characters p. 208): anything used
 * with Flail or Two-Handed Flail skill. A nunchaku is one, at half the
 * penalties (Campaigns p. 548).
 */
export function flailKind(skill: string | undefined, name = ""): FlailKind {
  const base = String(skill ?? "").replace(/\s*\(.*$/, "").trim().toLowerCase();
  if (base !== "flail" && base !== "two-handed flail") return null;
  return /nunchaku/i.test(name) ? "nunchaku" : "flail";
}

/**
 * What a flail does to a defense (Characters p. 208, Campaigns pp. 405, 548):
 * -4 to parry and -2 to block, or -2 and -1 against a nunchaku.
 */
export function flailDefenseModifier(kind: FlailKind, defense: "dodge" | "parry" | "block"): number {
  if (!kind || defense === "dodge") return 0;
  const full = defense === "parry" ? -4 : -2;
  return kind === "nunchaku" ? full / 2 : full;
}

/** "Fencing weapons and knives cannot parry them at all!" (Characters p. 208). */
export function canParryFlail(parry: { skill: string | undefined; isFencing: boolean }): boolean {
  const base = String(parry.skill ?? "").replace(/\s*\(.*$/, "").trim().toLowerCase();
  return !parry.isFencing && base !== "knife";
}

/**
 * Parrying a thrown weapon (Campaigns p. 376): -1, or -2 for a small one that
 * weighs 1 lb. or less.
 */
export function thrownParryModifier(weight: number): number {
  return Number(weight) > 0 && Number(weight) <= 1 ? -2 : -1;
}

/**
 * Parrying a weapon bare-handed (Campaigns p. 376): -3, "unless the attack is
 * a thrust or you are using Judo or Karate". Zero for a parry made with a
 * weapon, or against an unarmed attack.
 */
export function bareHandedParryModifier(options: { parrySkill: string | undefined; bareHanded: boolean; attackIsWeapon: boolean; attackIsThrust: boolean }): number {
  if (!options.bareHanded || !options.attackIsWeapon || options.attackIsThrust) return 0;
  const base = String(options.parrySkill ?? "").replace(/\s*\(.*$/, "").trim().toLowerCase();
  return base === "judo" || base === "karate" ? 0 : -3;
}

/**
 * The roll to strike an unarmed attacker's limb after parrying it with a
 * weapon (Campaigns p. 376): against the weapon's skill, "at -4 if your
 * attacker used Judo or Karate".
 */
export function parriedLimbStrikeModifier(attackSkill: string | undefined): number {
  const base = String(attackSkill ?? "").replace(/\s*\(.*$/, "").trim().toLowerCase();
  return base === "judo" || base === "karate" ? -4 : 0;
}

/**
 * The penalty on a parry for the parries already made with the same weapon or
 * bare hand this turn (Campaigns p. 376): a cumulative -4 each, -2 with a
 * fencing weapon or with Trained By A Master or Weapon Master, and -1 with both.
 */
export function multipleParryPenalty(previous: number, options: { fencing: boolean; trained: boolean }): number {
  const step = options.fencing && options.trained ? -1 : options.fencing || options.trained ? -2 : -4;
  const count = Math.max(0, Math.floor(previous));
  return count === 0 ? 0 : count * step;
}

/** Whether an attack can be blocked at all: "You cannot block bullets or beam weapons" (Campaigns p. 375). */
export function blockableAttack(skill: string | undefined): boolean {
  const base = String(skill ?? "").replace(/\s*\(.*$/, "").trim().toLowerCase();
  return !["guns", "beam weapons", "gunner"].includes(base);
}

/** "You may attempt to block only one attack per turn" (Campaigns p. 375). */
export const BLOCKS_PER_TURN = 1;

/**
 * An Acrobatic Dodge (Campaigns p. 375): "Make an Acrobatics roll before you
 * attempt your Dodge roll ... On a success, you get +2 to that Dodge roll. On a
 * failure, you get -2."
 */
export function acrobaticDefenseModifier(success: boolean): number {
  return success ? 2 : -2;
}

/** "If you have put at least one point into the Acrobatics skill, you can try a 'fancy' dodge once during your turn" (p. 375). */
export const ACROBATIC_DEFENSES_PER_TURN = 1;

/** Whether a defender may try an acrobatic defense: a point in Acrobatics, and turns left this turn (null for no limit). */
export function mayTryAcrobatic(options: { points: number; used: number; perTurn: number | null }): boolean {
  if (!(Number(options.points) >= 1)) return false;
  return options.perTurn === null || Math.max(0, Math.floor(options.used)) < options.perTurn;
}
