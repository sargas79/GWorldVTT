/**
 * Acid (GURPS Basic Set: Campaigns p. 428).
 *
 * "Acids range from extremely weak to extremely strong... Most laboratory
 * acids are dangerous only to the eyes, but strong or highly concentrated
 * acids can 'burn' through equipment and flesh. For game purposes, treat
 * strong alkalis just like strong acids."
 *
 * Three ways to meet one, and they hurt at three very different rates: a
 * splash is a scratch, immersion is a second-by-second death, and swallowing
 * it is slow and stoppable.
 */

import type { DiceAdds } from "./types.js";

/** How somebody met the acid. */
export type AcidContact =
  /** "If the victim is splashed with strong acid." */
  | "splashed"
  /** "If the victim is immersed in acid." */
  | "immersed"
  /** "If the victim swallows acid." */
  | "swallowed";

/** What acid does, and how often it does it. */
export interface AcidHarm {
  /** The damage rolled, as dice and adds. */
  damage: DiceAdds;
  /** Seconds between rolls; zero for a single dose. */
  everySeconds: number;
  /** True when the damage is dealt a point at a time rather than all at once. */
  overTime: boolean;
  /** Whether this contact can take the eyes. */
  risksEyes: boolean;
}

/** "A vial of acid powerful enough to produce these effects is a TL3 item." */
export const ACID_VIAL_TL = 3;
export const ACID_VIAL_COST = 10;

/** Acid is corrosion damage, whatever it was poured on. */
export const ACID_DAMAGE_TYPE = "cor";

/** How long swallowed acid takes to do each point: "1 HP per 15 minutes". */
export const SWALLOWED_MINUTES_PER_POINT = 15;

/**
 * What a given kind of contact with strong acid does (p. 428).
 *
 * "he suffers 1d-3 points of corrosion damage" splashed, "1d-1 corrosion
 * damage per second" immersed, and "3d damage at the rate of 1 HP per 15
 * minutes" swallowed.
 */
export function acidHarm(contact: AcidContact): AcidHarm {
  switch (contact) {
    case "splashed":
      return { damage: { dice: 1, adds: -3 }, everySeconds: 0, overTime: false, risksEyes: true };
    case "immersed":
      return { damage: { dice: 1, adds: -1 }, everySeconds: 1, overTime: false, risksEyes: true };
    default:
      return {
        damage: { dice: 3, adds: 0 },
        everySeconds: SWALLOWED_MINUTES_PER_POINT * 60,
        overTime: true,
        risksEyes: false,
      };
  }
}

/** What the eyes are facing, which decides whether they are rolled for at all. */
export type AcidLanding =
  /** Anywhere but the head. */
  | "body"
  /** "If the acid splashes on his face, he must make a HT roll to avoid eye damage." */
  | "face"
  /** "or on a direct hit to the eyes, the damage is to his eyes." */
  | "eyes";

export interface EyeRisk {
  /** Whether a roll is called for at all. */
  rolls: boolean;
  /** True when the eyes take it without any roll. */
  automatic: boolean;
}

/** Whether acid landing here puts the eyes at risk (p. 428). */
export function eyeRisk(landing: AcidLanding): EyeRisk {
  if (landing === "eyes") return { rolls: false, automatic: true };
  return { rolls: landing === "face", automatic: false };
}

/** What the eyes came to after the roll, if one was made. */
export type EyeOutcome = "unharmed" | "damaged" | "blinded";

/**
 * What happened to the eyes (p. 428).
 *
 * "On a failure, or on a direct hit to the eyes, the damage is to his eyes.
 * Use the Crippling Injury rules (p. 420) to see whether he is blinded - and
 * if so, whether the blindness is permanent. On a critical failure, permanent
 * blindness is certain."
 */
export function eyeOutcome(roll: {
  success: boolean;
  criticalFailure: boolean;
}): EyeOutcome {
  if (roll.criticalFailure) return "blinded";
  return roll.success ? "unharmed" : "damaged";
}

/**
 * How long acid takes to eat through something small (p. 428).
 *
 * "Used against a lock's pins or other small, vulnerable items, acid requires
 * 3d minutes to eat through the item."
 */
export const ACID_THROUGH_A_LOCK: DiceAdds = { dice: 3, adds: 0 };

/**
 * How long it takes to stop swallowed acid (p. 428).
 *
 * "A successful Physician or Poisons roll can halt this damage; treatment
 * requires 2d minutes."
 */
export const ACID_TREATMENT_MINUTES: DiceAdds = { dice: 2, adds: 0 };

/** The skills that can stop it. */
export const ACID_TREATMENT_SKILLS = ["Physician", "Poisons"] as const;
