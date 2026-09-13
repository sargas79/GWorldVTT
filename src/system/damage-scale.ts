/**
 * Fighting a battle at a smaller scale (GURPS Basic Set: Campaigns p. 470).
 *
 * "To avoid excessive die rolling, it is best to adjust the damage scale." The
 * vehicle sheet already said what its own DR and HP come to at a tenth. What
 * nobody could do was carry a weapon's damage down to the same scale, with the
 * book's rule for the small guns that would otherwise round to nothing, or
 * carry what is left of the hit points back up when the fighting is over.
 */

import { formatDiceAdds, parseDiceAdds } from "../rules/dice.js";
import { scaleDamage, unscaleScore, type DamageScale } from "../rules/scale.js";

/** A weapon's damage at a scale, or null for something that is not dice. */
export function damageAtScale(options: {
  damage: string;
  scale: DamageScale;
}): string | null {
  const parsed = parseDiceAdds(options.damage);
  if (!parsed) return null;
  return formatDiceAdds(scaleDamage({ damage: parsed, multiplier: parsed.multiplier ?? 1, scale: options.scale }));
}

/** Hit points left at a scale, carried back to full size when the battle ends. */
export function hitPointsAfterBattle(options: { remaining: number; scale: DamageScale }): number {
  return unscaleScore(options.remaining, options.scale);
}
