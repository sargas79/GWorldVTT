/**
 * Weapons that break (GURPS Basic Set: Campaigns pp. 376, 400-401, 483-485,
 * 556).
 *
 * A weapon can go four ways: it parries something far heavier than itself
 * and snaps; its wielder fumbles and the Critical Miss Table says it breaks;
 * somebody strikes at it and does enough damage; or it is simply worn out.
 * The first three are here, on top of the object rules in objects.ts, which
 * give a weapon its DR and HP from its weight and what it is made of.
 */

import { objectHealth, objectHitPoints, objectState, type ObjectKind, type ObjectState } from "./objects.js";
import { breakageModifier, type WeaponMaterial, type WeaponQuality } from "./weapon-quality.js";

// ── parrying heavy weapons (p. 376) ────────────────────────────────────────

/** "Your weapon may break if it parries anything three or more times its own weight." */
export const HEAVY_PARRY_RATIO = 3;

/**
 * The chance in six that a parry breaks the parrying weapon (p. 376).
 *
 * "A weapon parrying three times its own weight has a 2 in 6 chance of
 * breaking... Add +1 to these odds per whole-numbered multiple past 3."
 * Quality "modifies these odds: +2 if the parrying weapon is cheap, -1 if
 * fine, or -2 if very fine." Zero below three times the weight, and the odds
 * may pass six, which the book has a use for.
 */
export function heavyParryBreakChance(options: {
  parryingWeight: number;
  attackingWeight: number;
  quality: WeaponQuality;
  /** Odds of breakage that replace the grade's, where another book sets them. */
  breakage?: number;
}): number {
  const { parryingWeight, attackingWeight, quality } = options;
  if (parryingWeight <= 0 || attackingWeight <= 0) return 0;
  const ratio = attackingWeight / parryingWeight;
  if (ratio < HEAVY_PARRY_RATIO) return 0;
  const multiples = Math.floor(ratio);
  return Math.max(0, 2 + (multiples - HEAVY_PARRY_RATIO) + (options.breakage ?? breakageModifier(quality)));
}

/** What a heavy parry came to, given the chance and the die. */
export interface HeavyParryOutcome {
  /** The chance in six that was rolled against. */
  chance: number;
  breaks: boolean;
  /**
   * "If your weapon breaks, the parry still counts unless the odds of
   * breakage exceeded 6 in 6. If so, your weapon offered so little
   * resistance that the parry does not count!"
   */
  parryCounts: boolean;
}

export function heavyParryOutcome(chance: number, die: number): HeavyParryOutcome {
  const breaks = chance > 0 && die <= chance;
  return { chance, breaks, parryCounts: !(breaks && chance > 6) };
}

/**
 * "Treat a punch, kick, bite, etc. as a weapon with an effective weight of
 * 1/10 the attacker's ST. Use his full ST if he made a slam, flying tackle,
 * pounce, or shield rush!"
 */
export function unarmedAttackWeight(st: number, fullBody = false): number {
  return fullBody ? st : st / 10;
}

/**
 * The heaviest thing a parry can meet at all (p. 376): "you cannot parry a
 * weapon heavier than your Basic Lift -- or twice BL, if using a two-handed
 * weapon. Attempts to parry anything heavier fail automatically."
 */
export function maxParryableWeight(basicLift: number, twoHanded: boolean): number {
  return twoHanded ? 2 * basicLift : basicLift;
}

// ── the critical miss table (p. 556) ───────────────────────────────────────

/**
 * Whether a weapon rolls again on a "your weapon breaks" result (p. 556):
 * "solid crushing weapons (maces, flails, mauls, metal bars, etc.); magic
 * weapons; firearms (other than wheel-locks, guided missiles, and beam
 * weapons); and fine and very fine weapons of all kinds."
 */
export function resistsBreakage(options: {
  quality: WeaponQuality;
  /** A mace, a flail, a maul: solid, and crushing only. */
  solidCrushing: boolean;
  /** Enchanted, which the sheet knows from the item's enchantments. */
  magic: boolean;
  /** A gun -- but not a wheel-lock, a guided missile or a beam weapon. */
  firearm: boolean;
  wheelLockOrGuidedOrBeam?: boolean;
}): boolean {
  if (options.quality === "fine" || options.quality === "veryFine") return true;
  if (options.solidCrushing || options.magic) return true;
  return options.firearm && !options.wheelLockOrGuidedOrBeam;
}

/** Skills whose weapons the book lists as solid crushing ones. */
const SOLID_CRUSHING_SKILLS = new Set(["Axe/Mace", "Two-Handed Axe/Mace", "Flail", "Two-Handed Flail"]);

