/**
 * Linked effects with an area of their own (GURPS Basic Set: Campaigns
 * p. 381; since API 1.155.0).
 *
 * A linked effect happens with the primary one on the same roll to hit, and
 * each is resisted on its own -- the book's example is a grenade whose blast
 * and blinding flash reach different people. So a linked line may reach
 * further or less far than the attack it rides on: its `radius` is its own,
 * measured from where the attack landed.
 */

/**
 * Whether somebody this far from where the attack landed is within a linked
 * line's area. A line with no radius of its own (0 or less) reaches whoever
 * the attack reached, and a distance nobody measured counts as inside.
 */
export function withinLinkedArea(distanceYards: number | null, radiusYards: number): boolean {
  if (!(radiusYards > 0)) return true;
  if (distanceYards === null || !Number.isFinite(distanceYards)) return true;
  return distanceYards <= radiusYards;
}
