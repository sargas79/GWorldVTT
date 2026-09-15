/**
 * Keeping an Evaluate, and spending it (GURPS Basic Set: Campaigns p. 364).
 *
 * "An Evaluate maneuver gives you +1 to skill for the purpose of an Attack,
 * Feint, All-Out Attack, or Move and Attack made against that opponent, on
 * your next turn only", cumulative to +3 over consecutive turns. The count
 * lives on the actor as `system.evaluateTurns`, which the Combat tab shows and
 * the table may correct: the end of each turn in combat moves it on, and the
 * attack or feint on a maneuver that takes the bonus reads it.
 *
 * Which foe was studied is the table's to hold to; the card names the bonus.
 */

import { evaluateBonus, evaluateTurnsAfterTurn, takesEvaluateBonus } from "../rules/maneuvers.js";
import { maneuverInfo } from "./combat-extensions.js";
import { PROCEDURE_HOOKS } from "./procedure-extensions.js";

/** The bonus an actor's attack or feint takes from Evaluate maneuvers before it, or 0. */
export function evaluateBonusFor(actor: any): number {
  const maneuver = String(actor?.system?.maneuver ?? "");
  if (!takesEvaluateBonus(maneuver, maneuverInfo(maneuver).attacks)) return 0;
  return evaluateBonus(Number(actor?.system?.evaluateTurns ?? 0));
}

/**
 * Moves the count on at the end of each combatant's turn: one more after a
 * turn spent evaluating, and none after any other. The GM's client writes it.
 */
export function registerEvaluateTracking(): void {
  Hooks.on(PROCEDURE_HOOKS.turnEnd, (_combat: unknown, combatant: any) => {
    if (!game.user?.isGM) return;
    const actor = combatant?.actor;
    const system = actor?.system;
    if (!system || typeof system.evaluateTurns !== "number") return;
    const next = evaluateTurnsAfterTurn(system.evaluateTurns, String(system.maneuver ?? ""));
    if (next !== system.evaluateTurns) void actor.update({ "system.evaluateTurns": next });
  });
}
