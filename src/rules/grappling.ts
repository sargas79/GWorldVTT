/**
 * Grappling (GURPS Basic Set: Campaigns pp. 370-371).
 *
 * The part of a fight that is not about weapons. Somebody takes hold of you,
 * and from that moment most of what you could do a second ago is gone: you
 * cannot move away, cannot aim, cannot swing anything longer than a dagger,
 * and getting loose is a contest you have to win rather than a decision you get
 * to make.
 *
 * It is almost all contests and modifiers, which is why it is worth writing
 * down: a table running it from memory gets the +5s and the +10s wrong, and
 * those are the difference between a fight and a formality.
 */

import type { Posture } from "./types.js";
import { POSTURE_EFFECTS } from "./posture.js";

/** The DX penalty a grappled character takes with the part being held (p. 370). */
export const GRAPPLED_DX_PENALTY = -4;

/**
 * The bonus for grappling with more than two arms (p. 370).
 *
 * "If you grapple with more than two arms, each arm beyond the first two gives
 * a bonus of +2 to hit."
 */
export function extraArmBonus(arms: number): number {
  return 2 * Math.max(0, Math.floor(arms) - 2);
}

/**
 * Whether a grappled character can still walk away (p. 370).
 *
 * "If you grapple a foe of more than twice your ST, you do not prevent him from
 * moving away -- you're just extra encumbrance for him!" -- so the grappler has
 * to be at least half the victim's ST to hold them at all.
 */
export function preventsMovement(grapplerSt: number, victimSt: number): boolean {
  return victimSt <= grapplerSt * 2;
}

/** What holds a grappled character in place, for the break-free contest. */
export interface GripInput {
  /** Hands the grappler has on them: one is a weaker hold than two. */
  hands?: number;
  /** True when the victim is pinned, which is much harder to escape. */
  pinned?: boolean;
  /** Arms the grappler is using, where each past two is worth another +2. */
  arms?: number;
  /** A stunned grappler is holding on badly. */
  grapplerStunned?: boolean;
  /** An unconscious grappler is not holding on at all. */
  grapplerUnconscious?: boolean;
}

export interface BreakFree {
  /** The grappler's bonus in the Quick Contest of ST. */
  grapplerBonus: number;
  /** True when no contest is needed because nobody is holding on. */
  automatic: boolean;
  /** Seconds between attempts: ten when pinned, one otherwise. */
  secondsBetweenAttempts: number;
}

/**
 * What it takes to break free (p. 371).
 *
 * "Your foe has +5 if he is grappling you with two hands. If he has you pinned,
 * he rolls at +10 if using two hands or at +5 if using only one. If either of
 * you has three or more arms, each arm beyond the first two gives +2. If your
 * foe is stunned, he rolls at -4; if he falls unconscious, you are
 * automatically free! ... you may only attempt to break free once every 10
 * seconds" when pinned.
 */
export function breakFree(grip: GripInput = {}): BreakFree {
  const hands = Math.max(1, Math.floor(grip.hands ?? 2));
  const pinned = grip.pinned === true;

  if (grip.grapplerUnconscious) {
    return { grapplerBonus: 0, automatic: true, secondsBetweenAttempts: 1 };
  }

  let bonus = pinned ? (hands >= 2 ? 10 : 5) : hands >= 2 ? 5 : 0;
  bonus += extraArmBonus(grip.arms ?? 0);
  if (grip.grapplerStunned) bonus -= 4;

  return {
    grapplerBonus: bonus,
    automatic: false,
    secondsBetweenAttempts: pinned ? 10 : 1,
  };
}

/**
 * The attacker's modifier for a takedown (p. 370).
 *
 * "Roll a Quick Contest, with each contestant using the highest of ST, DX, or
 * his best grappling skill. If you are not standing, you have a penalty equal
 * to the usual penalty to hit for your posture."
 */
export function takedownModifier(posture: Posture): number {
  return POSTURE_EFFECTS[posture].attack;
}

/** The score each side brings to a takedown: their best of three. */
export function takedownScore(options: {
  strength: number;
  dexterity: number;
  grapplingSkill?: number | null;
}): number {
  return Math.max(
    options.strength,
    options.dexterity,
    options.grapplingSkill ?? Number.NEGATIVE_INFINITY,
  );
}

/**
 * The attacker's modifier in a pin (p. 370).
 *
 * "The larger fighter gets +3 for every point by which his Size Modifier
 * exceeds that of his foe. The fighter with the most free hands gets +3."
 *
 * Only available against a foe already on the ground, and only while grappling
 * their torso -- which is the caller's to check, because it is a fact about the
 * fight rather than about the arithmetic.
 */
export function pinModifier(options: {
  sizeModifier?: number;
  foeSizeModifier?: number;
  freeHands?: number;
  foeFreeHands?: number;
}): number {
  const size = (options.sizeModifier ?? 0) - (options.foeSizeModifier ?? 0);
  const larger = size > 0 ? 3 * size : 0;
  const hands = (options.freeHands ?? 0) > (options.foeFreeHands ?? 0) ? 3 : 0;
  return larger + hands;
}

/**
 * The modifier for choking or strangling (p. 370).
 *
 * "You are at -5 if you use only one hand, but at +2 per hand after the first
 * two. If your Size Modifier exceeds your foe's, you can grapple and squeeze
 * his torso instead, in which case you roll at -5 unless you have Constriction
 * Attack."
 */
export function chokeModifier(options: {
  hands?: number;
  /** Squeezing the torso rather than holding the neck. */
  aroundTorso?: boolean;
  constrictionAttack?: boolean;
}): number {
  const hands = Math.max(1, Math.floor(options.hands ?? 2));

  let modifier = hands === 1 ? -5 : 2 * Math.max(0, hands - 2);
  if (options.aroundTorso && !options.constrictionAttack) modifier -= 5;

  return modifier;
}

/**
 * Damage from a choke, which is the margin of victory (p. 370).
 *
 * "If you win, your foe takes crushing damage equal to your margin of victory.
 * DR protects normally." The neck's own wounding multiplier is applied by the
 * damage pipeline, as it is for any blow that lands there.
 */
export function chokeDamage(marginOfVictory: number): number {
  return Math.max(0, Math.round(marginOfVictory));
}

/** The skills a grapple may be rolled against, best first. */
export const GRAPPLING_SKILLS = ["Judo", "Wrestling", "Sumo Wrestling", "Brawling"] as const;

/**
 * Whether a grappled character may take a Move maneuver (p. 371).
 *
 * "If you have been grappled, you cannot take a Move maneuver unless you have
 * at least twice your foe's ST."
 */
export function canMoveWhileGrappled(victimSt: number, grapplerSt: number): boolean {
  return victimSt >= grapplerSt * 2;
}
