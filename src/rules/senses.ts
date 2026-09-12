/**
 * Sense rolls (GURPS Basic Set: Characters pp. 35-36, 123-138; Campaigns p. 358).
 *
 * "A Sense roll is a Perception roll" -- one score for all five senses, with
 * the traits that sharpen or blunt a single one added on top: Acute Vision is
 * "+1 per level to all Vision rolls" and nothing else, Hard of Hearing "-4 on
 * Hearing rolls". Blindness and Deafness are not penalties but the absence of
 * the roll.
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
}

/** One sense as the sheet rolls it: the score, or none at all. */
export interface SenseScore {
  sense: Sense;
  /** The Perception roll for this sense, or null when the sense is missing. */
  score: number | null;
  /** What the traits moved it by, for the sheet to explain. */
  modifier: number;
}

/** The score for one sense (pp. 35, 124, 129, 138). */
export function senseScore(sense: Sense, perception: number, traits: SenseTraits = {}): SenseScore {
  if (sense === "vision" && traits.blindness) return { sense, score: null, modifier: 0 };
  if (sense === "hearing" && traits.deafness) return { sense, score: null, modifier: 0 };

  let modifier = Math.max(0, Math.floor(traits.acute?.[sense] ?? 0));
  if (sense === "hearing" && traits.hardOfHearing) modifier += HARD_OF_HEARING_PENALTY;

  return { sense, score: perception + modifier, modifier };
}

/** All four senses, in the order the sheet lists them. */
export function senseScores(perception: number, traits: SenseTraits = {}): SenseScore[] {
  return SENSES.map((sense) => senseScore(sense, perception, traits));
}
