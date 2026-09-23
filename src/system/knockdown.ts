/**
 * Rolling to stay on your feet (GURPS Basic Set: Campaigns pp. 419-420).
 *
 * The applied-damage card has been saying "major wound -- HT roll" and leaving
 * the roll, and everything that follows from it, to be remembered. This rolls
 * it and writes down what happened: stunned, on the ground, or out cold.
 *
 * It is a separate module from `damage.ts` because it happens *after* the
 * damage is applied and may not happen at all -- and because failing it changes
 * the character's state rather than their hit points.
 */

import { SYSTEM_ID } from "./constants.js";
import { setCondition } from "./conditions.js";
import {
  knockdownResult,
  recoversFromStun,
  type KnockdownResult,
} from "../rules/knockdown.js";
import { resolveSuccess } from "../rules/success.js";
import { attributeOf, healthRollScore } from "./attributes.js";
import { PROCEDURE_HOOKS, recoveryHold, successRollModifiers, type KnockdownBlow } from "./procedure-extensions.js";
import { callCombatHook } from "./combat-extensions.js";

const KNOCKDOWN_TEMPLATE = `systems/${SYSTEM_ID}/templates/chat/knockdown.hbs`;

/** The individual d6 faces from an evaluated Roll. */
function dieResults(roll: any): number[] {
  return (roll.dice?.[0]?.results ?? []).map((r: { result: number }) => r.result);
}

/**
 * Rolls to avoid knockdown and stunning, and applies what it did.
 *
 * A failure stuns and floors them; a failure by five or more, or any critical
 * failure, puts them out. Knockdown is not knockback: this one is about
 * staying upright, not about being shoved.
 */
export async function rollKnockdown(options: {
  actor: any;
  modifier: number;
  /** The blow that called for the roll, where one did (since API 1.73.0). */
  blow?: KnockdownBlow | null;
}): Promise<KnockdownResult | null> {
  const { actor, modifier } = options;
  const blow = options.blow ?? null;
  if (!actor?.isOwner) {
    ui.notifications?.warn(
      game.i18n.format("GWORLD.Chat.CannotApply", { names: String(actor?.name ?? "") }),
    );
    return null;
  }

  // Fit's bonus is in the modifier the damage card worked out; a knockdown
  // rolled from elsewhere reads it here so it is never left out.
  const ht = attributeOf(actor, "HT");
  // What the actor's conditions and the modules add to the roll.
  // Where the blow landed goes with it, since a listener's modifier may turn
  // on it as the Basic Set's own do (since 1.73.0).
  const added = successRollModifiers({ actor, label: "Knockdown", kind: "attribute", skill: "", base: ht, tags: ["knockdown", "HT"], modifiers: [], blow })
    .reduce((total, line) => total + line.value, 0);
  const roll = new Roll("3d6");
  await roll.evaluate();
  const outcome = resolveSuccess(roll.total, ht + modifier + added, dieResults(roll));

  const result = knockdownResult({
    success: outcome.success,
    margin: outcome.margin,
    criticalFailure: outcome.criticalFailure,
  });

  const previousPosture = String(actor.system?.posture ?? "standing");
  await applyKnockdown(actor, result);
  // The modules hear what it did, and may take it back (since 1.39.0).
  callCombatHook(PROCEDURE_HOOKS.afterKnockdown, {
    actor,
    outcome,
    result: { outcome: result.outcome, stunned: result.stunned, prone: result.prone, unconscious: result.unconscious },
    previousPosture,
    blow,
  });

  const content = await foundry.applications.handlebars.renderTemplate(KNOCKDOWN_TEMPLATE, {
    name: String(actor.name ?? ""),
    ht,
    modifier: modifier + added,
    target: ht + modifier + added,
    dice: dieResults(roll),
    roll: roll.total,
    margin: outcome.margin,
    outcome: game.i18n.localize(`GWORLD.Knockdown.${result.outcome}`),
    failed: !outcome.success,
    unconscious: result.unconscious,
  });

  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    content,
    rolls: [roll],
  });

  return result;
}

/**
 * Writes a knockdown onto the character.
 *
 * Posture as well as the token's conditions: a fighter on the ground defends
 * and attacks at a penalty, and that comes from the posture field rather than
 * from an icon. The icon is so everyone can see it.
 */
