/**
 * Weapons improved by cost factor (GURPS Monster Hunters 1: Champions
 * pp. 59-61), priced with the gadget formula: base cost x (1 + total CF).
 *
 * The book's grades differ from the Basic Set's. Fine is free at TL8 and
 * adds +1 to cutting and impaling damage; very fine is +3 CF, swords and
 * fencing weapons only, and +2 damage. A gun's fine and very fine are
 * Accuracy, not damage. Solid silver is +19 CF and breaks easily, and
 * titanium is lighter and tougher.
 */

import type { DamageType } from "./types.js";
import type { WeaponClass, WeaponMaterial, WeaponQuality } from "./weapon-quality.js";

/** The improvements that are fields on the weapon; grade and material are the weapon's own fields. */
export interface WeaponImprovements {
  /** Melee: "+1 to skill ... All weapons except sticks: +4 CF". Bows: "+1 to Accuracy. +4 CF." */
  balanced?: boolean;
  /** "Resembles any innocent item that could conceal it ... All weapons: +4 CF." */
  disguised?: boolean;
  /** "Counts as a holy attack (p. 51) ... All weapons: +4 CF." */
  holy?: boolean;
  /** "Multiplies weight by 3/4 and gives -2 to odds of breakage. All weapons: +1 CF." */
  titanium?: boolean;
  /** "+1 damage. Two-handed axes and maces only: +1 CF." */
  weighted?: boolean;
  /** Bows and crossbows: "Treat the user and weapon as having ST+2 for damage and range purposes. +1 CF." */
  compound?: boolean;
}

/** The weapon as the improvement rules read it. */
export interface ImprovedWeapon {
  weaponClass: WeaponClass;
  quality: WeaponQuality;
  material: WeaponMaterial;
  improvements: WeaponImprovements;
  /** Whether any of its modes is swung or thrust with Two-Handed Axe/Mace. */
  twoHandedAxeOrMace?: boolean;
}

const isFirearm = (w: ImprovedWeapon) => w.weaponClass === "firearm";
const isBow = (w: ImprovedWeapon) => w.weaponClass === "bow";
const isSword = (w: ImprovedWeapon) => w.weaponClass === "fencing" || w.weaponClass === "sword";

/** The problems with a combination the book forbids, as keys; empty when it is allowed. */
export type WeaponImprovementProblem =
  | "veryFineNotSword"
  | "silverCombination"
  | "weightedNotTwoHandedAxe"
  | "compoundNotBow"
  | "cheapNotOffered";

/**
 * What is wrong with a weapon's improvements (pp. 59-61): "Silver cannot be
 * combined with fine, silver-coated, titanium, or very fine"; very fine is
 * for "fencing weapons and swords only" on a melee weapon; weighted is for
 * two-handed axes and maces; compound is a bow's. Fine and very fine are one
 * field, so cannot be taken together.
 */
export function weaponImprovementProblems(weapon: ImprovedWeapon): WeaponImprovementProblem[] {
  const out: WeaponImprovementProblem[] = [];
  const { quality, material, improvements: i } = weapon;
  if (quality === "cheap") out.push("cheapNotOffered");
  if (!isFirearm(weapon) && !isBow(weapon) && quality === "veryFine" && !isSword(weapon)) out.push("veryFineNotSword");
  if (isBow(weapon) && quality === "veryFine") out.push("veryFineNotSword");
  if (material === "silver" && (quality === "fine" || quality === "veryFine" || i.titanium)) out.push("silverCombination");
  if (i.weighted && !weapon.twoHandedAxeOrMace) out.push("weightedNotTwoHandedAxe");
  if (i.compound && !isBow(weapon)) out.push("compoundNotBow");
  return out;
}

/**
 * The grade and improvements a weapon is left with once the forbidden
 * combinations are taken back out: a silver weapon is good quality and not
 * titanium, a very fine blade that is not a sword is fine, and so on.
 */
export function allowedWeapon(weapon: ImprovedWeapon): ImprovedWeapon {
  let quality = weapon.quality === "cheap" ? "good" : weapon.quality;
  const improvements = { ...weapon.improvements };
  if (quality === "veryFine" && (isBow(weapon) || (!isFirearm(weapon) && !isSword(weapon)))) quality = "fine";
  if (weapon.material === "silver") {
    if (quality === "fine" || quality === "veryFine") quality = "good";
    improvements.titanium = false;
  }
  if (improvements.weighted && !weapon.twoHandedAxeOrMace) improvements.weighted = false;
  if (improvements.compound && !isBow(weapon)) improvements.compound = false;
  return { ...weapon, quality, improvements };
}

