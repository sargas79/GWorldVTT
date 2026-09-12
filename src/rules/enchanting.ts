/**
 * Magic items and enchanting (GURPS Basic Set: Campaigns pp. 480-482).
 *
 * An enchantment is a spell put on an item, with a Power of its own: "An
 * item's Power equals the caster's skill with the Enchant spell or the spell
 * contained in the item, whichever is lower." The item works where its
 * Power, after the mana here, is 15 or more. Six of the Enchantment spells
 * do something to the item itself -- a bonus to hit, to DR, to damage, to
 * defenses, a stock of energy, a staff -- and the rest put a spell on it for
 * the wearer or user.
 *
 * Making one is ceremonial magic with its own two methods, a day per point
 * or an hour per hundred, and its own reading of the dice: "a roll of 16 fails
 * automatically and a roll of 17-18 is a critical failure."
 */

import type { ManaLevel } from "./casting.js";
import { resolveSuccess, type SuccessRollResult } from "./success.js";

/** The lowest Power at which a magic item works: "must be 15 or more". */
export const MINIMUM_ITEM_POWER = 15;

/** "Apply a temporary -5 to Power in a low-mana area". */
export const LOW_MANA_POWER_PENALTY = -5;

/**
 * The Enchantment spells that change the item rather than carry a spell,
 * and what each level of them costs in energy to enchant (pp. 480-481).
 * Power keeps doubling past the four the table prints.
 */
export const ENCHANTMENT_COSTS: Readonly<Record<string, readonly number[]>> = {
  Accuracy: [250, 1000, 5000],
  Deflect: [100, 500, 2000, 8000, 20000],
  Fortify: [50, 200, 800, 3000, 8000],
  Puissance: [250, 1000, 5000],
  Power: [500, 1000, 2000, 4000],
};

/** Staff: "Cost: 30." */
export const STAFF_ENERGY = 30;

/** The six enchantments that are effects on the item rather than spells for its user. */
export const EFFECT_ENCHANTMENTS = ["Accuracy", "Deflect", "Fortify", "Puissance", "Power", "Staff"] as const;

/** Whether an enchantment, by name, changes the item rather than carrying a spell. */
export function isEffectEnchantment(spell: string): boolean {
  const name = spell.trim().toLowerCase();
  return EFFECT_ENCHANTMENTS.some((e) => e.toLowerCase() === name);
}

/**
 * The energy to enchant one of the six effects at a level, or null where the
 * level is not one the book prices. Accuracy and Puissance "Divide cost by 10
 * if the subject is a missile", and Puissance doubles it "if the subject is
 * a missile weapon".
 */
export function enchantmentEnergy(
  spell: string,
  level: number,
  options: { missile?: boolean; missileWeapon?: boolean } = {},
): number | null {
  const name = spell.trim();
  if (/^staff$/i.test(name)) return STAFF_ENERGY;
  const key = Object.keys(ENCHANTMENT_COSTS).find((k) => k.toLowerCase() === name.toLowerCase());
  if (!key) return null;
  const steps = ENCHANTMENT_COSTS[key]!;
  const step = Math.floor(level);
  if (step < 1) return null;

  let energy: number;
  if (step <= steps.length) {
    energy = steps[step - 1]!;
  } else if (key === "Power") {
    // "Double the cost for each additional point."
    energy = steps[steps.length - 1]! * 2 ** (step - steps.length);
  } else {
    return null;
  }

  if (key === "Accuracy" || key === "Puissance") {
    if (options.missile) energy = energy / 10;
    if (key === "Puissance" && options.missileWeapon) energy = energy * 2;
  }
  return energy;
}

/** A row of the Magic Items Table (p. 482): what the spell costs to put on an item, and how it then works. */
export interface MagicItemEntry {
  /** Energy to enchant, or per level where `perLevel` is set. */
  energy: number;
  perLevel?: boolean;
  /** "[1] Always on. Works at all times without the addition of a Power spell." */
  alwaysOn?: boolean;
  /** "[2] Allows the user to cast the spell, but only on himself." */
  selfOnly?: boolean;
  /** "[4] Mage only." */
  mageOnly?: boolean;
}

