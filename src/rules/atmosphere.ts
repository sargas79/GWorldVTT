/**
 * Air, and the lack of it (GURPS Basic Set: Campaigns pp. 429, 435, 437).
 *
 * Three rules that all come down to what the atmosphere is doing to a body:
 * how thin it is, what it is made of, and what happens when there is none at
 * all. The system already had suffocation, which is where two of the three
 * end up; what it had no way to say was when somebody starts suffocating, or
 * what a corrosive atmosphere does before they do.
 */

import type { DiceAdds } from "./types.js";

// ── atmospheric pressure (p. 429) ───────────────────────────────────────────

/** How thick the air is, by the bands the book names. */
export type AirDensity = "trace" | "veryThin" | "thin" | "standard" | "dense";

/** What a band of air does to somebody in it. */
export interface AirEffect {
  /** True when there is so little air it is treated as vacuum. */
  vacuum: boolean;
  /** True when the air cannot be breathed at all. */
  suffocates: boolean;
  /** Penalty to Vision rolls without eye protection. */
  vision: number;
  /** Extra fatigue per exertion, in points. */
  extraFatigue: number;
  /** True where an hour or more calls for the altitude sickness roll. */
  altitudeSickness: boolean;
}

/**
 * Which band a pressure falls in (p. 429).
 *
 * "Trace (up to 0.01 atm.)... Very Thin (up to 0.5 atm.)... Thin (0.51-0.8
 * atm.)". Above that is the air we breathe, and a great deal above that is
 * the pressure rule's business rather than this one's.
 */
export function airDensity(atmospheres: number): AirDensity {
  if (atmospheres <= 0.01) return "trace";
  if (atmospheres <= 0.5) return "veryThin";
  if (atmospheres <= 0.8) return "thin";
  return atmospheres > 2 ? "dense" : "standard";
}

/** What that band does (p. 429). */
export function airEffect(density: AirDensity): AirEffect {
  switch (density) {
    // "Treat an atmosphere this thin as vacuum."
    case "trace":
      return { vacuum: true, suffocates: true, vision: -2, extraFatigue: 0, altitudeSickness: false };
    // "The air is too thin to breathe... Vision rolls are at -2."
    case "veryThin":
      return { vacuum: false, suffocates: true, vision: -2, extraFatigue: 0, altitudeSickness: false };
    // "Increase all fatigue costs for exertion by 1 FP. Vision rolls are at -1."
    case "thin":
      return { vacuum: false, suffocates: false, vision: -1, extraFatigue: 1, altitudeSickness: true };
    default:
      return { vacuum: false, suffocates: false, vision: 0, extraFatigue: 0, altitudeSickness: false };
  }
}

/** "Make a daily HT roll at +4" for altitude sickness. */
export const ALTITUDE_SICKNESS_BONUS = 4;

/** "anyone who breathes thin air for an hour or more must check." */
export const ALTITUDE_SICKNESS_AFTER_HOURS = 1;

/** What a day of thin air came to. */
export type AltitudeOutcome =
  /** "Critical success means acclimatization - do not roll again." */
  | "acclimatized"
  /** "Success means no effect today." */
  | "unaffected"
  /** "Failure means headaches, nausea, etc., giving -2 to DX and IQ." */
  | "sickened"
  /** "Critical failure means the victim falls into a coma after 1d hours." */
  | "coma";

/** The altitude sickness roll (p. 429). */
export function altitudeOutcome(roll: {
  success: boolean;
  criticalSuccess: boolean;
  criticalFailure: boolean;
}): AltitudeOutcome {
  if (roll.criticalSuccess) return "acclimatized";
  if (roll.criticalFailure) return "coma";
  return roll.success ? "unaffected" : "sickened";
}

/** "giving -2 to DX and IQ" while the sickness lasts. */
export const ALTITUDE_SICKNESS_PENALTY = -2;

/** "the victim falls into a coma after 1d hours." */
export const ALTITUDE_COMA_HOURS: DiceAdds = { dice: 1, adds: 0 };

// ── hazardous atmospheres (p. 429) ──────────────────────────────────────────

/** What is wrong with the air. */
export type AtmosphereHazard = "corrosive" | "toxic" | "suffocating";

/** How much of the air is the problem. */
export type HazardStrength = "trace" | "lethal" | "mostly";

export interface AtmosphereHarm {
  /** Seconds between resistance rolls; zero where no roll is allowed. */
  everySeconds: number;
  /** The HT modifier for the roll, where one is made. */
  modifier: number;
  /** Damage taken on a failure, or without a roll where none is allowed. */
  damage: DiceAdds;
  /** What kind of damage it is. */
  damageType: "cor" | "tox";
  /** True when the air also cannot be breathed. */
  suffocates: boolean;
  /** True when no roll is allowed at all. */
  unresistable: boolean;
}

