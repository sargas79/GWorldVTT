/**
 * Weapon Master's damage bonus (GURPS Basic Set: Characters p. 99).
 *
 * A Weapon Master is bought for a class of muscle-powered weapons, from one
 * specific weapon up to all of them, and with a weapon in the class adds +1
 * per die to basic thrust or swing damage at DX+1 in its skill, +2 per die at
 * DX+2 or better. A weapon in the class that can be thrown gets it thrown as
 * well. "None of these benefits apply to default use."
 *
 * Which weapons a class takes in is the GM's call -- "all swords", "knightly
 * weapons" -- so the trait lists them: each entry a weapon skill or a
 * weapon's own name.
 */

import { perDieOfBasicDamage } from "./damage.js";
import { normalizeSkillName } from "./skills.js";

/** The level bought for "All muscle-powered weapons", the sixth of the six. */
export const ALL_WEAPONS_LEVEL = 6;

/** What a character's Weapon Master traits take in, all of them together. */
export interface WeaponMastery {
  /** True for "All muscle-powered weapons". */
  all: boolean;
  /** Weapon skills and weapon names, as written. */
  entries: string[];
}

/** Whether a trait is Weapon Master, by its name. */
export function isWeaponMaster(name: string): boolean {
  return /^weapon master\b/i.test(String(name ?? "").trim());
}

/**
 * What a character's traits make them a Weapon Master of.
 *
 * A trait's own list comes first. Without one, the name in parentheses is
 * the entry -- "Weapon Master (Rapier)" -- and the sixth level takes in
 * every weapon whatever else is written.
 */
export function weaponMasteryFrom(
  traits: ReadonlyArray<{ name: string; levels?: number; masteredWeapons?: readonly string[] }>,
): WeaponMastery {
  const mastery: WeaponMastery = { all: false, entries: [] };
  for (const trait of traits) {
    if (!isWeaponMaster(trait.name)) continue;
    if ((Number(trait.levels) || 0) >= ALL_WEAPONS_LEVEL) mastery.all = true;
    const listed = (trait.masteredWeapons ?? []).map((entry) => String(entry).trim()).filter(Boolean);
    const named = /\(([^)]+)\)\s*$/.exec(trait.name)?.[1]?.trim();
    mastery.entries.push(...(listed.length > 0 ? listed : named ? [named] : []));
  }
  return mastery;
}

/**
 * Whether a weapon is in a Weapon Master's class: its name is an entry, or
 * the skill of one of its modes is. A skill entry without a specialty takes
 * in every specialty -- "Thrown Weapon" is every thrown weapon -- and a
 * weapon matched by its melee skill is matched for its thrown modes too.
 */
export function inWeaponMasterClass(
  mastery: WeaponMastery,
  weapon: { name: string; skills: readonly string[] },
): boolean {
  if (mastery.all) return true;
  const name = normalizeSkillName(String(weapon.name ?? ""));
  return mastery.entries.some((entry) => {
    const wanted = normalizeSkillName(entry);
    if (!wanted) return false;
    if (wanted === name) return true;
    return weapon.skills.some((skill) => {
      const own = normalizeSkillName(String(skill ?? ""));
      return own === wanted || (!wanted.includes("(") && own.replace(/\s*\(.*\)\s*$/, "") === wanted);
    });
  });
}

/**
 * The bonus per die at a level in the weapon's skill: +1 at DX+1, +2 at DX+2
 * or better. Null is a skill the character does not have, and default use
 * gets nothing.
 */
export function weaponMasterBonusPerDie(level: number | null, dx: number): number {
  if (level === null) return 0;
  const above = level - dx;
  return above >= 2 ? 2 : above >= 1 ? 1 : 0;
}

/** The adds Weapon Master's bonus comes to on thrust or swing damage at a ST. */
export function weaponMasterDamage(
  perDie: number,
  damageBase: string,
  st: number,
  weaponMinSt: number | null = null,
): number {
  return perDieOfBasicDamage(perDie, damageBase, st, weaponMinSt);
}

/**
 * The bonus per die on a thrown weapon for someone who may have both.
 * Throwing Art's bonus "is instead of the usual damage bonus" for a Weapon
 * Master (p. 226): where it gives one, Weapon Master's adds nothing.
 */
export function thrownDamageBonusPerDie(options: { throwingArt: number; weaponMaster: number }): number {
  return options.throwingArt > 0 ? options.throwingArt : options.weaponMaster;
}
