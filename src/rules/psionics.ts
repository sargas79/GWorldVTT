/**
 * Psionics (GURPS Basic Set: Characters pp. 254-257).
 *
 * "The rules in this chapter concern psionic characters in worlds where psi
 * powers are possible."
 *
 * A psi ability is not a new kind of thing. It is an ordinary advantage with a
 * limitation on it -- the power modifier -- that files it under one of the six
 * powers. Three things define a power: "a set of advantages that represent
 * different ways the power can manifest", "a special limitation, called a
 * power modifier", and "a Talent that makes it easier to use all the psi
 * abilities within the power."
 *
 * The five Talents were already in the advantages compendium and did nothing,
 * because nothing knew which abilities they were meant to help.
 */

/** "The six basic psionic powers." */
export const PSI_POWERS = [
  "antipsi", "esp", "psychicHealing", "psychokinesis", "telepathy", "teleportation",
] as const;

export type PsiPower = (typeof PSI_POWERS)[number];

/**
 * "Each psi power has its own modifier, generally worth -10%."
 *
 * Antipsi is the exception and has none: "Power Modifier: None, since Antipsi
 * abilities cannot themselves be blocked!"
 */
export const POWER_MODIFIER = -10;

/** "Most Talents cost 5 points/level." */
export const TALENT_COST_PER_LEVEL = 5;

/**
 * "You may not buy more than four levels of a given Talent without the GM's
 * permission."
 */
export const TALENT_LEVEL_CAP = 4;

/** What the book calls each power, and the Talent that goes with it. */
interface PowerDefinition {
  /** The name of its Talent, or null where it has none. */
  talent: string | null;
  /** Whether its abilities carry a power modifier. */
  hasModifier: boolean;
  /** The advantages the book lists as ways this power manifests. */
  abilities: readonly string[];
}

const POWERS: Readonly<Record<PsiPower, PowerDefinition>> = {
  // "There is no Antipsi Talent, since most of these abilities work
  // passively... Power Modifier: None."
  antipsi: {
    talent: null,
    hasModifier: false,
    abilities: ["Neutralize", "Obscure", "Psi Static", "Resistant to Psionics"],
  },
  esp: {
    talent: "ESP Talent",
    hasModifier: true,
    abilities: [
      "Channeling", "Clairsentience", "Danger Sense", "Detect", "Medium",
      "Precognition", "Psychometry", "See Invisible", "Vibration Sense",
    ],
  },
  psychicHealing: {
    talent: "Psychic Healing Talent",
    hasModifier: true,
    abilities: ["Empathy", "Healing", "Regeneration", "Regrowth"],
  },
  psychokinesis: {
    talent: "PK Talent",
    hasModifier: true,
    abilities: [
      "Binding", "Control", "Enhanced Move", "Flight", "Innate Attack",
      "Telekinesis", "Walk on Air",
    ],
  },
  telepathy: {
    talent: "Telepathy Talent",
    hasModifier: true,
    abilities: [
      "Empathy", "Mind Control", "Mind Reading", "Mind Shield", "Possession",
      "Probe", "Telesend", "Terror",
    ],
  },
  teleportation: {
    talent: "Teleportation Talent",
    hasModifier: true,
    abilities: ["Jumper", "Snatcher", "Super Jump", "Warp"],
  },
};

/** The Talent that helps this power, or null for Antipsi. */
export function talentFor(power: PsiPower): string | null {
  return POWERS[power].talent;
}

/** Whether this power's abilities carry a power modifier at all. */
export function hasPowerModifier(power: PsiPower): boolean {
  return POWERS[power].hasModifier;
}

/** The advantages the book lists as ways a power can manifest. */
export function abilitiesOf(power: PsiPower): readonly string[] {
  return POWERS[power].abilities;
}

/** Which power a Talent belongs to, or null when the name is not one. */
export function powerOfTalent(name: string): PsiPower | null {
  const wanted = name.trim().toLowerCase();
  return PSI_POWERS.find((power) => POWERS[power].talent?.toLowerCase() === wanted) ?? null;
}

