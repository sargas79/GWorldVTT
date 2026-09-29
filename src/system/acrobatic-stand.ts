/**
 * Acrobatic Stand (Basic Set Revised p. 333): standing from lying, sitting or
 * crawling on a roll of the technique, less encumbrance.
 */

import { acrobaticStand, acrobaticStandModifier, type StandFrom, type StandOutcome } from "../rules/addendum-techniques.js";
import { techniqueLevelByPrefix } from "./technique-lookup.js";
import { rollSuccess } from "./roll.js";
import { SYSTEM_ID } from "./constants.js";
import { getCombatState, setCombatState } from "./combat-extensions.js";

/** The per-turn state key that says the fighter's step is spent (the turn ends it). */
export const STEP_TAKEN_KEY = "stepTaken";

/** Whether the fighter has spent their step this turn, on an Acrobatic Stand or any flow that records one. */
export function stepTakenThisTurn(actor: any): boolean {
  return getCombatState(actor, SYSTEM_ID, STEP_TAKEN_KEY) === true;
}

/** Spends the step for the rest of the fighter's turn; nothing outside a combat is tracked. */
export async function recordStepTaken(actor: any): Promise<void> {
  if (!game.combat?.started) return;
  await setCombatState(actor, SYSTEM_ID, STEP_TAKEN_KEY, true, "turn");
}

const STAND_FROM: readonly string[] = ["lying", "sitting", "crawling"];

/** True where changing to `to` from `from` is one the technique can do for this actor. */
export function canAcrobaticStand(actor: any, from: string, to: string): boolean {
  return to === "standing" && STAND_FROM.includes(from) && techniqueLevelByPrefix(actor, "Acrobatic Stand") !== null;
}

/**
 * Rolls the technique and returns the posture the fighter ends in, and
 * whether the rise was a step or a Change Posture maneuver (or wasted the turn).
 */
export async function rollAcrobaticStand(actor: any, from: StandFrom): Promise<{ posture: string; outcome: StandOutcome } | null> {
  const level = techniqueLevelByPrefix(actor, "Acrobatic Stand");
  if (level === null) return null;
  const encumbrance = Number(actor?.system?.derived?.encumbrance?.level) || 0;
  const result = await rollSuccess({
    actor,
    base: level,
    label: game.i18n.localize("GWORLD.AcrobaticStand.Label"),
    kind: "skill",
    skill: "Acrobatic Stand",
    tags: ["acrobaticStand"],
    modifiers: encumbrance > 0
      ? [{ label: game.i18n.localize("GWORLD.Field.Encumbrance"), value: acrobaticStandModifier(encumbrance), key: "encumbrance" }]
      : [],
  });
  if (!result) return null;
  let outcome = acrobaticStand({ from, success: result.success, critical: result.criticalSuccess || result.criticalFailure });
  // Rising as a step spends the turn's step: with it already spent, the rise
  // costs a Change Posture maneuver instead (p. 333).
  if (outcome === "standsAsStep") {
    if (stepTakenThisTurn(actor)) {
      outcome = "standsAsManeuver";
      ui.notifications?.warn(game.i18n.localize("GWORLD.AcrobaticStand.StepSpent"));
    } else {
      await recordStepTaken(actor);
    }
  }
  const posture =
    outcome === "standsAsStep" || outcome === "standsAsManeuver" ? "standing"
    : outcome === "sits" ? "sitting"
    : "lying";
  ui.notifications?.info(game.i18n.localize(`GWORLD.AcrobaticStand.${outcome}`));
  return { posture, outcome };
}
