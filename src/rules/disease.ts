/**
 * Illness (GURPS Basic Set: Campaigns pp. 442-444).
 *
 * "Diseases are defined in much the same way as poisons", and the machinery
 * here is deliberately the same shape as `poison.ts`: a resistance roll, a
 * delay, damage, an interval and a count of cycles. What differs is how you
 * catch one -- a poison is administered and a disease is caught, so the
 * contagion table is the part this file adds.
 *
 * The other difference is that a disease's injury will not heal on its own:
 * "injury from disease will not heal naturally until the victim makes his HT
 * roll to recover."
 */

import { modifier } from "./modifiers.js";

/** How a disease gets about (p. 442), which is a poison's delivery by another name. */
export type Vector = "blood" | "contact" | "digestive" | "respiratory";

/** A disease, as the book asks the GM to define one (p. 442). */
export interface Disease {
  name: string;
  vector: Vector;
  /** The disease's own virulence modifier to the HT roll. */
  resistanceModifier: number;
  /** The incubation period in seconds. "24 hours for a generic disease." */
  delaySeconds: number;
  /** Dice of toxic damage per cycle; a flat point of damage has zero dice. */
  dice: number;
  adds: number;
  /** Seconds between cycles. "The default interval is one day." */
  intervalSeconds: number;
  cycles: number;
  reference?: string;
}

/** A day for a generic disease's incubation, and another between cycles (p. 442). */
export const GENERIC_DELAY_SECONDS = 86400;
export const GENERIC_INTERVAL_SECONDS = 86400;

/** How close somebody got to a carrier (p. 443). */
export type Exposure =
  | "avoided"
  | "enteredDwelling"
  | "spokeCloseQuarters"
  | "touchedBriefly"
  | "usedBelongings"
  | "ateCookedFlesh"
  | "ateRawFlesh"
  | "prolongedContact"
  | "intimateContact";

/**
 * What each degree of contact is worth to the HT roll (p. 443).
 *
 * "The least advantageous applicable modifier from this list" -- so somebody
 * who both entered the dwelling and kissed the patient takes the -3, not the
 * sum, which is what `contagionModifier` does with a handful of them.
 */
export const CONTAGION_MODIFIERS: Readonly<Record<Exposure, number>> = {
  avoided: 4,
  enteredDwelling: 3,
  spokeCloseQuarters: 2,
  touchedBriefly: 1,
  usedBelongings: 0,
  ateCookedFlesh: 0,
  ateRawFlesh: -1,
  prolongedContact: -2,
  intimateContact: -3,
};

/**
 * The contact modifier for everything somebody did (p. 443).
 *
 * Nothing at all is the worst case rather than the best: somebody who was in
 * the plague village and cannot say what they touched gets the modifier for
 * the worst thing on the list they might have done, which is intimate contact.
 * Passing no exposures at all is a caller with nothing to say, so it reads as
 * having avoided contact, which is what "make a HT roll at the end of the day"
 * assumes of someone merely passing through.
 */
export function contagionModifier(exposures: readonly Exposure[]): number {
  if (exposures.length === 0) return CONTAGION_MODIFIERS.avoided;
  return Math.min(...exposures.map((exposure) => CONTAGION_MODIFIERS[exposure]));
}

/** What went into a wound (p. 444). */
export type WoundDirt = "clean" | "dung" | "specialInfection";

/** The base for the roll against a wound going bad (p. 444). */
export const INFECTION_BASE = 3;

/**
 * What each kind of filth in a wound is worth (p. 444).
 *
 * "These modifiers are cumulative, and replace those listed under Contagion" --
 * so unlike the contagion table these do add up, and the two are never mixed.
 */
export const INFECTION_MODIFIERS: Readonly<Record<WoundDirt, number>> = {
  clean: 0,
  dung: -2,
  specialInfection: -3,
};

/**
 * The roll against a wound becoming infected (p. 444).
 *
 * "People wounded under less-than-clean circumstances and who do not receive
 * treatment must make a HT+3 roll", modified by what got into it.
 */
export function infectionModifier(dirt: readonly WoundDirt[]): number {
  const filth = dirt.reduce((total, kind) => total + INFECTION_MODIFIERS[kind], 0);
  return modifier(INFECTION_BASE + filth);
}