/**
 * The Magic Items Table (p. 482), for the spells it prices. Where the table
 * lists a spell as two kinds of item, the always-on kind is what is stored:
 * a GM making the other kind edits the entry on the item.
 */
export const MAGIC_ITEMS_TABLE: Readonly<Record<string, MagicItemEntry>> = {
  Blur: { energy: 100, perLevel: true, selfOnly: true },
  "Deflect Energy": { energy: 200, alwaysOn: true },
  "Deflect Missile": { energy: 200, alwaysOn: true },
  "Explosive Fireball": { energy: 1200, alwaysOn: true },
  Fireball: { energy: 800, alwaysOn: true },
  Haste: { energy: 250, perLevel: true },
  "Icy Weapon": { energy: 750 },
  Lightning: { energy: 800, alwaysOn: true },
};

/** The table's row for a spell, by name, or null where it prices none. */
export function magicItemEntry(spell: string): MagicItemEntry | null {
  const name = spell.trim().toLowerCase();
  const key = Object.keys(MAGIC_ITEMS_TABLE).find((k) => k.toLowerCase() === name);
  return key ? MAGIC_ITEMS_TABLE[key]! : null;
}

/** One enchantment as an item carries it. */
export interface Enchantment {
  spell: string;
  /** The level of an effect enchantment -- Fortify +2 -- or how many times a per-level spell was put on. */
  level: number;
  power: number;
  /** Energy it took to make, for the record and the price. */
  energy: number;
  alwaysOn: boolean;
  mageOnly: boolean;
}

/** An item's Power where it is: -5 in low mana, nothing at all with none. */
export function itemPowerHere(power: number, mana: ManaLevel): number {
  if (mana === "none") return 0;
  return mana === "low" ? power + LOW_MANA_POWER_PENALTY : power;
}

/** "An item's Power must be 15 or more for the item to work." */
export function itemWorks(powerHere: number): boolean {
  return powerHere >= MINIMUM_ITEM_POWER;
}

/**
 * What a Power enchantment takes off the cost of the item's spells here:
 * "Each point of Power reduces the energy cost ... by 1. Halve this bonus in
 * a low-mana area (round down); double it in a high- or very high-mana area."
 */
export function powerReductionHere(points: number, mana: ManaLevel): number {
  const p = Math.max(0, Math.floor(points));
  switch (mana) {
    case "none":
      return 0;
    case "low":
      return Math.floor(p / 2);
    case "high":
    case "veryHigh":
      return p * 2;
    default:
      return p;
  }
}

/** What an item's enchantments come to, where it is. */
export interface ItemMagic {
  /** Fortify: added to the item's DR. */
  fortify: number;
  /** Accuracy: added to the user's skill with the item. */
  accuracy: number;
  /** Puissance: added to the item's basic damage. */
  puissance: number;
  /** Deflect: a Defense Bonus added to every active defense. */
  deflect: number;
  /** Power: points of energy off each spell on the item, after the mana. */
  powerReduction: number;
  /** True for a magic staff (Characters p. 240). */
  staff: boolean;
  /** The spells on it, for the user to cast or wear. */
  spells: Array<{
    index: number;
    spell: string;
    level: number;
    power: number;
    powerHere: number;
    works: boolean;
    alwaysOn: boolean;
    mageOnly: boolean;
  }>;
}

/**
 * Reads an item's enchantments in the mana here. An effect whose own Power
 * does not reach 15 here does nothing, exactly as a spell on the item would
 * not work.
 */
export function readEnchantments(list: readonly Enchantment[], mana: ManaLevel): ItemMagic {
  const out: ItemMagic = {
    fortify: 0, accuracy: 0, puissance: 0, deflect: 0, powerReduction: 0, staff: false, spells: [],
  };
  list.forEach((e, index) => {
    const powerHere = itemPowerHere(e.power, mana);
    const works = itemWorks(powerHere);
    const name = e.spell.trim().toLowerCase();
    const level = Math.max(0, Math.floor(e.level));
    if (isEffectEnchantment(e.spell)) {
      if (!works) return;
      if (name === "fortify") out.fortify += level;
      else if (name === "accuracy") out.accuracy += level;
      else if (name === "puissance") out.puissance += level;
      else if (name === "deflect") out.deflect += level;
      else if (name === "power") out.powerReduction += powerReductionHere(level, mana);
      else if (name === "staff") out.staff = true;
      return;
    }
    out.spells.push({
      index, spell: e.spell, level, power: e.power, powerHere, works,
      alwaysOn: e.alwaysOn, mageOnly: e.mageOnly,
    });
  });
  return out;
}

