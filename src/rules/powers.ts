/**
 * Powers, whichever book defines them.
 *
 * The Basic Set's psionics (Characters pp. 254-257) is one framework applied
 * six times: a set of abilities, a power modifier that files an advantage
 * under the power, and a Talent that adds to every roll to use it. Other books
 * apply the same framework to powers of their own -- Monster Hunters 1 has
 * Bioenhancement and Mysticism beside its psionics (pp. 40-48) -- and those
 * cannot be recognised the way `psionics.ts` recognises the six, by a table of
 * names.
 *
 * So a trait may say which power it belongs to, and whether it is that
 * power's Talent. That is what a book's compendium entries carry. A trait that
 * says nothing is read the Basic Set's way, by its power modifier or its name,
 * which is how every psi ability already on a character works. A power a book
 * names the same as one of the six -- Monster Hunters 1's ESP -- is that
 * power, and the two ways of finding its abilities meet under one heading.
 */

import {
  PSI_POWERS,
  TALENT_LEVEL_CAP,
  psionicsOf,
  talentCost,
  talentFor,
  type PsiPower,
  type PsiTrait,
} from "./psionics.js";

/** A trait as this module reads one. */
export interface PowerTrait extends PsiTrait {
  /** The power the trait belongs to, as its entry names it, or blank. */
  power?: string;
  /** True for the power's Talent rather than one of its abilities. */
  powerTalent?: boolean;
  /** For a Talent, the levels past which the GM must agree; 0 for the default. */
  maxLevels?: number;
}

/** One power a character has. */
export interface PowerHeld {
  /** A key that does not change: one of the six's ids, or the book's name in lower case. */
  key: string;
  /** Which of the Basic Set's six this is, or null for a power only a book defines. */
  psi: PsiPower | null;
  /** The power's name as a book gives it; blank for one of the six found only by modifier. */
  name: string;
  /** The Talent's name, from the trait where one is held, or the book's for the six. */
  talentName: string | null;
  /** The abilities held within it. */
  abilities: string[];
  /** Levels of its Talent, which is what a roll to use it gets. */
  talent: number;
  /** "Someone who possesses a psi Talent but no actual psi abilities." */
  latent: boolean;
  /** Levels of Talent past which the GM must agree. */
  talentCap: number;
}

/** What the six are called, however a book spells them. */
const PSI_NAMES: Readonly<Record<string, PsiPower>> = {
  antipsi: "antipsi",
  "anti-psi": "antipsi",
  esp: "esp",
  "psychic healing": "psychicHealing",
  psychokinesis: "psychokinesis",
  pk: "psychokinesis",
  telepathy: "telepathy",
  teleportation: "teleportation",
};

/** Which of the six a power's name is, or null for a power of a book's own. */
export function psiPowerNamed(name: string): PsiPower | null {
  return PSI_NAMES[name.trim().toLowerCase()] ?? null;
}

/**
 * The powers a character holds, the Basic Set's six first in the book's
 * order and then any other in the order its traits come.
 */
export function powersOf(traits: readonly PowerTrait[]): PowerHeld[] {
  const found = new Map<string, PowerHeld>();
  const held = (key: string, psi: PsiPower | null, name: string): PowerHeld => {
    let power = found.get(key);
    if (!power) {
      power = {
        key, psi, name, talentName: psi ? talentFor(psi) : null,
        abilities: [], talent: 0, latent: false, talentCap: TALENT_LEVEL_CAP,
      };
      found.set(key, power);
    }
    return power;
  };

  const stated = traits.filter((trait) => trait.power?.trim());
  for (const trait of stated) {
    const name = trait.power!.trim();
    const psi = psiPowerNamed(name);
    const power = held(psi ?? name.toLowerCase(), psi, name);
    if (trait.powerTalent) {
      power.talent = Math.max(power.talent, Math.max(1, Math.floor(trait.levels ?? 0) || 1));
      power.talentName = trait.name;
      // "Users may buy up to six levels of Talent for each power they possess"
      // (Monster Hunters 1 p. 40), where the Basic Set allows four.
      if ((trait.maxLevels ?? 0) > 0) power.talentCap = trait.maxLevels!;
    } else {
      power.abilities.push(trait.name);
    }
  }

  // Everything that names no power is read the Basic Set's way.
  for (const psi of psionicsOf(traits.filter((trait) => !trait.power?.trim()))) {
    const power = held(psi.power, psi.power, found.get(psi.power)?.name ?? "");
    power.abilities.push(...psi.abilities);
    power.talent = Math.max(power.talent, psi.talent);
  }

  const order = (power: PowerHeld) => (power.psi ? PSI_POWERS.indexOf(power.psi) : PSI_POWERS.length);
  return [...found.values()]
    .map((power) => ({ ...power, latent: power.abilities.length === 0 && power.talent > 0 }))
    .filter((power) => power.abilities.length > 0 || power.talent > 0)
    .sort((a, b) => order(a) - order(b));
}

/** What a power's Talent costs, and whether it is past the level the GM must allow. */
export function powerTalentCost(power: Pick<PowerHeld, "talent" | "talentCap">): {
  points: number;
  needsPermission: boolean;
} {
  const bought = Math.max(0, Math.floor(power.talent));
  return { points: talentCost(bought).points, needsPermission: bought > power.talentCap };
}

/**
 * The targets for a roll to use a power: IQ, Will or Perception, each with the
 * Talent on top. "A Talent gives a bonus to any roll to activate or otherwise
 * use that particular psionic power" (Characters p. 255), and those three are
 * what the abilities of both books ask for -- "roll against your (Per + ESP
 * Talent)" (Monster Hunters 1 p. 46).
 */
export function powerRollTargets(
  power: Pick<PowerHeld, "talent">,
  scores: { IQ: number; will: number; per: number },
): { IQ: number; Will: number; Per: number } {
  return {
    IQ: scores.IQ + power.talent,
    Will: scores.will + power.talent,
    Per: scores.per + power.talent,
  };
}
