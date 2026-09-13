/**
 * Weapon quality and what a weapon is made of (GURPS Basic Set: Characters
 * pp. 274-276 and 279; Campaigns p. 407).
 *
 * "The prices listed on the weapon tables buy good-quality weapons at TL6 or
 * less, fine-quality ones at TL7+." A cheaper or finer weapon costs a
 * multiple of the list price that depends on what kind of weapon it is, and
 * changes how it fights: a fine blade cuts a point deeper, a fine rifle is
 * more accurate and jams less, a cheap anything breaks sooner.
 */

import type { DamageType } from "./types.js";

/** The grades the book sells (p. 274). */
export const WEAPON_QUALITIES = ["cheap", "good", "fine", "veryFine"] as const;
export type WeaponQuality = (typeof WEAPON_QUALITIES)[number];

/**
 * What a weapon is made of, where it matters (p. 275): the blade's material
 * changes its quality for breakage and whether a fine blade cuts deeper, and
 * silver is its own case. Blank means nothing is known beyond the TL's usual
 * -- "stone at TL0, bronze at TL1, iron at TL2, and steel at TL3+".
 */
export const WEAPON_MATERIALS = [
  "", "stone", "obsidian", "bronze", "iron", "steel", "wood", "plastic", "silver", "silverCoated",
] as const;
export type WeaponMaterial = (typeof WEAPON_MATERIALS)[number];

/**
 * The class a weapon is priced in. The melee classes are the book's own
 * (p. 274): "fencing- or sword-class", "only crushing or impaling damage"
 * and "can do cutting damage"; firearms and bows have their own paragraphs
 * (pp. 276, 279). Blank when nothing has said, in which case the modes
 * decide.
 */
export const WEAPON_CLASSES = ["", "fencing", "sword", "cutting", "crushing", "firearm", "bow"] as const;
export type WeaponClass = (typeof WEAPON_CLASSES)[number];

/** Skills whose weapons the book calls swords. */
const SWORD_SKILLS = new Set([
  "Broadsword", "Shortsword", "Two-Handed Sword", "Rapier", "Saber", "Smallsword",
  "Main-Gauche", "Force Sword",
]);
const FENCING_SKILLS = new Set(["Rapier", "Saber", "Smallsword", "Main-Gauche"]);
const BOW_SKILLS = new Set(["Bow", "Crossbow", "Blowpipe"]);

/**
 * The class a weapon falls in, from its modes, where the record does not say.
 *
 * A gun is anything that can jam; a bow is anything shot with Bow, Crossbow or
 * Blowpipe; a sword is anything swung with a sword skill; everything else is
 * sorted by whether it can cut.
 */
export function weaponClassOf(options: {
  skills: readonly string[];
  damageTypes: readonly DamageType[];
  hasMalfunction: boolean;
  isFencing: boolean;
}): WeaponClass {
  if (options.hasMalfunction) return "firearm";
  if (options.skills.some((s) => BOW_SKILLS.has(s))) return "bow";
  if (options.isFencing || options.skills.some((s) => FENCING_SKILLS.has(s))) return "fencing";
  if (options.skills.some((s) => SWORD_SKILLS.has(s))) return "sword";
  if (options.damageTypes.includes("cut")) return "cutting";
  return "crushing";
}

/** The threshold the book prices on either side of: "At TL7+, ..." */
export const FINE_IS_STANDARD_FROM_TL = 7;

/**
 * What a weapon of this quality costs, as a multiple of list price, or null
 * where the book does not sell that grade in that class.
 *
 * Melee and thrown (p. 274): cheap 40% (20% at TL7+); good is the list price
 * through TL6 and 40% at TL7+; fine is x4 for fencing and sword-class, x3 for
 * crushing or impaling only, x10 for anything that cuts -- and the list price
 * at TL7+, where "all weapons are 'fine' at no extra cost"; very fine, "only
 * fencing weapons and swords", x20 or x4 at TL7+.
 *
 * Bows (p. 276): fine x4, and no other grade named. Firearms (p. 279): fine
 * x2, very fine x5; a cheap firearm is priced nowhere and kept at list.
 */
export function qualityCostMultiplier(cls: WeaponClass, quality: WeaponQuality, tl: number): number | null {
  const modern = tl >= FINE_IS_STANDARD_FROM_TL;
  switch (cls) {
    case "firearm":
      return { cheap: 1, good: 1, fine: 2, veryFine: 5 }[quality];
    case "bow":
      return { cheap: null, good: 1, fine: 4, veryFine: null }[quality];
    default: {
      if (quality === "cheap") return modern ? 0.2 : 0.4;
      if (quality === "good") return modern ? 0.4 : 1;
      if (quality === "fine") {
        if (modern) return 1;
        return cls === "cutting" ? 10 : cls === "crushing" ? 3 : 4;
      }
      // Very fine: swords and fencing weapons only.
      if (cls === "fencing" || cls === "sword" || cls === "") return modern ? 4 : 20;
      return null;
    }
  }
}