/**
 * Whether antibiotics keep a wound clean by themselves (p. 444).
 *
 * "Open wounds treated with antibiotics (TL6+) never become infected except on
 * a critically failed First Aid or Physician roll."
 */
export function antibioticsPreventInfection(techLevel: number, criticalFailure = false): boolean {
  return techLevel >= 6 && !criticalFailure;
}

/** The bonus antibiotics give to shaking a disease off (p. 443). */
export const ANTIBIOTIC_BONUS = 3;

/**
 * The bonus to the cyclic rolls from treatment (p. 443).
 *
 * "At TL6+, antibiotics give +3 to recover from most bacterial diseases. At any
 * TL, a physician's care provides the same bonuses to recover from disease that
 * it gives to recover from injuries." The physician's own bonus is the medical
 * care one, which is the caller's to look up; a drug-resistant disease gets
 * nothing from the antibiotics.
 */
export function diseaseTreatmentBonus(options: {
  techLevel: number;
  antibiotics?: boolean;
  drugResistant?: boolean;
  physicianBonus?: number;
}): number {
  const drugs =
    options.antibiotics && !options.drugResistant && options.techLevel >= 6 ? ANTIBIOTIC_BONUS : 0;

  // The two are different kinds of help -- a pill and a nurse -- and the book
  // lists them separately rather than as alternatives, so they add.
  return drugs + Math.max(0, options.physicianBonus ?? 0);
}

/** What one cycle of a disease did. */
export interface DiseaseCycle {
  /** True when the victim threw it off and it is over. */
  recovered: boolean;
  cyclesSuffered: number;
  continues: boolean;
}

/**
 * One cycle of a disease (p. 442).
 *
 * "Like a cyclic poison, a disease damages its victim at regular intervals
 * until he makes a HT roll or a maximum number of cycles passes."
 */
export function diseaseCycle(options: {
  disease: Pick<Disease, "cycles">;
  resisted: boolean;
  cyclesSoFar: number;
}): DiseaseCycle {
  const suffered = Math.max(0, Math.floor(options.cyclesSoFar));

  if (options.resisted) {
    return { recovered: true, cyclesSuffered: suffered, continues: false };
  }

  const now = suffered + 1;
  return {
    recovered: false,
    cyclesSuffered: now,
    continues: now < Math.max(1, options.disease.cycles),
  };
}

/**
 * Whether that first roll means the victim is simply immune (p. 443).
 *
 * "If the GM rolls a 3 or 4 for your first attempt to resist a disease, you are
 * immune! He should note this fact and not tell you."
 */
export function naturallyImmune(firstRoll: number, isFirstExposure = true): boolean {
  return isFirstExposure && (firstRoll === 3 || firstRoll === 4);
}

/**
 * The two diseases the book gives numbers for as illustrations (p. 443).
 *
 * Statistics only, and both are the book's own worked examples of how the four
 * numbers combine into something mild or something fatal.
 */
export const DISEASE_EXAMPLES: readonly Disease[] = [
  {
    // "a virulent but mild flu that ends in a day or two"
    name: "Influenza",
    vector: "respiratory",
    resistanceModifier: -2,
    delaySeconds: GENERIC_DELAY_SECONDS,
    dice: 0,
    adds: 1,
    intervalSeconds: 43200,
    cycles: 6,
    reference: "Campaigns p. 443",
  },
  {
    // "a slower but usually fatal disease"
    name: "Wasting Sickness",
    vector: "contact",
    resistanceModifier: -5,
    delaySeconds: 3 * GENERIC_DELAY_SECONDS,
    dice: 0,
    adds: 1,
    intervalSeconds: GENERIC_INTERVAL_SECONDS,
    cycles: 30,
    reference: "Campaigns p. 443",
  },
  {
    // "A typical infection requires a daily HT roll... with failure indicating
    // the loss of 1 HP."
    name: "Infection",
    vector: "blood",
    resistanceModifier: 0,
    delaySeconds: GENERIC_DELAY_SECONDS,
    dice: 0,
    adds: 1,
    intervalSeconds: GENERIC_INTERVAL_SECONDS,
    cycles: 30,
    reference: "Campaigns p. 444",
  },
];

/** One of the named diseases, by name. */
export function diseaseNamed(name: string): Disease | null {
  return DISEASE_EXAMPLES.find((d) => d.name.toLowerCase() === name.toLowerCase()) ?? null;
}
