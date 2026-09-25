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

/** The active defense tried against a splash. */
export type LiquidDefense = "none" | "dodge" | "block" | "parry";

/** Whether a successful defense of this kind stops a splash (p. 405): anything but a parry. */
export function liquidDefended(defense: LiquidDefense | string): boolean {
  return defense !== "none" && defense !== "" && (defense !== "parry" || canParryLiquid());
}

/**
 * One thing a splash leaves on its victim for a while (since API 1.155.0),
 * as a timed condition: its `key`, the victim's own turns it lasts (ended at
 * the start of the last), the seconds it lasts out of combat, and the line
 * it puts on the rolls it names -- none for blindness, whose penalties are
 * the sight rules' own.
 */
export interface LiquidEffect {
  key: "flinchDefense" | "flinchNextTurn" | "blinded";
  turns: number | null;
  seconds: number;
  rolls: string[];
  value: number;
}

/** The rolls a flinch costs on the victim's next turn: DX, and the senses. */
export const FLINCH_NEXT_TURN_ROLLS = ["DX", "vision", "hearing", "tasteSmell", "touch"] as const;

/**
 * What a splash leaves on its victim (p. 405): a flinch is -2 "to further
 * defenses that turn" -- until the victim's own turn comes round -- and -2 "to
 * any DX or Sense roll on his next turn", through the end of it; blindness
 * lasts its 1d seconds.
 */
export function liquidEffects(result: LiquidResult): LiquidEffect[] {
  if (result.blinded) {
    return [{ key: "blinded", turns: null, seconds: Math.max(1, result.blindSeconds), rolls: [], value: 0 }];
  }
  if (!result.flinched) return [];
  return [
    { key: "flinchDefense", turns: 1, seconds: 1, rolls: ["defense"], value: FLINCH_PENALTY },
    { key: "flinchNextTurn", turns: 2, seconds: 2, rolls: [...FLINCH_NEXT_TURN_ROLLS], value: FLINCH_PENALTY },
  ];
}
