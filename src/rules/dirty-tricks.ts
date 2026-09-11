/**
 * Fighting unfairly (GURPS Basic Set: Campaigns p. 405).
 *
 * The section is mostly advice to the GM -- "let tricks work once, maybe twice,
 * and then assume that word has gotten around" -- and one worked example with
 * actual numbers. What can be encoded is the example and the shape of the roll;
 * what cannot is whether the trick is a good one, which is why `IQ_ROLLS` is a
 * list of the three ways the book says a GM might ask for a roll rather than a
 * function that picks one.
 */

import { penalty } from "./modifiers.js";

/**
 * The three ways a trick might be resolved (p. 405).
 *
 * "There's no hard-and-fast rule!" -- so this is a menu for the GM rather than
 * a decision the system makes.
 */
export const IQ_ROLLS = ["trickster", "victim", "quickContest"] as const;

export type TrickRoll = (typeof IQ_ROLLS)[number];

/** Liquid in the face, as a thrown weapon (p. 405). */
export const LIQUID_IN_THE_FACE = {
  /** "Treat liquid tossed in the face as a thrown weapon with Acc 1 and Max 3." */
  accuracy: 1,
  maxRangeYards: 3,
  /** "Remember the -5 to target the face!" */
  faceModifier: -5,
} as const;

/** What a splash of something did. */
export interface LiquidResult {
  /** Blinded, which only a critical hit does. */
  blinded: boolean;
  /** Seconds of blindness, when there are any. */
  blindSeconds: number;
  /** Flinched: -2 to further defenses this turn and to DX and Sense next turn. */
  flinched: boolean;
  /** True when it could have been defended and was. */
  defended: boolean;
}

/** The penalties flinching costs (p. 405). */
export const FLINCH_PENALTY = penalty(2);

/**
 * A splash of something harmless in somebody's face (p. 405).
 *
 * "On a critical hit, the liquid gets in the victim's eyes, blinding him for 1d
 * seconds. On any other hit, the target may defend normally -- but note that it
 * is impossible to parry a liquid. If he fails to defend, he must make a Will
 * roll to avoid flinching."
 */
export function liquidInTheFace(options: {
  hit: boolean;
  criticalHit?: boolean;
  /** Whether an active defense other than a parry succeeded. */
  defended?: boolean;
  /** Whether the Will roll to keep a straight face was made. */
  keptComposure?: boolean;
  /** The 1d rolled for blindness, on a critical hit. */
  blindRoll?: number;
}): LiquidResult {
  if (!options.hit) {
    return { blinded: false, blindSeconds: 0, flinched: false, defended: false };
  }

  if (options.criticalHit) {
    // No defense against a critical hit, and the GM rolls the duration secretly.
    return {
      blinded: true,
      blindSeconds: Math.max(1, Math.floor(options.blindRoll ?? 1)),
      flinched: false,
      defended: false,
    };
  }

  if (options.defended) {
    return { blinded: false, blindSeconds: 0, flinched: false, defended: true };
  }

  return {
    blinded: false,
    blindSeconds: 0,
    // "On a success, the attack has no effect... unless the victim has Bad
    // Temper!" -- which is a reaction rather than a penalty, so it is the GM's.
    flinched: options.keptComposure !== true,
    defended: false,
  };
}

/** Whether a liquid can be parried (p. 405). */
export function canParryLiquid(): boolean {
  // "It is impossible to parry a liquid." Written as a function because that is
  // where a caller will look for it.
  return false;
}
