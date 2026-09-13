/**
 * Running out of air (GURPS Basic Set: Campaigns p. 436).
 *
 * Written because two rules already implemented end here and stop: a choke that
 * gets through somebody's DR starts to suffocate them, and a failed Swimming
 * roll means you have inhaled water. Both said "see Suffocation" and left it
 * there.
 *
 * It is the one injury rule where the clock kills you rather than the damage:
 * "regardless of FP or HP, you die after four minutes without air."
 */

/** What is happening to the air. */
export type AirSupply =
  /** None at all: a choke, a vacuum, a held breath run out. */
  | "none"
  /** Drowning: there is air, but you are inhaling water with it. */
  | "drowning";

/** Fatigue lost per second with no air at all (p. 436). */
export const SUFFOCATION_FP_PER_SECOND = 1;

/** Seconds between Swimming rolls while drowning (p. 436). */
export const DROWNING_ROLL_SECONDS = 5;

/** Seconds without air after which you die, whatever your FP or HP. */
export const SECONDS_TO_DEATH = 4 * 60;

/** Seconds without air past which brain damage is a risk. */
export const SECONDS_TO_BRAIN_DAMAGE = 2 * 60;

export interface SuffocationSecond {
  /** Fatigue lost this second. */
  fpLost: number;
  /** True when a Will roll is needed to stay conscious. */
  willRoll: boolean;
  /** True when four minutes have passed and the character is dead. */
  dead: boolean;
  /** True once past two minutes, when brain damage is in question. */
  brainDamageRisk: boolean;
}

/**
 * One second without air (p. 436).
 *
 * "you lose 1 FP per second... At 0 FP, you must make a Will roll every second
 * or fall unconscious... Regardless of FP or HP, you die after four minutes
 * without air."
 *
 * Drowning is slower and needs its own roll: "you can get some air, but you
 * also inhale water: roll vs. Swimming every five seconds; failure costs 1 FP."
 * Whether that roll failed is the caller's to say.
 */
export function suffocationSecond(options: {
  air: AirSupply;
  /** Seconds without air so far, including this one. */
  seconds: number;
  /** Fatigue remaining before this second. */
  currentFp: number;
  /** For drowning only: whether this second's Swimming roll was failed. */
  inhaledWater?: boolean;
}): SuffocationSecond {
  const seconds = Math.max(0, Math.floor(options.seconds));

  const fpLost = options.air === "none"
    ? SUFFOCATION_FP_PER_SECOND
    : options.inhaledWater
      ? SUFFOCATION_FP_PER_SECOND
      : 0;

  return {
    fpLost,
    // At nothing left, every second is a Will roll to stay awake.
    willRoll: options.currentFp - fpLost <= 0,
    dead: options.air === "none" && seconds >= SECONDS_TO_DEATH,
    brainDamageRisk: seconds > SECONDS_TO_BRAIN_DAMAGE,
  };
}

/** How hard somebody is working while they hold their breath (p. 351). */
export type Exertion = "none" | "mild" | "heavy";

/**
 * How long somebody can hold their breath, in seconds (p. 351).
 *
 * "No Exertion (e.g., sitting quietly or meditating): HT x 10 seconds. Mild
 * Exertion (e.g., operating a vehicle, treading water, or walking): HT x 4
 * seconds. Heavy Exertion (e.g., climbing, combat, or running): HT seconds."
 * Then the multipliers: x1.5 for hyperventilating first, x2.5 for doing it on
 * pure oxygen, a further x1.5 for a successful Breath Control roll, half for
 * being surprised with no deep breath at all -- and "each level of the
 * Breath-Holding advantage doubles the time".
 */
export function holdBreathSeconds(options: {
  health: number;
  exertion: Exertion;
  hyperventilated?: "no" | "air" | "oxygen";
  breathControl?: boolean;
  surprised?: boolean;
  breathHoldingLevels?: number;
}): number {
  const base = options.exertion === "none" ? 10 : options.exertion === "mild" ? 4 : 1;
  let seconds = Math.max(0, options.health) * base;
  if (options.hyperventilated === "air") seconds *= 1.5;
  if (options.hyperventilated === "oxygen") seconds *= 2.5;
  if (options.breathControl) seconds *= 1.5;
  if (options.surprised) seconds /= 2;
  seconds *= 2 ** Math.max(0, Math.floor(options.breathHoldingLevels ?? 0));
  return Math.floor(seconds);
}

/** Whether this second calls for a drowning Swimming roll (p. 436). */
export function drowningRollDue(seconds: number): boolean {
  const elapsed = Math.max(0, Math.floor(seconds));
  return elapsed > 0 && elapsed % DROWNING_ROLL_SECONDS === 0;
}

/**
 * Whether getting air back in time still leaves a mark (p. 436).
 *
 * "If you went without air for more than two minutes, roll vs. HT to avoid
 * permanent brain damage: -1 to IQ."
 */
export function brainDamageRoll(secondsWithoutAir: number): boolean {
  return secondsWithoutAir > SECONDS_TO_BRAIN_DAMAGE;
}
