/**
 * Throwing Art (GURPS Basic Set: Characters p. 226).
 *
 * The cinematic skill of throwing anything: DX/Hard, no default, and learned
 * only with Trained By A Master or Weapon Master. It covers everything the
 * Throwing and Thrown Weapon skills cover, so whoever has it needs neither --
 * and known well it throws further and hits harder: at DX, +1 to ST for
 * throwing distance and +1 per die of damage with thrown weapons, both +2 at
 * DX+1 or better.
 *
 * For a Weapon Master the damage bonus is "instead of the usual damage bonus"
 * for the weapon (p. 99), never on top of it. The system does not add Weapon
 * Master's damage bonus yet, so there is nothing for this one to replace.
 */

import { swingDamage, thrustDamage } from "./damage.js";
import { normalizeSkillName } from "./skills.js";

export const THROWING_ART = "Throwing Art";

/**
 * Whether Throwing Art stands in for a skill: "Throwing Art lets you throw
 * anything covered by the Throwing and Thrown Weapon skills." Spear Thrower,
 * Bolas, Lasso and Net are skills of their own and are not named.
 */
export function coveredByThrowingArt(skill: string): boolean {
  const name = normalizeSkillName(String(skill ?? "")).toLowerCase();
  return name === "throwing" || name === "thrown weapon" || name.startsWith("thrown weapon (");
}

/**
 * The bonus Throwing Art gives at a level, both to ST for distance and per
 * die of thrown damage: +1 at DX, +2 at DX+1 or better, nothing below DX or
 * for a character without the skill.
 */
export function throwingArtBonus(level: number | null, dx: number): number {
  if (level === null) return 0;
  const above = level - dx;
  return above >= 1 ? 2 : above >= 0 ? 1 : 0;
}

/**
 * The adds Throwing Art's bonus comes to on a thrown weapon's damage: the
 * bonus per die of the thrower's basic thrust or swing, as Weapon Master's is
 * (p. 99). Damage that is not the thrower's -- a grenade's fixed dice --
 * gets nothing.
 */
export function throwingArtDamage(bonus: number, damageBase: string, st: number): number {
  if (!bonus) return 0;
  if (damageBase === "thr") return bonus * thrustDamage(st).dice;
  if (damageBase === "sw") return bonus * swingDamage(st).dice;
  return 0;
}

/** What Throwing Art makes of an attack thrown with a skill it covers. */
export interface ThrowingArtAttack {
  /** The skill rolled: Throwing Art, or the weapon's own when that is no worse. */
  skill: string;
  level: number | null;
  atDefault: boolean;
  /** The bonus per die of damage, and to ST for distance. */
  bonus: number;
}

/**
 * The skill a thrown attack rolls, and the bonus it gets.
 *
 * "Roll against skill to hit": Throwing Art is rolled when it is better than
 * the weapon's own skill or its default, and the weapon's skill is kept on a
 * tie. The bonus is Throwing Art's whichever skill is rolled, since it comes
 * from knowing the art and not from using it. A skill Throwing Art does not
 * cover is left as it was.
 */
export function throwingArtAttack(options: {
  /** The weapon's skill. */
  skill: string;
  /** Its level, from the skill itself or its default; null when neither. */
  level: number | null;
  atDefault: boolean;
  /** The character's Throwing Art, or null without it. */
  throwingArt: number | null;
  dx: number;
}): ThrowingArtAttack {
  const own = { skill: options.skill, level: options.level, atDefault: options.atDefault, bonus: 0 };
  if (!coveredByThrowingArt(options.skill) || options.throwingArt === null) return own;
  const bonus = throwingArtBonus(options.throwingArt, options.dx);
  if (options.level !== null && options.level >= options.throwingArt) return { ...own, bonus };
  return { skill: THROWING_ART, level: options.throwingArt, atDefault: false, bonus };
}