/** The grades a weapon of this class can be bought in. */
export function availableQualities(cls: WeaponClass, tl: number): WeaponQuality[] {
  return WEAPON_QUALITIES.filter((q) => qualityCostMultiplier(cls, q, tl) !== null);
}

/** Materials that take no damage bonus from quality (p. 275). */
const NO_FINE_BONUS = new Set<WeaponMaterial>(["stone", "bronze", "iron"]);

/**
 * "Obsidian (TL1): A blade made of volcanic glass is very sharp, but easily
 * broken or blunted. Treat as a good-quality stone blade, but with +1 to
 * cutting and impaling damage (as if fine) and +2 to breakage (as if
 * cheap)." The bonus is the glass's own, not the grade's, so it stands
 * whatever grade the blade was bought in.
 *
 * "It loses its damage bonus if used to parry any weapon (but not an
 * unarmed attack) or to strike DR 2+" -- a thing that happens in the fight
 * rather than a fact about the blade. Nothing on a sheet or a card decides
 * it yet: the caller says whether the edge has been blunted, and today no
 * caller passes anything but the default.
 */
export function obsidianDamageBonus(type: DamageType, blunted = false): number {
  if (blunted) return 0;
  return type === "cut" || type === "imp" ? 1 : 0;
}

/**
 * The damage a fine or very fine blade adds (p. 274): "+1 to cutting and
 * impaling damage" for fine, +2 for very fine, and nothing to a crushing
 * blow. A stone, bronze or iron blade "receives no damage bonus for being of
 * fine or better quality" (p. 275).
 */
export function qualityDamageBonus(
  quality: WeaponQuality,
  type: DamageType,
  material: WeaponMaterial = "",
): number {
  if (type !== "cut" && type !== "imp") return 0;
  // Obsidian cuts a point deeper whatever it was bought as, and takes
  // nothing further from the grade: it is "a good-quality stone blade".
  if (material === "obsidian") return obsidianDamageBonus(type);
  if (NO_FINE_BONUS.has(material)) return 0;
  if (quality === "fine") return 1;
  if (quality === "veryFine") return 2;
  return 0;
}

/**
 * The best grade a blade of this material can be made in (p. 275): plastic
 * "cannot exceed good quality (and are often cheap)". Null where the book
 * sets no ceiling.
 */
export function maxQualityFor(material: WeaponMaterial): WeaponQuality | null {
  return material === "plastic" ? "good" : null;
}

/**
 * The grade a blade of this material actually comes out at: what was asked
 * for, or the material's ceiling where that is lower. A cheap plastic blade
 * stays cheap; a fine one is good, which is as fine as plastic gets.
 */
export function gradeAfterMaterial(quality: WeaponQuality, material: WeaponMaterial): WeaponQuality {
  const ceiling = maxQualityFor(material);
  if (ceiling === null) return quality;
  return WEAPON_QUALITIES.indexOf(quality) > WEAPON_QUALITIES.indexOf(ceiling) ? ceiling : quality;
}

/**
 * What the material does to the price (p. 275): plastic is "double cost",
 * solid silver twenty times list and coated or edged three times.
 */
export function materialCostMultiplier(material: WeaponMaterial): number {
  if (material === "plastic") return 2;
  return silverCostMultiplier(material);
}

/** What it does to the weight: plastic is "halve weight" (p. 275). */
export function materialWeightMultiplier(material: WeaponMaterial): number {
  return material === "plastic" ? 0.5 : 1;
}

/**
 * What quality does to Accuracy: "+1 to Acc" for a fine firearm and +2 for a
 * very fine one (p. 279); "-1 Acc" for a cheap weapon that can be thrown
 * (p. 274).
 */
export function qualityAccuracyBonus(cls: WeaponClass, quality: WeaponQuality, thrown: boolean): number {
  if (cls === "firearm") return quality === "fine" ? 1 : quality === "veryFine" ? 2 : 0;
  if (thrown && quality === "cheap") return -1;
  return 0;
}

/** "Should this result in a Malf. of 19 or more, the weapon will not malfunction" (p. 279). */
export const MALF_NEVER_FROM = 19;

/**
 * A firearm's Malf. after its quality (Campaigns p. 407, Characters p. 279):
 * "A fine or very fine firearm gets +1 to Malf.; a cheap weapon gets -1."
 * Null for a weapon that cannot jam, before or after.
 */
export function qualityMalfunction(malfunction: number | null, quality: WeaponQuality): number | null {
  if (malfunction === null) return null;
  const adjusted = malfunction + (quality === "fine" || quality === "veryFine" ? 1 : quality === "cheap" ? -1 : 0);
  return adjusted >= MALF_NEVER_FROM ? null : adjusted;
}

