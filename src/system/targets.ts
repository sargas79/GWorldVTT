/**
 * Who an action is aimed at.
 *
 * Its own module so that both halves of a fight can ask -- an attack recording
 * who it was aimed at, and a damage card deciding who to apply to -- without
 * the chat code and the roll code having to import each other.
 */

/** The tokens this user has targeted, which is how you say who you are attacking. */
export function targetedTokens(): any[] {
  return [...(game.user?.targets ?? [])];
}

/**
 * The tokens an action should act on: whatever the user has targeted, falling
 * back to what they have selected.
 *
 * The fallback is for acting on a token rather than at one -- a GM applying
 * damage usually just has the victim selected, and refusing to act on that
 * would make the button useless exactly when it is most wanted.
 *
 * It is deliberately not used for an attack. An attacker has their own token
 * selected far more often than not, so falling back there would record the
 * attacker as the person defending against themselves.
 */
export function currentTargets(): any[] {
  const targeted = targetedTokens();
  if (targeted.length > 0) return targeted;
  return [...(canvas?.tokens?.controlled ?? [])];
}
