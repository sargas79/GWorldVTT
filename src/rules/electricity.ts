/**
 * Electricity (GURPS Basic Set: Campaigns pp. 432-433).
 *
 * "All electrical damage falls into one of two classes: nonlethal or
 * lethal." A nonlethal shock is a HT roll not to be stunned; a lethal one is
 * burning damage and then a HT roll, at -1 per 2 points of injury, not to be
 * knocked out -- and "failure by 5 or more, or any critical failure, results
 * in a heart attack". Against either, "metallic armor ... provides only DR
 * 1".
 */

/** "Metallic armor (e.g., plate armor) provides only DR 1" against a shock. */
export const METAL_ARMOR_DR = 1;

/** "The wearer ... attracts electrical attacks, giving the attacker +2 to hit" when grounded in metal. */
export const GROUNDED_METAL_TO_HIT = 2;

export interface NonlethalShock {
  stunned: boolean;
  /**
   * Seconds the stun lasts before HT rolls to recover begin: one for a jolt,
   * "(20 - HT) seconds ... with a minimum of 1" after a continuous shock ends.
   */
  stunSeconds: number;
}

/**
 * A nonlethal shock (p. 432): "On a failure, the victim is stunned. An
 * instantaneous jolt ... stuns for one second, after which time the victim
 * may roll vs. HT once per second to recover. A continuous shock ... stuns
 * for as long as the victim is in contact with the source, and for (20 - HT)
 * seconds after that, with a minimum of 1 second."
 */
export function nonlethalShock(options: { success: boolean; ht: number; continuous?: boolean }): NonlethalShock {
  if (options.success) return { stunned: false, stunSeconds: 0 };
  return {
    stunned: true,
    stunSeconds: options.continuous ? Math.max(1, 20 - options.ht) : 1,
  };
}

/**
 * The HT roll's modifier against a lethal shock: "-1 per 2 points of injury
 * suffered" (p. 432). Nothing at all when nothing got through.
 */
export function lethalShockModifier(injury: number): number {
  return -Math.floor(Math.max(0, injury) / 2);
}

export interface LethalShock {
  /** True when the victim falls unconscious. */
  unconscious: boolean;
  /** Minutes out cold after the current stops: (20 - HT), at least 1. */
  unconsciousMinutes: number;
  /** Minutes at -2 DX on coming round. */
  dazedMinutes: number;
  /** "Failure by 5 or more, or any critical failure, results in a heart attack". */
  heartAttack: boolean;
}

/** What a lethal shock's HT roll came to (p. 432). */
export function lethalShock(options: {
  success: boolean;
  criticalFailure?: boolean;
  /** Margin of failure, positive, on a failed roll. */
  margin?: number;
  ht: number;
}): LethalShock {
  if (options.success) return { unconscious: false, unconsciousMinutes: 0, dazedMinutes: 0, heartAttack: false };
  const minutes = Math.max(1, 20 - options.ht);
  return {
    unconscious: true,
    unconsciousMinutes: minutes,
    dazedMinutes: minutes,
    heartAttack: options.criticalFailure === true || Math.abs(options.margin ?? 0) >= 5,
  };
}

/** The DX penalty while dazed after a lethal shock. */
export const DAZED_DX = -2;

/**
 * A localized shock -- "attacks that don't affect the target's entire body"
 * (p. 433) -- stuns for a second on a failed HT roll at the same -1 per 2
 * injury, and never knocks out or stops the heart.
 */
export function localizedShock(options: { success: boolean }): { stunned: boolean; stunSeconds: number } {
  return options.success ? { stunned: false, stunSeconds: 0 } : { stunned: true, stunSeconds: 1 };
}
