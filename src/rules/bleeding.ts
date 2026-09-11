/**
 * Bleeding (GURPS Basic Set: Campaigns p. 420).
 *
 * An optional rule, and one that changes how a fight ends: a wound that stopped
 * short of killing someone can still finish the job over the next few minutes
 * if nobody stops to bandage it.
 *
 * It is a roll a minute, and the bookkeeping is the reason the book marks it
 * optional -- which is exactly the sort of bookkeeping worth handing to a
 * computer.
 */

import { penalty } from "./modifiers.js";
import type { DamageType } from "./types.js";

/** How many minutes without bleeding end it for good (p. 420). */
export const MINUTES_TO_STOP_BLEEDING = 3;

/** What a failed bleeding roll costs, and what a critical failure costs. */
export const BLEEDING_HP = 1;
export const BLEEDING_CRITICAL_HP = 3;

/**
 * Whether a wound of this kind bleeds.
 *
 * "Cutting, impaling, and piercing wounds usually bleed; crushing wounds
 * generally don't... Minor burning and corrosion injury does not bleed
 * significantly... However, if such injury causes a major wound, treat it as a
 * bleeding wound."
 *
 * "The GM decides which wounds bleed" -- so this is what to offer them, not a
 * ruling they cannot overturn.
 */
export function woundBleeds(type: DamageType, majorWound = false): boolean {
  switch (type) {
    case "cut":
    case "imp":
    case "pi-":
    case "pi":
    case "pi+":
    case "pi++":
      return true;
    case "burn":
    case "cor":
      // Seared shut, unless the wound was bad enough to keep weeping.
      return majorWound;
    default:
      return false;
  }
}

/**
 * The HT roll a bleeding character makes each minute (p. 420).
 *
 * "make a HT roll, at -1 per 5 HP lost" -- lost, not remaining, so it gets
 * harder as the wound accumulates.
 */
export function bleedingModifier(hpLost: number): number {
  return penalty(Math.floor(Math.max(0, hpLost) / 5));
}

/** What a minute of bleeding did. */
export interface BleedingResult {
  /** Hit points lost this minute. */
  lost: number;
  /** True when the bleeding has stopped for good. */
  stopped: boolean;
  /** Minutes in a row now without bleeding, which at three ends it. */
  quietMinutes: number;
}

/**
 * One minute of bleeding (p. 420).
 *
 * "On a failure, you bleed for a loss of 1 HP. On a critical failure, you bleed
 * for 3 HP. On a critical success, the bleeding stops completely. On an
 * ordinary success, you do not bleed this minute, but must continue to roll
 * every minute. If you do not bleed for three consecutive minutes, the bleeding
 * stops for good."
 */
export function bleedingMinute(options: {
  roll: { success: boolean; criticalSuccess?: boolean; criticalFailure?: boolean };
  /** Minutes already passed without bleeding. */
  quietMinutes: number;
}): BleedingResult {
  const { roll } = options;
  const quiet = Math.max(0, Math.floor(options.quietMinutes));

  if (roll.criticalSuccess) {
    return { lost: 0, stopped: true, quietMinutes: quiet + 1 };
  }

  if (roll.success) {
    const quietNow = quiet + 1;
    return {
      lost: 0,
      stopped: quietNow >= MINUTES_TO_STOP_BLEEDING,
      quietMinutes: quietNow,
    };
  }

  // Bleeding resets the count: three quiet minutes has to mean three in a row.
  return {
    lost: roll.criticalFailure ? BLEEDING_CRITICAL_HP : BLEEDING_HP,
    stopped: false,
    quietMinutes: 0,
  };
}