/** Whether a weapon used with this skill, doing only this damage, is a solid crushing one. */
export function isSolidCrushing(skill: string, damageTypes: readonly string[]): boolean {
  return SOLID_CRUSHING_SKILLS.has(skill) && damageTypes.every((t) => t === "cr");
}

// ── striking at weapons (pp. 400-401) ──────────────────────────────────────

/**
 * The penalty to hit a weapon (p. 400): "-5 to hit a reach 'C' melee weapon
 * (e.g., a knife) or a pistol; -4 to hit a melee weapon with reach 1... or a
 * medium-sized firearm (e.g., a carbine or sawed-off shotgun); and -3 to hit
 * a melee weapon with reach 2+... or a rifle."
 *
 * A melee weapon is sized by its reach. A firearm's size is read off its
 * Bulk, which is what the table has for it: a pistol is Bulk -1 to -2, a
 * carbine -3 to -4, a rifle -5 and beyond.
 */
export function strikeAtWeaponPenalty(weapon: { reach: string } | { bulk: number }): number {
  if ("reach" in weapon) {
    const reaches = weapon.reach.replace(/\*/g, "").split(/[,-]/).map((r) => r.trim()).filter(Boolean);
    const longest = Math.max(...reaches.map((r) => (r === "C" ? 0 : Number(r) || 0)), 0);
    return longest >= 2 ? -3 : longest === 1 ? -4 : -5;
  }
  const bulk = Math.abs(weapon.bulk);
  return bulk >= 5 ? -3 : bulk >= 3 ? -4 : -5;
}

/** "Attempts to disarm are generally at an extra -2" is in melee-situations; this is the strike to break. */

// ── what a weapon is made of, for damage to it (p. 483) ────────────────────

/** How damage treats a weapon: a gun is a machine, a sword is solid. */
export function weaponObjectKind(firearm: boolean): ObjectKind {
  return firearm ? "unliving" : "homogenous";
}

/**
 * A weapon's DR (p. 483): "Wooden or plastic tools... DR 2. Small metal,
 * metal-wood, or composite objects, like guns and axes, typically have DR 4.
 * Solid-metal melee weapons have DR 6."
 *
 * Where the material is not stated, a blade is solid metal, a gun is
 * composite, and a hafted weapon -- an axe, a spear, a staff -- is metal on
 * wood.
 */
const SOLID_METAL_SKILLS = new Set([
  "Broadsword", "Shortsword", "Two-Handed Sword", "Rapier", "Saber", "Smallsword",
  "Main-Gauche", "Knife", "Jitte/Sai", "Kusari", "Whip",
]);
const WOODEN_SKILLS = new Set(["Staff", "Bow", "Crossbow", "Blowpipe", "Sling", "Spear Thrower"]);

export function weaponDr(options: { material: WeaponMaterial; skill: string; firearm: boolean }): number {
  const { material, skill, firearm } = options;
  if (material === "wood" || material === "plastic") return 2;
  if (firearm) return 4;
  if (material === "stone") return 2;
  if (WOODEN_SKILLS.has(skill)) return 2;
  if (SOLID_METAL_SKILLS.has(skill)) return 6;
  if (material === "steel" || material === "iron" || material === "bronze" || material === "silver") return 6;
  return 4;
}

/** A weapon's HP from its weight (p. 483), by whether it is a machine or solid. */
export function weaponHitPoints(weightLbs: number, firearm: boolean): number {
  return objectHitPoints(weightLbs, weaponObjectKind(firearm));
}

/** What a weapon or shield is as an object: how damage treats it, and its DR, HP and HT. */
export interface ObjectStats {
  kind: ObjectKind;
  dr: number;
  hp: number;
  ht: number;
}

/**
 * A weapon's or shield's DR, HP and HT as an object (p. 483).
 *
 * A weapon's come from what it is made of and what it weighs, and its HT from
 * whether it is a machine (HT 10) or solid (HT 12). A shield's DR and HP are
 * its own (Characters p. 287), and "ordinary shields are Homogenous, with HT
 * 12" (p. 484).
 */
export function weaponObjectStats(options: {
  material: WeaponMaterial;
  skill: string;
  firearm: boolean;
  weightLbs: number;
  /** A shield's own DR and HP, in place of a weapon's. */
  shield?: { dr: number; hp: number };
}): ObjectStats {
  if (options.shield) {
    return { kind: "homogenous", dr: Math.max(0, options.shield.dr), hp: Math.max(0, options.shield.hp), ht: objectHealth("homogenous") };
  }
  const kind = weaponObjectKind(options.firearm);
  return {
    kind,
    dr: weaponDr(options),
    hp: weaponHitPoints(options.weightLbs, options.firearm),
    ht: objectHealth(kind),
  };
}

