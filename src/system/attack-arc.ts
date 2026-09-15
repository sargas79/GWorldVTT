/**
 * The arc an attack comes at its target from, worked out when it is made
 * (GURPS Basic Set: Campaigns pp. 384-391).
 *
 * The defense card reads the arc from the tokens once the blow has landed. A
 * called shot needs it earlier, since some locations can only be aimed at from
 * some sides, so this reads it from the attacker's token and the one token they
 * have targeted.
 */

import { attackArc, type Arc } from "../rules/tactical.js";
import { attackDirection, facingOf } from "./hex.js";
import { tacticalOnScene } from "./settings.js";
import { targetedTokens } from "./targets.js";

/**
 * The arc an actor's attack comes at their one targeted token from, or null
 * outside tactical combat, with no token of their own, or with no single target.
 */
export function arcAgainstTarget(actor: any): Arc | null {
  const targets = targetedTokens();
  if (targets.length !== 1) return null;
  const defender = targets[0]?.document ?? targets[0];
  const attacker = actor?.getActiveTokens?.()?.[0]?.document;
  if (!defender || !attacker) return null;
  const gridType = defender.parent?.grid?.type;
  if (!tacticalOnScene(gridType)) return null;
  const from = attackDirection(attacker, defender, gridType);
  if (from === null) return null;
  return attackArc(facingOf(defender, gridType), from).arc;
}