/** Whether a trait name is one of the advantages a power is built from. */
export function isAbilityOf(power: PsiPower, traitName: string): boolean {
  const wanted = traitName.trim().toLowerCase();
  return POWERS[power].abilities.some((name) => name.toLowerCase() === wanted);
}

/** A trait as this module needs to read one. */
export interface PsiTrait {
  name: string;
  levels?: number;
  /** The names of the modifiers on it, which is where a power modifier shows. */
  modifiers?: readonly string[];
}

/**
 * Which power a trait has been made an ability of, or null.
 *
 * The power modifier is the thing that does it -- "an advantage with a power
 * modifier becomes part of the associated power" -- so a modifier naming a
 * power is the signal, whatever the advantage is. A Telekinesis with no
 * modifier on it is a superpower or a gadget, not a psi ability, and the book
 * is explicit that the modifier is what makes the difference.
 *
 * Antipsi is recognised by its abilities instead, since it has no modifier to
 * look for.
 */
export function powerOfAbility(trait: PsiTrait): PsiPower | null {
  const names = (trait.modifiers ?? []).map((m) => m.trim().toLowerCase());

  for (const power of PSI_POWERS) {
    if (!POWERS[power].hasModifier) continue;
    // "Telepathy", "Telepathy power modifier", "ESP (power modifier)" all name
    // the power they file the advantage under.
    const key = power === "psychokinesis" ? "pk" : power.toLowerCase();
    const label = power === "psychicHealing" ? "psychic healing" : key;
    if (names.some((m) => m.includes(label) || m.includes(power.toLowerCase()))) return power;
  }

  if (POWERS.antipsi.abilities.some((name) => name.toLowerCase() === trait.name.trim().toLowerCase())) {
    return "antipsi";
  }
  return null;
}

/** One power a character has, with what they can do and how well. */
export interface PsiPowerHeld {
  power: PsiPower;
  /** The abilities they have within it. */
  abilities: string[];
  /** Levels of its Talent, which is what a roll to use it gets. */
  talent: number;
  /**
   * True for a "latent" -- "someone who possesses a psi Talent but no actual
   * psi abilities".
   */
  latent: boolean;
}

/**
 * The powers a character holds (pp. 254-255).
 *
 * "You possess a given power if you have at least one of its psi abilities."
 * A Talent with no abilities under it is not a power held but a latent one,
 * and is listed as such rather than left out: it is the whole of what some
 * characters have.
 */
export function psionicsOf(traits: readonly PsiTrait[]): PsiPowerHeld[] {
  const abilities = new Map<PsiPower, string[]>();
  const talents = new Map<PsiPower, number>();

  for (const trait of traits) {
    const talentPower = powerOfTalent(trait.name);
    if (talentPower) {
      talents.set(talentPower, Math.max(1, Math.floor(trait.levels ?? 0) || 1));
      continue;
    }
    const power = powerOfAbility(trait);
    if (!power) continue;
    const list = abilities.get(power) ?? [];
    list.push(trait.name);
    abilities.set(power, list);
  }

  return PSI_POWERS.flatMap((power) => {
    const held = abilities.get(power) ?? [];
    const talent = talents.get(power) ?? 0;
    if (held.length === 0 && talent === 0) return [];
    return [{ power, abilities: held, talent, latent: held.length === 0 }];
  });
}

/**
 * What a Talent is worth to a roll using that power (p. 255).
 *
 * "A Talent gives a bonus to any roll to activate or otherwise use that
 * particular psionic power; e.g., Telepathy Talent 2 would give +2 to use any
 * of your telepathic abilities."
 */
export function talentBonus(powers: readonly PsiPowerHeld[], power: PsiPower): number {
  return powers.find((held) => held.power === power)?.talent ?? 0;
}

/** What a Talent costs, and whether it is past the level the GM must allow. */
export function talentCost(levels: number): { points: number; needsPermission: boolean } {
  const bought = Math.max(0, Math.floor(levels));
  return {
    points: bought * TALENT_COST_PER_LEVEL,
    needsPermission: bought > TALENT_LEVEL_CAP,
  };
}
