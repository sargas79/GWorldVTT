/**
 * An attribute as the rest of the system should read it.
 *
 * The four attributes are bought on the sheet, and a few traits add to them
 * -- Extra ST is a point of ST wherever ST is read. The derived block carries
 * the sum; the stored field carries only what was bought. Anything that
 * rolls against an attribute reads the sum, and falls back to the stored
 * figure for an actor prepared without one.
 */

export function attributeOf(actor: any, attribute: string, fallback = 10): number {
  const derived = Number(actor?.system?.derived?.attributes?.[attribute]);
  if (Number.isFinite(derived) && derived > 0) return derived;
  const stored = Number(actor?.system?.attributes?.[attribute]);
  return Number.isFinite(stored) && stored > 0 ? stored : fallback;
}

/**
 * What Fit adds to a HT roll (Characters p. 55): "+1 to all HT rolls" for
 * Fit, +2 for Very Fit, and nothing for anybody else.
 */
export function healthRollBonus(actor: any): number {
  return Number(actor?.system?.derived?.healthRollBonus) || 0;
}

/**
 * HT as a HT roll is made against.
 *
 * The attribute with Fit added, which is what every roll "vs. HT" in the book
 * means for somebody who has it -- to stay conscious, to resist a poison, to
 * keep going in the heat. Not the score a HT-based skill is built on.
 */
export function healthRollScore(actor: any): number {
  return attributeOf(actor, "HT") + healthRollBonus(actor);
}