/**
 * The stats once a module has had its say: "the GM may alter these values
 * for unusually frail or tough objects", and "cheap, temperamental, or poorly
 * maintained items get -1 to -3 to HT; well-made or rugged ones get +1 or +2"
 * (p. 483). Each of DR, HP and HT a module set to a finite number is kept,
 * rounded and no lower than 0; anything else falls back to what the book gives.
 * Notes are kept where they are non-empty strings.
 */
export function settleObjectStats(
  base: ObjectStats,
  proposed: { dr?: unknown; hp?: unknown; ht?: unknown; notes?: unknown },
): ObjectStats & { notes: string[] } {
  const pick = (value: unknown, fallback: number): number =>
    typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.round(value)) : fallback;
  const notes = Array.isArray(proposed.notes)
    ? proposed.notes.filter((n): n is string => typeof n === "string" && n.trim() !== "").map((n) => n.trim())
    : [];
  return {
    kind: base.kind,
    dr: pick(proposed.dr, base.dr),
    hp: pick(proposed.hp, base.hp),
    ht: pick(proposed.ht, base.ht),
    notes,
  };
}

/** What state a weapon is in after the damage it has taken. */
export function weaponState(hpLost: number, hp: number): ObjectState {
  return objectState(hp - Math.max(0, hpLost), hp);
}

// ── broken weapons (p. 485) ────────────────────────────────────────────────

/**
 * The kinds the Broken Weapons table tells apart. A weapon "weighing 1 lb.
 * or less" or "a missile weapon (sling, bow, firearm, etc.) is useless even
 * when merely disabled"; the rest break in their own ways.
 */
export const BROKEN_WEAPON_KINDS = [
  "light", "missile", "axeMace", "polearm", "rapier", "spear", "sword", "twoHandedAxeMace", "other",
] as const;
export type BrokenWeaponKind = (typeof BROKEN_WEAPON_KINDS)[number];

/** Which paragraph of the table a weapon reads, from its skill and weight. */
export function brokenWeaponKindFor(options: {
  skill: string;
  weightLbs: number;
  ranged: boolean;
}): BrokenWeaponKind {
  if (options.ranged) return "missile";
  if (options.weightLbs <= 1) return "light";
  switch (options.skill) {
    case "Axe/Mace": return "axeMace";
    case "Two-Handed Axe/Mace": return "twoHandedAxeMace";
    case "Polearm": return "polearm";
    case "Rapier": case "Smallsword": return "rapier";
    case "Spear": return "spear";
    case "Broadsword": case "Shortsword": case "Two-Handed Sword": case "Saber": return "sword";
    default: return "other";
  }
}

/**
 * The outcomes the table names, one per paragraph and die range. Each is a
 * key the sheet puts words to; the mechanical facts -- what the wreck now
 * fights as -- are the GM's to apply from the card.
 */
export type BrokenWeaponResult =
  | "useless"
  | "axeHeadOff"
  | "polearmPole"
  | "polearmStaffAndAxe"
  | "polearmClubAndGreatAxe"
  | "rapierShortened"
  | "spearHeadOff"
  | "spearBroken"
  | "swordHalved"
  | "twoHandedHeadOff"
  | "twoHandedBroken"
  | "gmDecides";

/** What a disabled weapon becomes, on a roll of 1d (p. 485). */
export function brokenWeaponResult(kind: BrokenWeaponKind, die: number): BrokenWeaponResult {
  const low = die <= 3;
  switch (kind) {
    case "light":
    case "missile":
      return "useless";
    case "axeMace":
      return low ? "axeHeadOff" : "useless";
    case "polearm":
      return die <= 2 ? "polearmPole" : die <= 4 ? "polearmStaffAndAxe" : "polearmClubAndGreatAxe";
    case "rapier":
      return low ? "rapierShortened" : "useless";
    case "spear":
      return low ? "spearHeadOff" : "spearBroken";
    case "sword":
      return low ? "swordHalved" : "useless";
    case "twoHandedAxeMace":
      return low ? "twoHandedHeadOff" : "twoHandedBroken";
    default:
      return "gmDecides";
  }
}

/**
 * Whether a weapon in this state is destroyed outright, disabled but maybe
 * still usable, or fine (p. 485): "If a weapon is destroyed -- that is, it
 * failed a HT roll at -1xHP or below, or went to -5xHP -- it is completely
 * useless. But if it is just disabled, it might still be usable."
 */
export type WeaponCondition = "sound" | "damaged" | "disabled" | "destroyed";

export function weaponCondition(state: ObjectState): WeaponCondition {
  switch (state) {
    case "sound": return "sound";
    case "damaged": return "damaged";
    case "failing": case "breaking": return "disabled";
    case "destroyed": return "destroyed";
  }
}
