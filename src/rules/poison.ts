/**
 * Poison (GURPS Basic Set: Campaigns pp. 437-439).
 *
 * A poison is a small machine with six parts: how it gets in, how long it
 * waits, what roll resists it, what it does, how often it does it again, and
 * how many times. Everything else in the section -- dosage, treatment, the
 * named examples -- is a modifier to one of those six.
 *
 * Nothing here rolls anything. The system layer rolls the HT and posts the
 * card; this works out what the roll is against and what a failure costs.
 */

import { modifier, penalty } from "./modifiers.js";

/** How a poison reaches its victim (p. 437). */
export type PoisonDelivery =
  /** A mucous membrane or an open wound. */
  | "blood"
  /** Inhaled or touching skin. */
  | "contact"
  /** Swallowed. */
  | "digestive"
  /** Carried in on a piercing or impaling weapon that did damage. */
  | "followUp"
  /** Breathed into the lungs. */
  | "respiratory"
  /** Through one particular sense. */
  | "senseBased";

/** What a poison does to whatever it is measured against. */
export type PoisonDamage = "toxic" | "fatigue" | "none";

/** A poison, as the book describes one (p. 437). */
export interface Poison {
  name: string;
  delivery: PoisonDelivery[];
  /** Seconds between the dose and the first roll. Zero for a fast poison. */
  delaySeconds: number;
  /** The modifier to the HT roll, or null where there is no roll to make. */
  resistanceModifier: number | null;
  damage: PoisonDamage;
  /** Dice of damage per cycle; a poison doing a flat point has zero dice. */
  dice: number;
  adds: number;
  /** Seconds between cycles. */
  intervalSeconds: number;
  /** How many cycles it runs for at most. */
  cycles: number;
  /** Where the book gives one, so a card can cite it. */
  reference?: string;
}

/**
 * How long the delay is for a victim of this size (p. 437).
 *
 * "Each +1 to SM doubles the delay; each -1 to SM halves the delay." Written as
 * a power of two rather than a loop, so a hummingbird and a whale both work.
 */
export function delayForSize(delaySeconds: number, sizeModifier: number): number {
  const delay = Math.max(0, delaySeconds);
  if (delay === 0) return 0;
  return delay * Math.pow(2, sizeModifier);
}

/** What varying the dose does to a poison (p. 438). */
export interface Dosage {
  /** Multiplier on the delay and on the interval between cycles. */
  timeMultiplier: number;
  /** Multiplier on the damage. */
  damageMultiplier: number;
  /** Modifier to the victim's HT roll to resist. */
  resistanceModifier: number;
  /** Bonus to every roll made to detect the poison, the victim's included. */
  detectionBonus: number;
}

/**
 * A dose bigger or smaller than the standard one (p. 438).
 *
 * "Each doubling of dosage (and cost!) halves the delay and interval, doubles
 * damage, gives -2 to HT rolls to resist, and gives +2 to all rolls to detect
 * the poison." Halvings run the other way: "using less than one full dose may
 * reverse these modifiers or simply make the poison ineffective, at the GM's
 * option", and reversing them is the half this can compute.
 */
export function dosage(doublings: number): Dosage {
  const steps = Math.round(doublings);
  return {
    timeMultiplier: Math.pow(2, -steps),
    damageMultiplier: Math.pow(2, steps),
    resistanceModifier: modifier(-2 * steps),
    detectionBonus: modifier(2 * steps),
  };
}

/** A treatment somebody tried, and what the book gives it (p. 439). */
export type Treatment =
  /** A minute's work and a First Aid or Physician roll at -2. */
  | "suckWound"
  /** Ten seconds and a First Aid or Physician roll, for a digestive agent. */
  | "induceVomiting"
  /** The right antidote, which is specific to the poison. */
  | "antidote"
  /** Chelation, lavage, fluids -- a Physician roll, and capped by tech level. */
  | "medical";

/**
 * The bonus a treatment gives to the HT rolls to resist (p. 439).
 *
 * Sucking the wound and inducing vomiting are +2 each. Medical procedures are
 * "TL/2 (round up, minimum +1)". An antidote is whatever the poison's own
 * description says, so it is the caller's number and not one this can know.
 */
export function treatmentBonus(treatment: Treatment, techLevel = 3): number {
  if (treatment === "suckWound" || treatment === "induceVomiting") return 2;
  if (treatment === "medical") return Math.max(1, Math.ceil(Math.max(0, techLevel) / 2));
  return 0;
}

/** The roll a treatment itself calls for, before it does any good (p. 439). */
export function treatmentRollModifier(treatment: Treatment): number {
  // "Sucking the poison from the wound... requires a First Aid or Physician
  // roll at -2"; inducing vomiting calls for the same roll unmodified.
  return treatment === "suckWound" ? penalty(2) : 0;
}

