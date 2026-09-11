/**
 * The saddle and the sprint (GURPS Basic Set: Campaigns pp. 394-397).
 *
 * Two rolls that only come up once somebody is moving faster than they can
 * comfortably stop: staying on a horse when something goes wrong, and getting
 * away with a turn or a stop that the rules say is too sharp.
 *
 * Being mounted itself is a state on the sheet rather than anything here: it
 * changes every active defense, so it belongs where the defenses are worked
 * out.
 */

import { SYSTEM_ID } from "./constants.js";
import {
  PUSHING_THE_ENVELOPE,
  hastyDecelerationModifier,
  maximumDeceleration,
  safeDeceleration,
  stayingOn,
  tightTurnModifier,
  turningRadius,
} from "../rules/mounted.js";
import { resolveSuccess } from "../rules/success.js";

const MOUNTED_TEMPLATE = `systems/${SYSTEM_ID}/templates/chat/mounted.hbs`;

/** The individual d6 faces from an evaluated Roll. */
function dieResults(roll: any): number[] {
  return (roll.dice?.[0]?.results ?? []).map((r: { result: number }) => r.result);
}

async function post(actor: any, context: Record<string, unknown>): Promise<void> {
  const content = await foundry.applications.handlebars.renderTemplate(MOUNTED_TEMPLATE, {
    name: String(actor?.name ?? ""),
    ...context,
  });

  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    content,
    rolls: (context.rolls as any[]) ?? [],
  });
}

/**
 * Whether a rider stays on (p. 397).
 *
 * Knockback throws a bareback rider off with no roll at all, which is worth a
 * card of its own rather than a roll nobody was allowed to make.
 */
export async function rollStayOn(options: {
  actor: any;
  stunned: boolean;
  knockbackYards: number;
  saddleAndStirrups: boolean;
}): Promise<boolean> {
  const { actor } = options;

  const check = stayingOn({
    stunned: options.stunned,
    knockbackYards: options.knockbackYards,
    saddleAndStirrups: options.saddleAndStirrups,
  });

  if (check.automaticFall) {
    await post(actor, { stayOn: true, thrown: true, knockback: options.knockbackYards });
    await actor.update({ "system.mounted": false });
    return false;
  }

  const riding = Number(actor?.system?.derived?.ridingSkill) || 6;
  const target = riding + (check.modifier ?? 0);

  const roll = new Roll("3d6");
  await roll.evaluate();
  const outcome = resolveSuccess(roll.total, target, dieResults(roll));

  if (!outcome.success) await actor.update({ "system.mounted": false });

  await post(actor, {
    stayOn: true,
    target,
    dice: dieResults(roll),
    roll: roll.total,
    success: outcome.success,
    stunned: options.stunned,
    knockback: options.knockbackYards,
    rolls: [roll],
  });

  return outcome.success;
}

/**
 * A stop or a turn sharper than the rules allow (p. 395).
 *
 * "Either requires a DX+3 roll", and the penalty depends on which of the two
 * is being attempted -- so both are worked out here and the card says which
 * one was rolled.
 */
export async function rollPushingTheEnvelope(options: {
  actor: any;
  velocity: number;
  /** Yards per second being shed, for a hasty stop. */
  deceleration: number;
  /** True for turning early or turning tighter than 60 degrees. */
  turning: boolean;
}): Promise<boolean> {
  const { actor } = options;

  const dexterity = Number(actor?.system?.attributes?.DX) || 10;
  const basicMove = Number(actor?.system?.derived?.basicMove) || 5;

  const modifier = options.turning
    ? tightTurnModifier({ velocity: options.velocity, basicMove })
    : hastyDecelerationModifier({ basicMove, deceleration: options.deceleration });

  const target = dexterity + PUSHING_THE_ENVELOPE + modifier;

  const roll = new Roll("3d6");
  await roll.evaluate();
  const outcome = resolveSuccess(roll.total, target, dieResults(roll));

  await post(actor, {
    envelope: true,
    turning: options.turning,
    velocity: options.velocity,
    basicMove,
    deceleration: options.deceleration,
    // What the rules would have allowed without a roll, which is the number
    // that says how far past it this attempt went.
    safe: safeDeceleration(basicMove),
    most: maximumDeceleration(basicMove),
    radius: turningRadius({ velocity: options.velocity, basicMove }),
    modifier,
    target,
    dice: dieResults(roll),
    roll: roll.total,
    success: outcome.success,
    rolls: [roll],
  });

  return outcome.success;
}

/** Where a charge bought at the attack roll waits for the damage roll. */
export const CHARGE_FLAG = "mountedCharge";

/**
 * Remembers that this blow was struck from a mount at speed (p. 396).
 *
 * The to-hit penalty lands on the attack roll and the damage bonus on the
 * damage roll, which is a separate click -- the same split Mighty Blows has,
 * and the same solution.
 */
export async function recordCharge(actor: any): Promise<void> {
  if (!actor?.isOwner) return;
  await actor.setFlag(SYSTEM_ID, CHARGE_FLAG, true);
}

/** Collects a charge bought before the attack roll, and clears it. */
export async function consumeCharge(actor: any): Promise<boolean> {
  const charging = actor?.getFlag?.(SYSTEM_ID, CHARGE_FLAG) === true;
  if (charging) await actor.unsetFlag(SYSTEM_ID, CHARGE_FLAG);
  return charging;
}

