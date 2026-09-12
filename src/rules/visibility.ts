/**
 * Fighting what you cannot see (GURPS Basic Set: Campaigns p. 394).
 *
 * "A combat situation where some fighters can't see their foes affects attacks
 * and defenses." It affects them enormously -- a -10 is the difference between
 * a skilled fighter and a helpless one -- and until now the only way to say so
 * was to type a number into the situational modifier field and hope everyone
 * agreed on it.
 */

/** How badly the attacker is off, from worst to best. */
export type Sight =
  /** Blind, or in total darkness: nothing at all to see by. */
  | "blind"
  /** The foe is invisible, but everything else is visible. */
  | "foeUnseen"
  /** The foe cannot be seen but their position is certain -- one smoky hex. */
  | "positionKnown"
  /** Ordinary sight. */
  | "clear";

export interface SightPenalty {
  /** Modifier to the attack roll. */
  modifier: number;
  /** True when a Hearing-2 roll is needed first to find the foe at all. */
  hearingRoll: boolean;
  /** True when the hit location must be rolled rather than chosen. */
  randomHitLocation: boolean;
}

/** The Hearing penalty for locating an unseen foe (p. 394). */
export const HEARING_PENALTY = -2;

/** The eyes an attacker brings to the dark. */
export interface VisionTraits {
  /** Levels of Night Vision, each cancelling a point of darkness penalty (p. 71). */
  nightVision?: number;
  /** Dark Vision: "you can see in total darkness" (p. 47). */
  darkVision?: boolean;
  /**
   * Infravision: "you can see people and objects in the dark by the heat
   * they give off" (p. 60), which a living foe does.
   */
  infravision?: boolean;
}

/** The darkness penalty in total darkness, past which the foe is simply unseen. */
export const TOTAL_DARKNESS = 10;

/**
 * What partial darkness costs, after the eyes (pp. 71, 394).
 *
 * "Darkness gives -1 to -9 to attacks" and "each level of Night Vision allows
 * you to ignore -1 in darkness penalties"; Dark Vision and Infravision ignore
 * them entirely. Night Vision does nothing in total darkness, which is not a
 * penalty of nine but the foe unseen, and is handled by `attackWithoutSight`.
 */
export function darknessPenalty(darkness: number, eyes: VisionTraits = {}): number {
  const penalty = Math.max(0, Math.min(TOTAL_DARKNESS - 1, Math.floor(darkness)));
  if (penalty === 0) return 0;
  if (eyes.darkVision || eyes.infravision) return 0;
  const left = Math.max(0, penalty - Math.max(0, Math.floor(eyes.nightVision ?? 0)));
  return left === 0 ? 0 : -left;
}

/** Whether these eyes see a foe in total darkness as though it were day. */
export function seesInTotalDarkness(eyes: VisionTraits): boolean {
  return Boolean(eyes.darkVision || eyes.infravision);
}

/**
 * What attacking blind costs (p. 394).
 *
 * "He attacks at -10 (-6 if he is accustomed to being blind)" in total
 * darkness; -6 if only the foe is invisible; -4 if the foe's location is
 * certain. A light source in line of sight cuts total darkness to -3.
 */
export function attackWithoutSight(options: {
  sight: Sight;
  /** Blind as a way of life rather than as an accident, which is -6 not -10. */
  accustomedToBlindness?: boolean;
  /** A torch or flashlight in line of sight, which cuts darkness to -3. */
  lightSource?: boolean;
  /** Eyes that see in the dark, for whom total darkness is not blindness. */
  eyes?: VisionTraits;
}): SightPenalty {
  const { sight } = options;

  if (sight === "clear") {
    return { modifier: 0, hearingRoll: false, randomHitLocation: false };
  }

  // Total darkness is only darkness: Dark Vision sees through it, and so does
  // Infravision when what is being looked for is warm. Being blind is not.
  if (sight === "blind" && !options.accustomedToBlindness && options.eyes && seesInTotalDarkness(options.eyes)) {
    return { modifier: 0, hearingRoll: false, randomHitLocation: false };
  }

  if (sight === "blind") {
    // "any such light within line of sight reduces the penalty from -10 (total
    // darkness) to -3" -- which does nothing for someone who is actually blind.
    const modifier = options.accustomedToBlindness
      ? -6
      : options.lightSource
        ? -3
        : -10;
    return {
      modifier,
      hearingRoll: !options.lightSource,
      randomHitLocation: !options.lightSource,
    };
  }

  if (sight === "foeUnseen") {
    return { modifier: -6, hearingRoll: true, randomHitLocation: true };
  }

  // "no Hearing roll is required and the attack penalty is only -4"
  return { modifier: -4, hearingRoll: false, randomHitLocation: true };
}

export interface BlindDefense {
  /** Modifier to whichever defense is allowed. */
  modifier: number;
  /** True when any active defense may be made at all. */
  anyDefense: boolean;
  /** True when a parry or block is allowed, not merely a dodge. */
  canParryOrBlock: boolean;
}

/**
 * What defending against somebody you cannot see costs (p. 394).
 *
 * "he may dodge at -4. If the defender makes a Hearing-2 roll, he may also
 * parry or block -- still at -4. If he is completely unaware of his attacker,
 * he gets no defense at all!"
 *
 * A defender who can see the weapon coming defends normally, even if the
 * attacker is standing in the dark: "he defends normally, since he can see the
 * weapon coming."
 */
export function defendWithoutSight(options: {
  /** Whether they know they are being attacked at all. */
  aware: boolean;
  /** Whether they made the Hearing-2 roll to place the attacker. */
  heardAttacker?: boolean;
}): BlindDefense {
  if (!options.aware) return { modifier: 0, anyDefense: false, canParryOrBlock: false };

  return {
    modifier: -4,
    anyDefense: true,
    canParryOrBlock: options.heardAttacker === true,
  };
}