/** What one cycle of a poison did. */
export interface PoisonCycle {
  /** True when the victim threw the poison off and it is over. */
  shakenOff: boolean;
  /** Cycles of damage suffered so far, this one included. */
  cyclesSuffered: number;
  /** True when there is another cycle still to come. */
  continues: boolean;
}

/**
 * One cycle of a poison (p. 438).
 *
 * "If a resistible poison is cyclic, the victim gets a new HT roll to resist
 * every cycle. On a success, he shakes off the poison; on a failure, an
 * additional cycle of damage occurs."
 *
 * A poison with no resistance roll at all -- cyanide is the book's example --
 * runs its cycles out whatever the victim does, which is what `resisted: null`
 * says here.
 */
export function poisonCycle(options: {
  poison: Pick<Poison, "cycles" | "resistanceModifier">;
  /** Whether the HT roll was made, or null where the poison allows none. */
  resisted: boolean | null;
  /** Cycles of damage already suffered, before this one. */
  cyclesSoFar: number;
}): PoisonCycle {
  const suffered = Math.max(0, Math.floor(options.cyclesSoFar));

  if (options.resisted === true) {
    return { shakenOff: true, cyclesSuffered: suffered, continues: false };
  }

  const now = suffered + 1;
  return {
    shakenOff: false,
    cyclesSuffered: now,
    continues: now < Math.max(1, options.poison.cycles),
  };
}

/**
 * The fractions of a victim's hit points at which worse symptoms appear (p. 438).
 *
 * "Poisons that inflict toxic damage may have more severe symptoms that occur
 * automatically after the poison causes enough injury (usually 1/3, 1/2, or 2/3
 * of the victim's HP)... Symptoms vanish when the victim's HP rise above this
 * threshold."
 */
export const SYMPTOM_THRESHOLDS = [1 / 3, 1 / 2, 2 / 3] as const;

/** Whether a symptom at this threshold is currently showing (p. 438). */
export function symptomShowing(options: {
  hpLostToPoison: number;
  maxHp: number;
  threshold: number;
}): boolean {
  if (options.maxHp <= 0) return false;
  return options.hpLostToPoison >= options.maxHp * options.threshold;
}

/**
 * How long an effect other than damage lasts (p. 438).
 *
 * "The default duration is a number of minutes equal to the margin of failure
 * on the resistance roll."
 */
export function effectMinutes(marginOfFailure: number): number {
  return Math.max(0, Math.floor(marginOfFailure));
}

/**
 * The poisons the book gives statistics for (p. 439).
 *
 * Statistics only: what a poison does, not what the book says about it. A GM
 * who wants something else builds it out of the same six numbers.
 */
export const POISON_EXAMPLES: readonly Poison[] = [
  {
    name: "Arsenic",
    delivery: ["digestive"],
    delaySeconds: 3600,
    resistanceModifier: -2,
    damage: "toxic",
    dice: 1,
    adds: 0,
    intervalSeconds: 3600,
    cycles: 8,
    reference: "Campaigns p. 439",
  },
  {
    name: "Cobra Venom",
    delivery: ["followUp"],
    delaySeconds: 60,
    resistanceModifier: -3,
    damage: "toxic",
    dice: 2,
    adds: 0,
    intervalSeconds: 3600,
    cycles: 6,
    reference: "Campaigns p. 439",
  },
  {
    // "In all cases, there is no HT roll to resist!"
    name: "Cyanide",
    delivery: ["followUp", "respiratory", "contact", "digestive"],
    delaySeconds: 0,
    resistanceModifier: null,
    damage: "toxic",
    dice: 4,
    adds: 0,
    intervalSeconds: 0,
    cycles: 1,
    reference: "Campaigns p. 439",
  },
  {
    name: "Mustard Gas",
    delivery: ["respiratory", "contact"],
    delaySeconds: 7200,
    resistanceModifier: -1,
    damage: "toxic",
    dice: 1,
    adds: 0,
    intervalSeconds: 3600,
    cycles: 6,
    reference: "Campaigns p. 439",
  },
  {
    name: "Nerve Gas",
    delivery: ["contact"],
    delaySeconds: 0,
    resistanceModifier: -6,
    damage: "toxic",
    dice: 2,
    adds: 0,
    intervalSeconds: 60,
    cycles: 6,
    reference: "Campaigns p. 439",
  },
  {
    name: "Tear Gas",
    delivery: ["respiratory", "senseBased"],
    delaySeconds: 0,
    resistanceModifier: -2,
    damage: "none",
    dice: 0,
    adds: 0,
    intervalSeconds: 0,
    cycles: 1,
    reference: "Campaigns p. 439",
  },
];

/** One of the named poisons, by name. */
export function poisonNamed(name: string): Poison | null {
  return POISON_EXAMPLES.find((p) => p.name.toLowerCase() === name.toLowerCase()) ?? null;
}
