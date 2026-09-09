/**
 * Injury, shock, knockdown, and death (GURPS Lite pp. 29-30).
 */

/** The largest DX/IQ penalty shock can inflict, regardless of injury. */
export const MAX_SHOCK_PENALTY = -4;

/**
 * Shock penalty to DX and IQ on the turn after taking injury: -1 per HP lost,
 * capped at -4 (GURPS Lite p. 30).
 *
 * Shock applies to DX- and IQ-based skills but never to active defenses.
 */
export function shockPenalty(injury: number): number {
  if (injury <= 0) return 0;
  return Math.max(MAX_SHOCK_PENALTY, -injury);
}

/**
 * A major wound is any single injury greater than half the target's maximum HP
 * (GURPS Lite p. 30). It forces a HT roll to avoid knockdown and stunning.
 */
export function isMajorWound(injury: number, maxHp: number): boolean {
  return injury > maxHp / 2;
}

/**
 * Whether a character is reeling: below one third of maximum HP, which halves
 * Move and Dodge, rounding up (GURPS Lite p. 29).
 */
export function isReeling(currentHp: number, maxHp: number): boolean {
  return currentHp < maxHp / 3;
}

/** Halves Move or Dodge for a reeling character, rounding up. */
export function halveForReeling(value: number): number {
  return Math.ceil(value / 2);
}

/**
 * Penalty to the HT roll made each turn at 0 HP or below to stay conscious:
 * -1 per full multiple of maximum HP below zero (GURPS Lite p. 29).
 */
export function consciousnessRollPenalty(currentHp: number, maxHp: number): number {
  if (currentHp > 0 || maxHp <= 0) return 0;
  const multiples = Math.floor(-currentHp / maxHp);
  return multiples === 0 ? 0 : -multiples;
}

/**
 * Whether crossing from `previousHp` to `currentHp` triggers a HT-roll-or-die
 * check. These happen at -1x, -2x, -3x, and -4x maximum HP (GURPS Lite p. 29).
 *
 * Failing such a roll by only 1 or 2 is a mortal wound rather than instant death.
 */
export function crossedDeathThreshold(
  previousHp: number,
  currentHp: number,
  maxHp: number,
): boolean {
  if (maxHp <= 0) return false;
  const multiplesCrossed = (hp: number) => (hp > 0 ? 0 : Math.floor(-hp / maxHp));
  return multiplesCrossed(currentHp) > multiplesCrossed(previousHp);
}

/** Automatic death at -5x maximum HP (GURPS Lite p. 29). */
export function isDead(currentHp: number, maxHp: number): boolean {
  return maxHp > 0 && currentHp <= -5 * maxHp;
}

/** Total bodily destruction at -10x maximum HP (GURPS Lite p. 29). */
export function isDestroyed(currentHp: number, maxHp: number): boolean {
  return maxHp > 0 && currentHp <= -10 * maxHp;
}

export type HealthStatus = "healthy" | "reeling" | "collapsing" | "dead" | "destroyed";

/** The character's overall condition at a given HP total. */
export function healthStatus(currentHp: number, maxHp: number): HealthStatus {
  if (isDestroyed(currentHp, maxHp)) return "destroyed";
  if (isDead(currentHp, maxHp)) return "dead";
  if (currentHp <= 0) return "collapsing";
  if (isReeling(currentHp, maxHp)) return "reeling";
  return "healthy";
}

export interface InjuryConsequences {
  status: HealthStatus;
  /** Shock penalty to DX and IQ on the victim's next turn only. */
  shock: number;
  /** A HT roll is required to avoid knockdown and stunning. */
  majorWound: boolean;
  /** A HT roll is required each turn to remain conscious. */
  consciousnessRollRequired: boolean;
  consciousnessRollPenalty: number;
  /** A HT roll is required immediately to avoid death. */
  deathCheckRequired: boolean;
  reeling: boolean;
}

/**
 * Everything that follows from applying `injury` hit points of damage to a
 * character, given their HP before the blow.
 */
export function applyInjury(
  injury: number,
  previousHp: number,
  maxHp: number,
): InjuryConsequences & { currentHp: number } {
  const currentHp = previousHp - injury;
  const status = healthStatus(currentHp, maxHp);
  const dead = status === "dead" || status === "destroyed";

  return {
    currentHp,
    status,
    shock: shockPenalty(injury),
    majorWound: isMajorWound(injury, maxHp),
    consciousnessRollRequired: !dead && currentHp <= 0,
    consciousnessRollPenalty: consciousnessRollPenalty(currentHp, maxHp),
    deathCheckRequired: !dead && crossedDeathThreshold(previousHp, currentHp, maxHp),
    reeling: status === "reeling" || status === "collapsing",
  };
}
