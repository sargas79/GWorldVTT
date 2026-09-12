/**
 * Spells in a fight (GURPS Basic Set: Characters pp. 240-242; Campaigns
 * p. 349).
 *
 * A Missile spell is built up in the hand and thrown; a Melee spell charges
 * the hand and is struck with; a Resisted spell is a Quick Contest against
 * the subject, under the Rule of 16; a Blocking spell is cast as a defense.
 * What is arithmetic about each of those is here.
 */

import type { DiceAdds } from "./types.js";
import type { SkillAttribute } from "./types.js";

/** "You cannot spend more than three seconds building up a Missile spell." */
export const MISSILE_MAX_SECONDS = 3;

/** Whether a missile in hand can still be enlarged. */
export function canEnlargeMissile(secondsBuilt: number): boolean {
  return secondsBuilt < MISSILE_MAX_SECONDS;
}

/**
 * The damage a spell does for the energy in it: "Most Missile spells inflict
 * 1d of damage per point of energy" (p. 241), and a Melee spell such as
 * Deathtouch the same. Dice and adds both scale: two points of a 1d-1 spell
 * are 2d-2.
 */
export function spellDamage(perEnergy: DiceAdds, energy: number): DiceAdds {
  const points = Math.max(0, Math.floor(energy));
  return {
    dice: perEnergy.dice * points,
    adds: perEnergy.adds * points,
    ...(perEnergy.multiplier ? { multiplier: perEnergy.multiplier } : {}),
  };
}

/**
 * The Rule of 16 (Campaigns p. 349): "the attacker's effective skill cannot
 * exceed the higher of 16 and the defender's actual resistance. If it does,
 * reduce it to that level." Only for a living or sapient subject; "There is
 * no such limit if the subject is a spell" (p. 241).
 */
export function ruleOf16(effectiveSkill: number, resistance: number): number {
  return Math.min(effectiveSkill, Math.max(16, resistance));
}

/**
 * What a subject resists with: "the attribute or other trait indicated in the
 * spell description -- usually HT or Will. The subject's Magic Resistance, if
 * any, adds to his resistance" (p. 242), and against an Area spell "those with
 * Magic Resistance get double the usual benefit".
 */
export function resistanceScore(options: {
  score: number;
  magicResistance: number;
  area?: boolean;
}): number {
  const resistance = Math.max(0, options.magicResistance);
  return options.score + (options.area ? 2 : 1) * resistance;
}

const ATTRIBUTES: ReadonlyArray<[RegExp, SkillAttribute]> = [
  [/^ht$/i, "HT"],
  [/^will$/i, "Will"],
  [/^st$/i, "ST"],
  [/^dx$/i, "DX"],
  [/^iq$/i, "IQ"],
  [/^per(ception)?$/i, "Per"],
];

/**
 * The attribute a spell is resisted with, from how its record names it, or
 * null where it names something else -- another spell, "Will or skill", a
 * lock -- that only the table can put a number to.
 */
export function resistanceAttribute(resistedBy: string): SkillAttribute | null {
  const name = resistedBy.trim();
  for (const [pattern, attribute] of ATTRIBUTES) {
    if (pattern.test(name)) return attribute;
  }
  return null;
}

/** Whether a resisted spell's subject is a living or sapient being, as far as the record says. */
export function subjectIsLiving(resistedBy: string): boolean {
  return resistanceAttribute(resistedBy) !== null;
}

/**
 * A Resisted spell's outcome (p. 242): "Compare the subject's resistance
 * roll to your skill roll in a Quick Contest. If you win, your spell affects
 * the subject. If you lose or tie, the spell has no effect". A subject who
 * fails their roll is affected by any success of the caster's; one who makes
 * it is affected only "by less than you did".
 */
export function spellAffects(options: {
  caster: { success: boolean; margin: number };
  subject: { success: boolean; margin: number };
}): boolean {
  const { caster, subject } = options;
  if (!caster.success) return false;
  if (!subject.success) return true;
  return caster.margin > subject.margin;
}
