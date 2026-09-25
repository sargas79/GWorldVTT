/**
 * Who fought in a battle (GURPS Basic Set: Campaigns p. 426).
 *
 * "Those who make no attack or defense rolls during the fight are exempt from
 * this fatigue." Every attack and defense roll the system makes -- the ones
 * its success roll's listeners hear as `attack` or `defense` -- marks the
 * roller as having fought in each started combat they are in, and battle
 * fatigue reads the mark when the combat ends. The mark is combat-long
 * state, cleared with the rest when the combat is deleted.
 */

import { SYSTEM_ID } from "./constants.js";
import { getCombatState, setCombatState } from "./combat-extensions.js";
import { isRuleOn } from "./optional-rules.js";

const FOUGHT_KEY = "foughtIn";

/** The ids of the combats an actor has made an attack or defense roll in. */
export function combatsFoughtIn(actor: any): string[] {
  const stored = getCombatState(actor, SYSTEM_ID, FOUGHT_KEY);
  return Array.isArray(stored) ? stored.filter((id): id is string => typeof id === "string") : [];
}

/** Whether a roll of this kind counts as fighting. */
export function isFightingRoll(kind: unknown): boolean {
  return kind === "attack" || kind === "defense";
}

/**
 * Marks an actor as having fought in every started combat they are a
 * combatant of. Only an owner can; the roller of an attack or a defense is.
 */
export async function noteFought(actor: any): Promise<void> {
  // Only battle fatigue reads the mark: with it off, nothing is written.
  if (!actor?.isOwner || !isRuleOn("battleFatigue")) return;
  const uuid = String(actor.uuid ?? "");
  if (!uuid) return;
  const ids = [...(game.combats ?? [])]
    .filter((combat: any) => combat?.started && [...(combat.combatants ?? [])].some((c: any) => c?.actor?.uuid === uuid))
    .map((combat: any) => String(combat.id));
  if (ids.length === 0) return;
  const known = combatsFoughtIn(actor);
  const merged = [...new Set([...known, ...ids])];
  if (merged.length === known.length) return;
  await setCombatState(actor, SYSTEM_ID, FOUGHT_KEY, merged, "combat");
}
