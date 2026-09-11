/**
 * Knockdown and stunning (GURPS Basic Set: Campaigns pp. 419-420).
 *
 * The damage pipeline has been reporting "major wound -- HT roll" and leaving
 * it there. This is the roll: when it is called for, what it is made at, and
 * what failing it does to you.
 *
 * It is the hinge of a GURPS fight. A blow that does not kill can still end
 * someone's involvement in the fight entirely, and the difference between
 * shrugging it off, going down stunned, and going out cold is one HT roll.
 */

import type { HitLocation } from "./hit-locations.js";

/** Why a knockdown roll is being made, which is also what modifies it. */
export interface KnockdownInput {
  /** A single injury greater than half the target's HP, or a crippling one. */
  majorWound: boolean;
  /** Where the blow landed. */
  hitLocation?: HitLocation;
  /** Shock the blow inflicted; a head or vitals hit that causes any needs a roll. */
  shock?: number;
  /** High Pain Threshold gives +3, Low Pain Threshold -4; other traits may add. */
  traitModifier?: number;
}

/** The locations that call for a roll on any shock at all. */
const HEAD = new Set<HitLocation>(["skull", "face", "eye"]);
const VITAL = new Set<HitLocation>(["vitals", "groin"]);

/**
 * Whether the blow calls for a knockdown roll (p. 420).
 *
 * "Whenever you suffer a major wound, and whenever you are struck in the head
 * (skull, face, or eye) or vitals for enough injury to cause a shock penalty."
 */
export function knockdownRequired(input: KnockdownInput): boolean {
  if (input.majorWound) return true;

  const location = input.hitLocation;
  if (location === undefined) return false;
  const tender = HEAD.has(location) || VITAL.has(location);

  return tender && (input.shock ?? 0) !== 0;
}

/**
 * What the roll is modified by (p. 420).
 *
 * "-5 for a major wound to the face or vitals (or to the groin, on a humanoid
 * male); -10 for a major wound to the skull or eye; +3 for High Pain Threshold,
 * or -4 for Low Pain Threshold."
 *
 * The location penalties apply to a *major* wound there. A head or vitals hit
 * that merely causes shock calls for the roll without one.
 */
export function knockdownModifier(input: KnockdownInput): number {
  const traits = input.traitModifier ?? 0;
  if (!input.majorWound) return traits;

  const location = input.hitLocation;
  if (location === "skull" || location === "eye") return traits - 10;
  if (location === "face" || location === "vitals" || location === "groin") return traits - 5;
  return traits;
}

/** What a knockdown roll did. */
export type KnockdownOutcome = "unaffected" | "knockedDown" | "unconscious";

export interface KnockdownResult {
  outcome: KnockdownOutcome;
  /** True when the victim is stunned, which knockdown always includes. */
  stunned: boolean;
  /** True when they fall, and drop whatever they were holding. */
  prone: boolean;
  unconscious: boolean;
}

/**
 * Reads a HT roll as a knockdown result (p. 420).
 *
 * "On a failure, you're stunned... You fall prone (if you weren't already), and
 * if you were holding anything, you drop it... On a failure by 5 or more, or
 * any critical failure, you fall unconscious!"
 */
export function knockdownResult(roll: {
  success: boolean;
  margin: number;
  criticalFailure?: boolean;
}): KnockdownResult {
  if (roll.success) {
    return { outcome: "unaffected", stunned: false, prone: false, unconscious: false };
  }

  const out = roll.criticalFailure === true || roll.margin >= 5;
  return {
    outcome: out ? "unconscious" : "knockedDown",
    stunned: true,
    prone: true,
    unconscious: out,
  };
}

/**
 * Whether a stunned character has shaken it off (p. 420).
 *
 * "At the end of your turn, you may roll against HT. On a success, you recover
 * from stun and can act normally on subsequent turns." Mental stun is the same
 * roll against IQ, which is the caller's to choose.
 */
export function recoversFromStun(roll: { success: boolean }): boolean {
  return roll.success;
}

/** The penalty a stunned character's active defenses take (p. 420). */
export const STUN_DEFENSE_PENALTY = -4;
