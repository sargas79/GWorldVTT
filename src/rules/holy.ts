/**
 * Holy attacks (GURPS Monster Hunters 1: Champions p. 51).
 *
 * Demons and vampires take injury from holy water and significant holy
 * objects. Fleeting contact is enough -- 1d, ignoring all DR -- but once burned
 * the wound "fizzes" for a minute, and until it stops no holy source hurts that
 * creature again. So a demon submerged in holy water takes 1d a minute, and a
 * holy weapon's blessing counts once in a fight and not on every swing.
 *
 * Who is hurt by it is whoever has a Weakness to holy things, which is how the
 * book's own races are built: "Weakness (Contact with holy water and
 * artifacts; 1d per minute)" (p. 50). The ordinary damage of a holy weapon is
 * applied as any other; this is the extra.
 */

/** How long a holy burn fizzes, in seconds of game time. */
export const HOLY_FIZZ_SECONDS = 60;

/** Whether any of a character's Weaknesses is to holy things. */
export function vulnerableToHoly(weaknesses: ReadonlyArray<{ source: string }>): boolean {
  return weaknesses.some((weakness) => /\bholy\b/i.test(weakness.source));
}

/**
 * What one contact with a holy source does.
 *
 * `fizzingUntil` is the game time the last burn stops fizzing, or zero. A
 * creature with no Weakness to holy things is untouched and nothing changes; a
 * fizzing one is untouched and the minute is not restarted, since it is the
 * first burn's minute that has to pass.
 */
export function holyContact(options: {
  vulnerable: boolean;
  fizzingUntil: number;
  now: number;
}): { burns: boolean; fizzing: boolean; fizzingUntil: number } {
  const { vulnerable, fizzingUntil, now } = options;
  if (!vulnerable) return { burns: false, fizzing: false, fizzingUntil };
  if (now < fizzingUntil) return { burns: false, fizzing: true, fizzingUntil };
  return { burns: true, fizzing: false, fizzingUntil: now + HOLY_FIZZ_SECONDS };
}
