/**
 * What running out of energy does (GURPS Basic Set: Campaigns p. 426).
 *
 * The counterpart of `healthStatus` in `injury.ts`: the same shape of chart,
 * read off fatigue rather than hit points. It matters most for the slow ways of
 * losing FP -- heat, hunger, thirst, a long march -- because those are the ones
 * that carry on past zero.
 *
 * "Thus, fatigue from starvation, dehydration, etc. will eventually kill you"
 * is the sentence this module exists for. Below 0 FP each further point of
 * fatigue is also a point of injury, which is the only reason a party can die
 * of thirst without ever being hit.
 */

/** How worn out somebody is (p. 426). */
export type FatigueStatus =
  | "fresh"
  /** Below a third: "Halve your Move, Dodge, and ST (round up)." */
  | "veryTired"
  /** At or below zero: "on the verge of collapse", and a Will roll to act. */
  | "collapsing"
  /** At -1xFP: unconscious until they recover to positive FP. */
  | "unconscious";

/**
 * Whether somebody is very tired: below a third of their fatigue (p. 426).
 *
 * The counterpart of `isReeling`, and it does the same two things -- halve Move
 * and halve Dodge -- plus halve ST.
 */
export function isVeryTired(currentFp: number, maxFp: number): boolean {
  return maxFp > 0 && currentFp < maxFp / 3;
}

/** Where somebody stands on the fatigue chart (p. 426). */
export function fatigueStatus(currentFp: number, maxFp: number): FatigueStatus {
  if (maxFp <= 0) return "fresh";

  if (currentFp <= -maxFp) return "unconscious";
  if (currentFp <= 0) return "collapsing";
  if (currentFp < maxFp / 3) return "veryTired";
  return "fresh";
}

/** What a loss of fatigue actually cost. */
export interface FatigueSpent {
  /** The new fatigue total, which never falls below -1xFP. */
  fp: number;
  /** Fatigue points actually taken off, once the floor is accounted for. */
  fpLost: number;
  /** Injury the loss also caused, a point for each FP spent at or below zero. */
  hpLost: number;
  status: FatigueStatus;
}

/**
 * Spends fatigue, including the part of it that comes out of hit points.
 *
 * "0 FP or less -- if you suffer further fatigue, each FP you lose also causes
 * 1 HP of injury", and at -1xFP "your FP can never fall below this level. After
 * this stage, any FP cost comes off your HP instead." Both halves say the same
 * thing about the injury, so the hit points lost are simply the points of the
 * loss taken from zero downwards.
 */
export function spendFatigue(options: {
  currentFp: number;
  maxFp: number;
  /** Fatigue points the rule says to take off. A gain is not spending. */
  lost: number;
}): FatigueSpent {
  const max = Math.max(0, options.maxFp);
  const lost = Math.max(0, options.lost);

  // A sheet with no fatigue pool recorded is missing a number, not a character
  // at the end of their strength: charge it the fatigue and no injury, rather
  // than turning every point of it into a wound.
  if (max <= 0) {
    return {
      fp: options.currentFp - lost,
      fpLost: lost,
      hpLost: 0,
      status: "fresh",
    };
  }

  // Everything above zero comes off fatigue for free; everything from there
  // down costs a hit point as well.
  const free = Math.max(0, Math.min(lost, options.currentFp));
  const injuring = lost - free;

  const floor = -max;
  const fp = Math.max(floor, options.currentFp - lost);

  return {
    fp,
    fpLost: options.currentFp - fp,
    hpLost: injuring,
    status: fatigueStatus(fp, max),
  };
}

// ── fatigue costs (Campaigns p. 426) ─────────────────────────────────────────

/** How long a fight has to last before it costs anything: ten seconds. */
export const BATTLE_FATIGUE_AFTER_SECONDS = 10;

/**
 * What a battle costs in fatigue: "After any battle that lasts longer than
 * 10 seconds, lose 1 FP." A skirmish over in a few turns costs nothing; a
 * fight that ran on costs a point, however long it ran, with extra effort
 * charged separately as it is spent.
 */
export function battleFatigueCost(seconds: number): number {
  return seconds > BATTLE_FATIGUE_AFTER_SECONDS ? 1 : 0;
}
