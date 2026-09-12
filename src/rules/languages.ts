/**
 * Speaking the language, and knowing the customs (GURPS Basic Set:
 * Characters pp. 23-24).
 *
 * A language is known at one of four levels, and the sheet has held that
 * since GURPS Lite. What it did not do was charge for it. "Broken: ... -3 on
 * any skill roll that involves the language", "Accented: ... -1", and at None
 * there is no roll at all. Cultural Familiarity is the same idea for manners:
 * without it, "-3 on all Influence rolls and reaction rolls" in that culture.
 */

export type Comprehension = "none" | "broken" | "accented" | "native";

/** The penalty each level of comprehension puts on a roll made in the language (p. 24). */
const COMPREHENSION_PENALTY: Readonly<Record<Comprehension, number | null>> = {
  none: null,
  broken: -3,
  accented: -1,
  native: 0,
};

/**
 * What using a language at this level costs, or null when it cannot be used
 * at all.
 */
export function languagePenalty(level: Comprehension): number | null {
  return COMPREHENSION_PENALTY[level];
}

/** "-3 on all Influence rolls and reaction rolls" in an unfamiliar culture (p. 23). */
export const UNFAMILIAR_CULTURE_PENALTY = -3;

/** A trait as the sheet holds it, for reading Cultural Adaptability off. */
export interface CultureTrait {
  name: string;
}

/**
 * Whether the character is at home in every culture (p. 46).
 *
 * "Cultural Adaptability: You are familiar with ... all cultures" -- so the
 * penalty never applies, and Xeno-Adaptability is the same for alien ones.
 */
export function culturallyAdaptable(traits: readonly CultureTrait[]): boolean {
  return traits.some((t) => {
    const key = t.name.trim().toLowerCase();
    return key === "cultural adaptability" || key === "xeno-adaptability";
  });
}

/** The penalty for an unfamiliar culture, unless the character adapts to any. */
export function culturePenalty(unfamiliar: boolean, traits: readonly CultureTrait[]): number {
  if (!unfamiliar || culturallyAdaptable(traits)) return 0;
  return UNFAMILIAR_CULTURE_PENALTY;
}
