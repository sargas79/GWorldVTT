/**
 * The Posture Table (GURPS Lite p. 25).
 */

import type { Posture } from "./types.js";

export interface PostureEffects {
  /** Modifier to melee attack rolls. */
  attack: number;
  /** Modifier to all active defense rolls. */
  defense: number;
  /** Modifier for others to hit you with a ranged attack. */
  target: number;
  /** Move is multiplied by this, dropping fractions. */
  moveMultiplier: number;
  /** A flat Move override in yards/second, used where the table gives one. */
  moveOverride: number | null;
  /** Whether sprinting is possible from this posture. */
  canSprint: boolean;
}

/** Attack, defense, targeting, and movement effects for each posture. */
export const POSTURE_EFFECTS: Record<Posture, PostureEffects> = {
  standing: {
    attack: 0,
    defense: 0,
    target: 0,
    moveMultiplier: 1,
    moveOverride: null,
    canSprint: true,
  },
  crouching: {
    attack: -2,
    defense: 0,
    target: -2,
    moveMultiplier: 2 / 3,
    moveOverride: null,
    canSprint: false,
  },
  kneeling: {
    attack: -2,
    defense: -2,
    target: -2,
    moveMultiplier: 1 / 3,
    moveOverride: null,
    canSprint: false,
  },
  crawling: {
    attack: -4,
    defense: -3,
    target: -2,
    moveMultiplier: 1 / 3,
    moveOverride: null,
    canSprint: false,
  },
  sitting: {
    attack: -2,
    defense: -2,
    target: -2,
    moveMultiplier: 0,
    moveOverride: 0,
    canSprint: false,
  },
  lying: {
    attack: -4,
    defense: -3,
    target: -2,
    moveMultiplier: 0,
    moveOverride: 1,
    canSprint: false,
  },
};

/** Move available in a given posture, dropping fractions. */
export function postureMove(move: number, posture: Posture): number {
  const effects = POSTURE_EFFECTS[posture];
  if (effects.moveOverride !== null) return Math.min(move, effects.moveOverride);
  return Math.floor(move * effects.moveMultiplier);
}

/**
 * Postures a character can reach in a single Change Posture maneuver.
 *
 * You cannot stand directly from lying down — you must first rise to crawling,
 * kneeling, or sitting (GURPS Lite p. 25).
 */
export function reachablePostures(from: Posture): Posture[] {
  if (from === "lying") return ["crawling", "kneeling", "sitting"];
  return (Object.keys(POSTURE_EFFECTS) as Posture[]).filter((p) => p !== from);
}

/**
 * Whether the step portion of a maneuver can be spent changing posture instead
 * of moving. Only the kneeling/standing transition qualifies (GURPS Lite p. 25).
 */
export function isStepPostureChange(from: Posture, to: Posture): boolean {
  return (
    (from === "kneeling" && to === "standing") || (from === "standing" && to === "kneeling")
  );
}
