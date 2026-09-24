/**
 * The arc an attack comes at its target from, worked out when it is made
 * (GURPS Basic Set: Campaigns pp. 384-391).
 *
 * The defense card reads the arc from the tokens once the blow has landed. A
 * called shot needs it earlier, since some locations can only be aimed at from
 * some sides, so this reads it from the attacker's token and the one token they
 * have targeted.
 */

import { attackArc, type Arc, type BodySide } from "../rules/tactical.js";
import { attackDirection, facingOf } from "./hex.js";
import { SYSTEM_ID } from "./constants.js";
import { targetedTokens } from "./targets.js";

/**
 * The arc an actor's attack comes at their one targeted token from, or null
 * outside tactical combat, with no token of their own, or with no single target.
 */
export function arcAgainstTarget(actor: any): Arc | null {
  return facingAgainstTarget(actor)?.arc ?? null;
}

/**
 * The arc and, for a side attack, which side (since API 1.137.0): the reading
 * a called shot is checked against, which the attack hooks hand on as well, so
 * a rule about a blow from behind need not work out facing from the tokens.
 */
export function facingAgainstTarget(actor: any): { arc: Arc; side: BodySide | null } | null {
  const targets = targetedTokens();
  if (targets.length !== 1) return null;
  const defender = targets[0]?.document ?? targets[0];
  const attacker = actor?.getActiveTokens?.()?.[0]?.document;
  if (!defender || !attacker) return null;
  const gridType = defender.parent?.grid?.type;
  // The tactical rules on a hex grid, as the settings module decides it; read
  // here rather than imported, since that module needs Foundry to load.
  const tactical = (() => {
    try {
      return game.settings.get(SYSTEM_ID, "combatStyle") === "tactical";
    } catch {
      return false;
    }
  })();
  if (!tactical || typeof gridType !== "number" || gridType < 2 || gridType > 5) return null;
  const from = attackDirection(attacker, defender, gridType);
  if (from === null) return null;
  return attackArc(facingOf(defender, gridType), from);
}
