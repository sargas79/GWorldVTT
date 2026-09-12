/**
 * Weapons that need readying again (GURPS Basic Set: Characters p. 270;
 * Campaigns p. 366).
 *
 * The weapon tables mark some weapons "‡": they "require two hands and become
 * unready after you attack with them, unless you have at least 1.5 times the
 * listed ST (round up)". A great axe swung by an ordinary fighter is not
 * ready to swing again next turn, and cannot parry until a Ready maneuver
 * brings it back up.
 */

/** How much ST it takes to keep such a weapon ready after a swing. */
export const READY_ST_MULTIPLE = 1.5;

/** The ST at or above which a weapon marked ‡ stays ready (round up). */
export function strengthToStayReady(minSt: number): number {
  return Math.ceil(Math.max(0, minSt) * READY_ST_MULTIPLE);
}

/**
 * Whether swinging this weapon leaves it unready.
 *
 * Only a weapon marked for it, and only in hands without the strength to hold
 * it steady. A weapon with no minimum ST listed cannot be measured against
 * one, and is taken to stay ready.
 */
export function becomesUnreadyAfterAttack(options: {
  unreadyAfterAttack: boolean;
  st: number;
  minSt: number | null;
}): boolean {
  if (!options.unreadyAfterAttack) return false;
  if (options.minSt === null || options.minSt <= 0) return false;
  return options.st < strengthToStayReady(options.minSt);
}
