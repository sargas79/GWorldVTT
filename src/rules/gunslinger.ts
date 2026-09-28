/**
 * Gunslinger (GURPS Basic Set: Characters p. 58; the list as the Revised
 * edition writes it).
 *
 * "When using any weapon that uses Beam Weapons, Gunner, Guns, or Liquid
 * Projector skill", a Gunslinger enjoys:
 *
 * - Accuracy without an Aim maneuver: the weapon's full Acc for single shots
 *   (RoF 1-3) from a one-handed gun, half of it (rounded up) from a
 *   two-handed weapon or on automatic fire. Aiming still gives full Acc, and
 *   the usual benefits of bracing, scopes and further seconds of Aim.
 * - In place of adding Acc: no Move and Attack penalty (-2 or Bulk), no
 *   penalty for stunts on foot, no Move and Attack penalty when driving and
 *   shooting (p. 470), no Bulk penalty in close combat (p. 391).
 * - No -2 for a pop-up attack (p. 390).
 * - Weapon skill, and not the lower of it and Riding, to hit while mounted
 *   (p. 397).
 * - Half the default penalty (rounded in his favour) of any technique that
 *   allows faster shooting, bought up from that improved default, and half
 *   the sum of all Fast-Draw (Ammo) penalties (rounded in his favour).
 *
 * None of this applies to muscle-powered missile weapons.
 */

import { normalizeSkillName } from "./skills.js";

/** The skills a Gunslinger's weapon is rolled against. */
export const GUNSLINGER_SKILLS: readonly string[] = [
  "Beam Weapons",
  "Gunner",
  "Guns",
  "Liquid Projector",
];

/** The most shots of an attack that count as "single shots (RoF 1-3)". */
export const GUNSLINGER_SINGLE_SHOT_RATE = 3;

/** A skill's name without its specialty: "Guns (Pistol)" is a Guns skill. */
function bareSkill(skill: string): string {
  return normalizeSkillName(skill).replace(/\s*\(.*\)\s*$/, "");
}

/** Whether a weapon skill is one a Gunslinger's talent covers, by name with or without its specialty. */
export function isGunslingerSkill(skill: string): boolean {
  const bare = bareSkill(skill);
  return GUNSLINGER_SKILLS.some((listed) => normalizeSkillName(listed) === bare);
}

/**
 * What a Gunslinger's weapon is, as the shooting rules are told: whether it
 * takes both hands. Null for anyone else, and for a weapon of another skill.
 */
export interface GunslingerWeapon {
  twoHanded: boolean;
}

export function gunslingerWeapon(options: {
  gunslinger: boolean;
  skill: string;
  twoHanded?: boolean;
}): GunslingerWeapon | null {
  if (!options.gunslinger || !isGunslingerSkill(options.skill)) return null;
  return { twoHanded: options.twoHanded === true };
}

/**
 * The Accuracy a Gunslinger adds without aiming (p. 58): the weapon's whole
 * bonus for single shots (RoF 1-3) from a one-handed gun; half of it, rounded
 * up, from a two-handed weapon or for automatic fire.
 */
export function gunslingerAccuracy(options: {
  accuracy: number;
  /** Shots this attack fires, shells and not pellets. */
  shots: number;
  twoHanded: boolean;
}): number {
  const accuracy = Math.max(0, Math.floor(Number(options.accuracy) || 0));
  const single = Math.max(1, Math.floor(Number(options.shots) || 1)) <= GUNSLINGER_SINGLE_SHOT_RATE;
  return single && !options.twoHanded ? accuracy : Math.ceil(accuracy / 2);
}

/**
 * Half a penalty, rounded in the fighter's favour (p. 58): toward zero, so a
 * -5 is a -2 and a -1 is nothing. A bonus or zero is left as it is.
 */
export function halvePenaltyInFavour(penalty: number): number {
  const value = Number(penalty) || 0;
  return value < 0 ? Math.ceil(value / 2) || 0 : value;
}

/**
 * A faster-shooting technique's default penalty for somebody who may have
 * Gunslinger. The technique is bought up from the result.
 */
export function fasterShootingDefault(penalty: number, gunslinger: boolean): number {
  return gunslinger ? halvePenaltyInFavour(penalty) : penalty;
}

/**
 * What a Fast-Draw (Ammo) roll takes in penalties: the sum of all of them,
 * halved in a Gunslinger's favour (p. 58). Only penalties count; a bonus is
 * not one of them.
 */
export function fastDrawAmmoPenalty(penalties: readonly number[], gunslinger: boolean): number {
  const sum = penalties.reduce((total, value) => total + Math.min(0, Number(value) || 0), 0);
  return gunslinger ? halvePenaltyInFavour(sum) : sum;
}
