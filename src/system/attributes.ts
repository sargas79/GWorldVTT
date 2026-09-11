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