/** A weapon's total cost factor (pp. 59-61). */
export function weaponCostFactor(weapon: ImprovedWeapon): number {
  const { quality, material, improvements: i } = weapon;
  let cf = 0;
  if (i.disguised) cf += 4;
  if (i.holy) cf += 4;
  if (isFirearm(weapon)) {
    cf += quality === "fine" ? 1 : quality === "veryFine" ? 4 : 0;
  } else if (isBow(weapon)) {
    if (i.balanced) cf += 4;
    if (i.compound) cf += 1;
    if (quality === "fine") cf += 3;
  } else {
    if (i.balanced) cf += 4;
    if (i.titanium) cf += 1;
    if (i.weighted) cf += 1;
    if (quality === "veryFine") cf += 3;
  }
  if (material === "silver") cf += 19;
  if (material === "silverCoated") cf += 2;
  return cf;
}

/** "The weapon's final value (after all modifiers, including this one) must be at least $250." */
export const HOLY_WEAPON_MINIMUM_COST = 250;

/** A weapon's price and weight from its list figures. */
export function improvedWeaponPrice(weapon: ImprovedWeapon, list: { cost: number; weight: number }): { cost: number; weight: number; costFactor: number } {
  const costFactor = weaponCostFactor(weapon);
  let cost = Math.round(Math.max(0, list.cost) * (1 + costFactor) * 100) / 100;
  if (weapon.improvements.holy) cost = Math.max(cost, HOLY_WEAPON_MINIMUM_COST);
  const weight = Math.round(Math.max(0, list.weight) * (weapon.improvements.titanium ? 0.75 : 1) * 100) / 100;
  return { cost, weight, costFactor };
}

/** What the improvements do to a weapon in a fight. */
export interface WeaponImprovementEffects {
  /** Balanced melee and thrown weapons. */
  skill: number;
  accuracy: number;
  /** Added to a blow of the given damage type. */
  damage: number;
  /** "Odds of breakage", as the heavy-parry chance reads a grade's. */
  breakage: number;
  rangeMultiplier: number;
  /** A compound bow's ST+2 for damage and range. */
  st: number;
}

/**
 * The effects (pp. 59-61):
 * - fine melee "-1 to odds of breakage ... If the weapon is cutting or
 *   impaling, adds +1 to damage";
 * - very fine "-2 to odds of breakage (not cumulative with titanium) and +2
 *   to damage";
 * - silver "+2 to odds of breakage"; titanium "-2 to odds of breakage";
 * - weighted "+1 damage"; balanced "+1 to skill", or "+1 to Accuracy" on a bow;
 * - a fine bow's "1/2D and Max by 20%"; a compound bow's ST+2;
 * - a fine gun "with base Acc 2 or better another +1 Acc", a very fine one
 *   "with base Acc 4 or better another +2 Acc".
 */
export function weaponImprovementEffects(
  weapon: ImprovedWeapon,
  mode: { damageType: DamageType | ""; baseAccuracy?: number; thrown?: boolean; ranged?: boolean },
): WeaponImprovementEffects {
  const { quality, material, improvements: i } = weapon;
  const out: WeaponImprovementEffects = { skill: 0, accuracy: 0, damage: 0, breakage: 0, rangeMultiplier: 1, st: 0 };
  if (isFirearm(weapon)) {
    const acc = Number(mode.baseAccuracy) || 0;
    if (quality === "fine" && acc >= 2) out.accuracy = 1;
    if (quality === "veryFine" && acc >= 4) out.accuracy = 2;
    return out;
  }
  if (isBow(weapon)) {
    if (i.balanced) out.accuracy = 1;
    if (quality === "fine") out.rangeMultiplier = 1.2;
    if (i.compound) out.st = 2;
    return out;
  }
  if (i.balanced && (!mode.ranged || mode.thrown)) out.skill = 1;
  if (quality === "fine" && (mode.damageType === "cut" || mode.damageType === "imp")) out.damage += 1;
  if (quality === "veryFine") out.damage += 2;
  if (i.weighted) out.damage += 1;
  const grade = quality === "fine" ? -1 : quality === "veryFine" ? -2 : 0;
  out.breakage = material === "silver" ? 2 : i.titanium ? Math.min(grade, -2) : grade;
  return out;
}

/**
 * An improvised weapon's skill penalty (p. 60): "Take Improvised Weapons
 * (p. 25) to remove such penalties entirely for that skill." The perk is
 * specialized by the weapon skill.
 */
export function improvisedPenalty(options: { penalty: number; skill: string; traitNames: readonly string[] }): number {
  const penalty = Math.min(0, Math.floor(Number(options.penalty) || 0));
  if (!penalty) return 0;
  const skill = options.skill.trim().toLowerCase();
  const perk = options.traitNames.some((t) => {
    const match = /^\s*Improvised Weapons\s*\((.+)\)\s*$/i.exec(t);
    return match ? match[1]!.trim().toLowerCase() === skill : false;
  });
  return perk ? 0 : penalty;
}
