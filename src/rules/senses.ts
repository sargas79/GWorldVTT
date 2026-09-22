/**
 * Sense rolls (GURPS Basic Set: Characters pp. 35-36, 123-138; Campaigns p. 358).
 *
 * "A Sense roll is a Perception roll" -- one score for all five senses, with
 * the traits that sharpen or blunt a single one added on top: Acute Vision is
 * "+1 per level to all Vision rolls" and nothing else, Hard of Hearing "-4 on
 * Hearing rolls". Blindness, Deafness and No Sense of Smell/Taste are not
 * penalties but the absence of the roll.
 */

export type Sense = "vision" | "hearing" | "tasteSmell" | "touch";

export const SENSES: readonly Sense[] = ["vision", "hearing", "tasteSmell", "touch"];

/** Hard of Hearing: "-4 on any Hearing roll" (p. 138). */
export const HARD_OF_HEARING_PENALTY = -4;

export interface SenseTraits {
  acute?: Partial<Record<Sense, number>>;
  hardOfHearing?: boolean;
  deafness?: boolean;
  blindness?: boolean;
  /** No Sense of Smell/Taste (p. 146): no Taste or Smell roll. */
  noSmellTaste?: boolean;
  /** Colorblindness (p. 127): the eyes see no colour. */
  colorblindness?: boolean;
  /** Parabolic Hearing's levels (p. 72). */
  parabolicHearing?: number;
}

/** One sense as the sheet rolls it: the score, or none at all. */
export interface SenseScore {
  sense: Sense;
  /** The Perception roll for this sense, or null when the sense is missing. */
  score: number | null;
  /** What the traits moved it by, for the sheet to explain. */
  modifier: number;
  /** Vision alone: true when no colour is seen (Colorblindness, p. 127). */
  colorblind?: boolean;
  /**
   * Hearing alone: how many times farther than usual a sound is clearly
   * heard (Parabolic Hearing, p. 72), where that is more than once.
   */
  rangeMultiplier?: number;
}

/** The score for one sense (pp. 35, 72, 124, 127, 129, 138, 146). */
export function senseScore(sense: Sense, perception: number, traits: SenseTraits = {}): SenseScore {
  if (sense === "vision" && traits.blindness) return { sense, score: null, modifier: 0 };
  if (sense === "hearing" && traits.deafness) return { sense, score: null, modifier: 0 };
  if (sense === "tasteSmell" && traits.noSmellTaste) return { sense, score: null, modifier: 0 };

  let modifier = Math.max(0, Math.floor(traits.acute?.[sense] ?? 0));
  if (sense === "hearing" && traits.hardOfHearing) modifier += HARD_OF_HEARING_PENALTY;

  const score: SenseScore = { sense, score: perception + modifier, modifier };
  // Neither is a figure on the roll: which colour, and how far off the sound
  // is, are the GM's to weigh. The row says so, so nobody has to remember.
  if (sense === "vision" && traits.colorblindness) score.colorblind = true;
  const multiplier = hearingDistanceMultiplier(traits.parabolicHearing ?? 0);
  if (sense === "hearing" && multiplier > 1) score.rangeMultiplier = multiplier;
  return score;
}

/**
 * Parabolic Hearing: "Each level ... doubles the distance at which you can
 * clearly hear any given sound" (p. 72) -- the ranges of the Hearing Distance
 * Table (Campaigns p. 358), multiplied by this.
 */
export function hearingDistanceMultiplier(levels: number): number {
  return 2 ** Math.max(0, Math.floor(Number(levels) || 0));
}

/** All four senses, in the order the sheet lists them. */
export function senseScores(perception: number, traits: SenseTraits = {}): SenseScore[] {
  return SENSES.map((sense) => senseScore(sense, perception, traits));
}

/**
 * What Telescopic Vision takes off a Vision roll's range penalty (Characters
 * p. 92): a point a level, or two a level when an Aim maneuver zooms in on the
 * target, never more than the penalty itself.
 */
export function telescopicOffset(rangePenalty: number, levels: number, zoomed: boolean): number {
  if (!(rangePenalty < 0) || !(levels > 0)) return 0;
  return Math.min(-rangePenalty, Math.floor(levels) * (zoomed ? 2 : 1));
}

/**
 * Telescopic Vision as a telescopic sight: up to +1 Accuracy a level (p. 92),
 * not added to a scope's; the better of the two counts. None with No Targeting.
 */
export function telescopicScope(scopeBonus: number, levels: number, noTargeting: boolean): number {
  const own = noTargeting ? 0 : Math.max(0, Math.floor(levels));
  return Math.max(Math.max(0, scopeBonus), own);
}