const POSTURES = ["standing", "crouching", "kneeling", "crawling", "sitting", "lying"];

/**
 * Takes a knockdown back (since 1.39.0), for a module's rule that lets a
 * character shrug one off: no stun, not prone, not out, and back in the
 * posture given. Returns whether it did.
 */
export async function undoKnockdown(actor: any, options: { posture?: string } = {}): Promise<boolean> {
  if (!actor?.isOwner) return false;
  const posture = POSTURES.includes(String(options.posture)) ? String(options.posture) : "standing";
  await actor.update({ "system.posture": posture, "system.conditions.stunned": false });
  await setCondition(actor, "stunned", false);
  await setCondition(actor, "prone", false);
  await setCondition(actor, "unconscious", false);
  return true;
}

export async function applyKnockdown(actor: any, result: KnockdownResult): Promise<void> {
  if (!actor?.isOwner || result.outcome === "unaffected") return;

  await actor.update({
    "system.posture": "lying",
    "system.conditions.stunned": result.stunned,
  });

  await setCondition(actor, "stunned", result.stunned);
  await setCondition(actor, "prone", result.prone);
  await setCondition(actor, "unconscious", result.unconscious);
}

/**
 * Rolls to shake off stun at the end of a turn (p. 420).
 *
 * "At the end of your turn, you may roll against HT. On a success, you recover
 * from stun and can act normally on subsequent turns." Mental stun asks IQ
 * instead, which is why the attribute is a parameter rather than a constant.
 */
export async function rollStunRecovery(options: {
  actor: any;
  mental?: boolean;
}): Promise<boolean> {
  const { actor, mental = false } = options;
  if (!actor?.isOwner) return false;
  // A stun that is held -- a current still flowing, and the seconds after it
  // (p. 432) -- gives no roll until the hold ends (since API 1.89.0).
  if (!refuseWhileHeld(actor, "stunned")) return false;

  const attribute = mental ? "IQ" : "HT";
  // A HT roll reads Fit; the IQ roll for mental stun does not.
  const score = mental ? attributeOf(actor, attribute) : healthRollScore(actor);
  // Conditions and modules may make recovery harder or easier (since API 1.63.0, tagged "stunRecovery").
  const modifier = successRollModifiers({
    actor, label: game.i18n.localize("GWORLD.Knockdown.recovered"), kind: "attribute", skill: attribute,
    base: score, tags: ["stunRecovery", attribute, ...(mental ? ["mental"] : [])], modifiers: [],
  }).reduce((sum, line) => sum + line.value, 0);
  const target = score + modifier;

  const roll = new Roll("3d6");
  await roll.evaluate();
  const outcome = resolveSuccess(roll.total, target, dieResults(roll));
  const recovered = recoversFromStun(outcome);

  if (recovered) {
    await actor.update({ "system.conditions.stunned": false });
    await setCondition(actor, "stunned", false);
  }

  const content = await foundry.applications.handlebars.renderTemplate(KNOCKDOWN_TEMPLATE, {
    name: String(actor.name ?? ""),
    ht: score,
    modifier,
    target,
    dice: dieResults(roll),
    roll: roll.total,
    margin: outcome.margin,
    outcome: game.i18n.localize(
      recovered ? "GWORLD.Knockdown.recovered" : "GWORLD.Knockdown.stillStunned",
    ),
    failed: !recovered,
    unconscious: false,
    recovery: true,
    attribute,
  });

  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    content,
    rolls: [roll],
  });

  return recovered;
}

/**
 * Whether a recovery roll may be made from a condition now; says why not
 * where its recovery is held (since API 1.89.0).
 */
export function refuseWhileHeld(actor: any, id: string): boolean {
  const held = recoveryHold(actor, id);
  if (!held) return true;
  const now = Number(game.time?.worldTime) || 0;
  ui.notifications?.warn(held.until === null
    ? game.i18n.format("GWORLD.Knockdown.HeldUntilRemoved", { name: String(actor?.name ?? "") })
    : game.i18n.format("GWORLD.Knockdown.HeldFor", { name: String(actor?.name ?? ""), seconds: Math.ceil(held.until - now) }));
  return false;
}
