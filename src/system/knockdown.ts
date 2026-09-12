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
import { attributeOf } from "./attributes.js";

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
}): Promise<KnockdownResult | null> {
  const { actor, modifier } = options;
  if (!actor?.isOwner) {
    ui.notifications?.warn(
      game.i18n.format("GWORLD.Chat.CannotApply", { names: String(actor?.name ?? "") }),
    );
    return null;
  }

  const ht = attributeOf(actor, "HT");
  const roll = new Roll("3d6");
  await roll.evaluate();
  const outcome = resolveSuccess(roll.total, ht + modifier, dieResults(roll));

  const result = knockdownResult({
    success: outcome.success,
    margin: outcome.margin,
    criticalFailure: outcome.criticalFailure,
  });

  await applyKnockdown(actor, result);

  const content = await foundry.applications.handlebars.renderTemplate(KNOCKDOWN_TEMPLATE, {
    name: String(actor.name ?? ""),
    ht,
    modifier,
    target: ht + modifier,
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

  const attribute = mental ? "IQ" : "HT";
  const score = attributeOf(actor, attribute);

  const roll = new Roll("3d6");
  await roll.evaluate();
  const outcome = resolveSuccess(roll.total, score, dieResults(roll));
  const recovered = recoversFromStun(outcome);

  if (recovered) {
    await actor.update({ "system.conditions.stunned": false });
    await setCondition(actor, "stunned", false);
  }

  const content = await foundry.applications.handlebars.renderTemplate(KNOCKDOWN_TEMPLATE, {
    name: String(actor.name ?? ""),
    ht: score,
    modifier: 0,
    target: score,
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
