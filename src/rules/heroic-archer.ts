/**
 * Heroic Archer (GURPS Basic Set Revised, Addendum 1, p. 327), a cinematic
 * advantage for a bow.
 *
 * - Ready an arrow, then next turn roll Bow at -3 to ready the bow at once,
 *   and attack at -3 on the same turn: both -1 with Weapon Master (Bow).
 * - Whenever it Attacks or All-Out Attacks, the bow's Acc counts without an
 *   Aim maneuver, and an Aim adds another +1 after one second or +2 after two.
 * - On a Move and Attack, or in close combat, Bulk is ignored in place of
 *   adding Acc.
 * - Penalties for crazy positions or acrobatics are ignored, those to
 *   Fast-Draw (Arrow) are halved, and so are the GM's penalties for stunt
 *   shots.
 */

import { halvePenaltyInFavour } from "./gunslinger.js";
import { normalizeSkillName } from "./skills.js";

/** The skill a Heroic Archer's weapon is rolled against. */
export const HEROIC_ARCHER_SKILL = "Bow";

/** Whether a weapon skill is Bow, with or without its specialty. */
export function isHeroicArcherSkill(skill: string): boolean {
  return normalizeSkillName(skill).replace(/\s*\(.*\)\s*$/, "") === normalizeSkillName(HEROIC_ARCHER_SKILL);
}

/** What a Heroic Archer's bow is, as the shooting rules are told; null for anyone else and for another skill. */
export interface HeroicArcherWeapon {
  heroic: true;
}

export function heroicArcherWeapon(options: { heroicArcher: boolean; skill: string }): HeroicArcherWeapon | null {
  return options.heroicArcher && isHeroicArcherSkill(options.skill) ? { heroic: true } : null;
}

/** The penalty on the Bow roll to ready the bow in no time, and on the attack after it: -3, or -1 for a Weapon Master (Bow). */
export function quickReadyPenalty(weaponMaster: boolean): number {
  return weaponMaster ? -1 : -3;
}

/** The extra Accuracy an Aim gives a Heroic Archer: +1 after one second, +2 after two or more. */
export function heroicAimBonus(secondsAimed: number): number {
  return Math.max(0, Math.min(2, Math.floor(Number(secondsAimed) || 0)));
}

/** A penalty for a Fast-Draw (Arrow) or a stunt shot, halved in the archer's favour. */
export function heroicHalvedPenalty(penalty: number): number {
  return halvePenaltyInFavour(penalty);
}