/** "Increase 1/2D and Max range by 20%" for a fine bow, crossbow or blowpipe (p. 276). */
export function qualityRangeMultiplier(cls: WeaponClass, quality: WeaponQuality): number {
  return cls === "bow" && quality === "fine" ? 1.2 : 1;
}

/**
 * The breakage modifier a grade carries (p. 274): "+2 to break" for cheap,
 * "-1 to break" for fine, "-2 to break" for very fine. Read as a modifier on
 * the odds of Parrying Heavy Weapons (Campaigns p. 376).
 */
export function breakageModifier(quality: WeaponQuality): number {
  return { cheap: 2, good: 0, fine: -1, veryFine: -2 }[quality];
}

/**
 * The quality a blade breaks as (p. 275). A stone, bronze or iron blade is
 * "cheap for breakage purposes when parrying a swung weapon made of superior
 * materials", and a solid silver weapon breaks "as if of cheap quality"
 * whatever it parries; a silver-coated one keeps its own.
 */
export function breakageQuality(
  quality: WeaponQuality,
  material: WeaponMaterial,
  parryingSuperiorSwing: boolean,
): WeaponQuality {
  // Solid silver breaks as cheap whatever it meets; obsidian is "+2 to
  // breakage (as if cheap)" for the same reason, being glass.
  if (material === "silver" || material === "obsidian") return "cheap";
  if (NO_FINE_BONUS.has(material) && parryingSuperiorSwing) return "cheap";
  return quality;
}

/** The rank of a blade's material, so "superior" can be compared (p. 275). */
const MATERIAL_RANK: Readonly<Record<WeaponMaterial, number>> = {
  // Plastic is "equivalent to steel for breakage", so it ranks with steel
  // even though it weighs half as much (p. 275).
  "": 3, stone: 0, obsidian: 0, bronze: 1, iron: 2, steel: 3, wood: 0, plastic: 3,
  silver: 1, silverCoated: 3,
};

/** Whether one blade's material outranks another's. */
export function outranks(material: WeaponMaterial, other: WeaponMaterial): boolean {
  return MATERIAL_RANK[material] > MATERIAL_RANK[other];
}

/** "A stone blade has an armor divisor of (0.5) on its cutting and impaling damage" (p. 275). */
export function materialArmorDivisor(material: WeaponMaterial, type: DamageType): number | null {
  // Obsidian is "a good-quality stone blade", divisor included.
  const glassy = material === "stone" || material === "obsidian";
  return glassy && (type === "cut" || type === "imp") ? 0.5 : null;
}

// ── what a shield is made of (Characters p. 287, note [4]) ─────────────────

/**
 * "At TL3+, iron shields are available but uncommon: x5 cost, x2 weight,
 * +3 DR, and x2 HP. At TL7+, plastic riot shields (made of Lexan, etc.)
 * have x1/2 weight but otherwise identical statistics. Shield composition
 * never affects DB."
 */
export const SHIELD_COMPOSITIONS = ["wood", "iron", "plastic"] as const;
export type ShieldComposition = (typeof SHIELD_COMPOSITIONS)[number];

export interface ShieldCompositionEffect {
  costFactor: number;
  weightFactor: number;
  drBonus: number;
  hpFactor: number;
  /** The earliest tech level the book sells it at. */
  minTl: number;
}

export function shieldComposition(composition: ShieldComposition): ShieldCompositionEffect {
  switch (composition) {
    case "iron":
      return { costFactor: 5, weightFactor: 2, drBonus: 3, hpFactor: 2, minTl: 3 };
    case "plastic":
      return { costFactor: 1, weightFactor: 0.5, drBonus: 0, hpFactor: 1, minTl: 7 };
    default:
      return { costFactor: 1, weightFactor: 1, drBonus: 0, hpFactor: 1, minTl: 0 };
  }
}

/**
 * The wounding multiplier of a silver-coated or -edged weapon against a
 * creature vulnerable to silver (p. 275): "x2 becomes x1.5, x3 becomes x2,
 * and x4 becomes x3". Solid silver keeps the full multiplier.
 */
export function silverCoatedWounding(multiplier: number): number {
  if (multiplier >= 4) return 3;
  if (multiplier >= 3) return 2;
  if (multiplier >= 2) return 1.5;
  return multiplier;
}

/** What silver costs (p. 275): solid x20, coated or edged x3, bullets x50. */
export function silverCostMultiplier(material: WeaponMaterial, bullets = false): number {
  if (material === "silver") return bullets ? 50 : 20;
  if (material === "silverCoated") return 3;
  return 1;
}

/**
 * The penalty for a weapon that needs more ST than its wielder has (p. 270):
 * "you will be at -1 to weapon skill per point of ST you lack". Zero when
 * the weapon states no minimum or the wielder meets it.
 */
export function minStPenalty(st: number, minSt: number | null): number {
  if (minSt === null || minSt <= st) return 0;
  return -(minSt - st);
}
