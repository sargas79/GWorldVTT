/**
 * Surge against the Electrical disadvantage (GURPS Basic Set: Characters
 * pp. 105, 134; since API 1.155.0).
 *
 * Surge marks an attack as an electrical surge. The Revised edition gives it a
 * number (p. 105): "Electronics, including characters with the Electrical
 * disadvantage, that take over 1/3 HP from this attack must roll vs. HT.
 * Failure means being disabled for seconds equal to margin of failure; critical
 * failure, until repaired." The 2004 text said only that it "can disable
 * electronics or anything with the Electrical disadvantage". Separately, a
 * character with Electrical who takes a critical hit from an electrical attack
 * short-circuits and falls unconscious, on top of the blow's other effects
 * (p. 134). What a surge does to a machine that isn't a character is the GM's.
 */

/** What a Surge blow does to a victim with Electrical. */
export type SurgeEffect =
  /** A critical hit: unconscious, on top of the damage (p. 134). */
  | "shortCircuit"
  /** More than a third of HP lost to the blow: a HT roll to stay working (p. 105). */
  | "htRoll"
  /** A third of HP or less: no roll (p. 105). */
  | "belowThird";

/** Whether the injury is "over 1/3 HP" (p. 105): more than a third of the victim's full HP, not a third exactly. */
export function overOneThirdHp(injury: number, maxHp: number): boolean {
  if (!(maxHp > 0)) return false;
  return injury * 3 > maxHp;
}

/**
 * What a blow does as a surge (pp. 105, 134): `shortCircuit` for a critical
 * hit on a victim with Electrical, `htRoll` for any other hit that took over a
 * third of the victim's HP, `belowThird` for a lesser one, and null for a blow
 * without Surge or a victim without Electrical.
 */
export function surgeEffect(options: {
  surge: boolean;
  electrical: boolean;
  criticalHit: boolean;
  /** HP the blow took from this victim. */
  injury: number;
  /** The victim's full HP. */
  maxHp: number;
}): SurgeEffect | null {
  if (!options.surge || !options.electrical) return null;
  if (options.criticalHit) return "shortCircuit";
  return overOneThirdHp(options.injury, options.maxHp) ? "htRoll" : "belowThird";
}

/** How long a failed HT roll against a surge leaves the victim disabled (p. 105). */
export type SurgeDisabled =
  /** The roll was made. */
  | { kind: "none" }
  /** "Disabled for seconds equal to margin of failure." */
  | { kind: "seconds"; seconds: number }
  /** "Critical failure, until repaired." */
  | { kind: "untilRepaired" };

/** What the HT roll against a surge cost (p. 105). */
export function surgeDisabled(roll: { success: boolean; criticalFailure: boolean; margin: number }): SurgeDisabled {
  if (roll.success) return { kind: "none" };
  if (roll.criticalFailure) return { kind: "untilRepaired" };
  return { kind: "seconds", seconds: Math.max(0, Math.floor(roll.margin)) };
}