// ── enchanting ───────────────────────────────────────────────────────────────

/** The skill a spell must be known at to enchant with it: "15+ -- or at level 20+, in a low-mana area." */
export function enchantingThreshold(mana: ManaLevel): number {
  return mana === "low" ? 20 : 15;
}

/** Whether a caster may enchant with a spell here: both Enchant and the spell at the threshold. */
export function canEnchant(options: { enchant: number | null; spell: number | null; mana: ManaLevel }): boolean {
  const threshold = enchantingThreshold(options.mana);
  return options.enchant !== null && options.spell !== null && options.enchant >= threshold && options.spell >= threshold;
}

/** "the number of assistants allowed is the number that would reduce the caster's effective skill to 15". */
export function maxAssistants(lowerSkill: number): number {
  return Math.max(0, lowerSkill - MINIMUM_ITEM_POWER);
}

/**
 * The skill an enchanting is rolled against: the lower of Enchant and the
 * spell, "-1 to skill for each assistant", and "If anyone but the caster and
 * his assistants is within 10 yards, the spell is at a further -1."
 */
export function enchantingSkill(options: {
  enchant: number;
  spell: number;
  assistants: number;
  othersNearby: boolean;
}): number {
  return Math.min(options.enchant, options.spell) - Math.max(0, Math.floor(options.assistants)) - (options.othersNearby ? 1 : 0);
}

/**
 * The bonus for energy beyond what the spell needs (Characters p. 238):
 * "20%: +1, 40%: +2, 60%: +3, 100%: +4. Add another +1 per additional 100%
 * of the required energy."
 */
export function ceremonialBonus(required: number, available: number): number {
  if (required <= 0) return 0;
  const extra = (available - required) / required;
  if (extra >= 1) return 4 + Math.floor(extra - 1);
  if (extra >= 0.6) return 3;
  if (extra >= 0.4) return 2;
  if (extra >= 0.2) return 1;
  return 0;
}

export type EnchantingMethod = "quickAndDirty" | "slowAndSure";

/**
 * How long an enchanting takes: "one hour per 100 points of energy required
 * (round up)" for Quick and Dirty; "one 'mage-day' per point of energy
 * required ... an item that requires 100 energy points would take one mage
 * 100 days, two mages 50 days" for Slow and Sure.
 */
export function enchantingTime(options: {
  method: EnchantingMethod;
  energy: number;
  mages: number;
}): { hours: number } | { days: number } {
  const energy = Math.max(0, options.energy);
  if (options.method === "quickAndDirty") return { hours: Math.max(1, Math.ceil(energy / 100)) };
  const mages = Math.max(1, Math.floor(options.mages));
  return { days: Math.max(1, Math.ceil(energy / mages)) };
}

/**
 * An enchanting roll read as ceremonial magic is (p. 481): "a roll of 16
 * fails automatically and a roll of 17-18 is a critical failure -- even if
 * effective skill is 16+."
 */
export function resolveEnchanting(roll: number, effective: number, dice: number[] = []): SuccessRollResult {
  const ordinary = resolveSuccess(roll, effective, dice);
  if (roll === 16) return { ...ordinary, success: false, criticalSuccess: false, criticalFailure: false, margin: Math.max(0, roll - effective) };
  if (roll >= 17) return { ...ordinary, success: false, criticalSuccess: false, criticalFailure: true, margin: Math.max(0, roll - effective) };
  return ordinary;
}

/** "On a critical success, increase the Power of the item by 2d". */
export function powerOnCritical(power: number, twoDice: number): number {
  return power + Math.max(0, twoDice);
}