const ONE_POINT: DiceAdds = { dice: 0, adds: 1 };

/**
 * What a hazardous atmosphere does (p. 429).
 *
 * Corrosive: "Small concentrations in otherwise breathable air require a roll
 * at HT to HT-4 every minute to avoid 1 point of corrosion damage."
 *
 * Toxic: "Ordinary airborne industrial pollutants might require a daily HT
 * roll to avoid 1 point of toxic damage. Lethal gases would call for a HT-2 to
 * HT-6 roll every minute."
 *
 * Either, "if such gases make up most of the atmosphere", stops being a
 * resistance roll: the corrosive kind has "effects comparable to immersion in
 * acid", the toxic kind "at least 1d toxic damage per 15 seconds (no
 * resistance possible)", and both "count as suffocating".
 *
 * The modifiers are given as ranges the GM picks from; the worse end is taken
 * here, because a number a rule hands you is more use than a range, and a GM
 * who wants the gentler end can say so.
 */
export function atmosphereHarm(options: {
  hazard: AtmosphereHazard;
  strength: HazardStrength;
}): AtmosphereHarm {
  if (options.hazard === "suffocating") {
    return {
      everySeconds: 0, modifier: 0, damage: { dice: 0, adds: 0 },
      damageType: "tox", suffocates: true, unresistable: true,
    };
  }

  const corrosive = options.hazard === "corrosive";

  if (options.strength === "mostly") {
    return {
      // "at least 1d toxic damage per 15 seconds", and the corrosive kind is
      // immersion in acid, which is 1d-1 corrosion a second (p. 428).
      everySeconds: corrosive ? 1 : 15,
      modifier: 0,
      damage: corrosive ? { dice: 1, adds: -1 } : { dice: 1, adds: 0 },
      damageType: corrosive ? "cor" : "tox",
      suffocates: true,
      unresistable: true,
    };
  }

  if (corrosive) {
    // "a roll at HT to HT-4 every minute to avoid 1 point of corrosion damage."
    return {
      everySeconds: 60, modifier: -4, damage: ONE_POINT,
      damageType: "cor", suffocates: false, unresistable: false,
    };
  }

  return options.strength === "lethal"
    // "a HT-2 to HT-6 roll every minute to avoid 1 point of toxic damage."
    ? { everySeconds: 60, modifier: -6, damage: ONE_POINT, damageType: "tox", suffocates: false, unresistable: false }
    // "a daily HT roll to avoid 1 point of toxic damage."
    : { everySeconds: 86400, modifier: 0, damage: ONE_POINT, damageType: "tox", suffocates: false, unresistable: false };
}

/**
 * What a corrosive atmosphere does to somebody as it wears them down (p. 429).
 *
 * "Victims suffer coughing after losing 1/3 their HP, blindness after losing
 * 2/3 their HP."
 */
export function corrosiveToll(options: { hpLost: number; maxHp: number }): {
  coughing: boolean;
  blinded: boolean;
} {
  const share = options.maxHp > 0 ? options.hpLost / options.maxHp : 0;
  return { coughing: share >= 1 / 3, blinded: share >= 2 / 3 };
}

// ── vacuum (p. 437) ─────────────────────────────────────────────────────────

/** "you may rupture your lungs if you try" to hold your breath. */
export const HELD_BREATH_LUNG_DAMAGE: DiceAdds = { dice: 1, adds: 0 };

/**
 * How long somebody exposed to vacuum has before suffocating (p. 437).
 *
 * "If you exhale and leave your mouth open, you can operate on the oxygen in
 * your blood for half the time listed under Holding Your Breath." Holding it
 * instead buys nothing and costs a die of injury.
 */
export function vacuumBreathSeconds(options: {
  heldBreathSeconds: number;
  mouthOpen: boolean;
}): number {
  return options.mouthOpen ? Math.floor(Math.max(0, options.heldBreathSeconds) / 2) : 0;
}

/** What a blowout does, one roll at a time (p. 437). */
export interface Decompression {
  /** "Take 1d of injury immediately." */
  injury: DiceAdds;
  /** "roll vs. HT to avoid the bends." */
  bendsModifier: number;
  /** "roll vs. HT+2 for each eye; failure means One Eye or Blindness." */
  eyeModifier: number;
  /** "roll vs. HT-1 to avoid Hard of Hearing." */
  hearingModifier: number;
}

/**
 * Explosive decompression (p. 437).
 *
 * "When an area suddenly goes from normal pressure to little or none (a
 * 'blowout'), body fluids boil, blood vessels rupture, and eardrums pop."
 */
export const EXPLOSIVE_DECOMPRESSION: Decompression = {
  injury: { dice: 1, adds: 0 },
  bendsModifier: 0,
  eyeModifier: 2,
  hearingModifier: -1,
};
