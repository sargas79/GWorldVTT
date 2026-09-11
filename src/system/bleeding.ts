/**
 * Bleeding out, a minute at a time (GURPS Basic Set: Campaigns p. 420).
 *
 * The rule is a HT roll every minute until the wound closes or somebody binds
 * it, at -1 for every 5 HP already lost -- so it gets harder exactly as the
 * character can least afford it.
 *
 * The book marks it optional for the bookkeeping it costs. The bookkeeping is
 * two numbers and a roll, which is what a computer is for, so what is optional
 * here is the rule rather than the effort.
 */

import { SYSTEM_ID } from "./constants.js";
import { setCondition, syncHealthConditions } from "./conditions.js";
import { bleedingMinute, bleedingModifier } from "../rules/bleeding.js";
import { resolveSuccess } from "../rules/success.js";

const BLEEDING_TEMPLATE = `systems/${SYSTEM_ID}/templates/chat/bleeding.hbs`;

/** Where the count of quiet minutes is kept between rolls. */
export const BLEEDING_FLAG = "bleeding";

/** The individual d6 faces from an evaluated Roll. */
function dieResults(roll: any): number[] {
  return (roll.dice?.[0]?.results ?? []).map((r: { result: number }) => r.result);
}

/**
 * Rolls one minute of bleeding and writes what it cost.
 *
 * Three minutes without bleeding ends it, so the count of quiet minutes lives
 * on the actor between rolls -- a minute that bleeds sets it back to nothing,
 * because "three consecutive minutes" means three in a row.
 */
export async function rollBleeding(options: { actor: any }): Promise<number> {
  const { actor } = options;
  if (!actor?.isOwner) {
    ui.notifications?.warn(
      game.i18n.format("GWORLD.Chat.CannotApply", { names: String(actor?.name ?? "") }),
    );
    return 0;
  }

  const hp = actor.system?.hp ?? { value: 0, max: 0 };
  const current = Number(hp.value) || 0;
  const max = Number(hp.max) || 0;
  const ht = Number(actor.system?.attributes?.HT) || 10;

  // "-1 per 5 HP lost", which is what is missing from the pool rather than what
  // is left in it.
  const modifier = bleedingModifier(Math.max(0, max - current));

  const roll = new Roll("3d6");
  await roll.evaluate();
  const outcome = resolveSuccess(roll.total, ht + modifier, dieResults(roll));

  const quiet = Number(actor.getFlag?.(SYSTEM_ID, BLEEDING_FLAG)) || 0;
  const result = bleedingMinute({
    roll: {
      success: outcome.success,
      criticalSuccess: outcome.criticalSuccess,
      criticalFailure: outcome.criticalFailure,
    },
    quietMinutes: quiet,
  });

  if (result.lost > 0) {
    await actor.update({ "system.hp.value": current - result.lost });
    await syncHealthConditions(actor);
  }

  if (result.stopped) {
    await actor.unsetFlag(SYSTEM_ID, BLEEDING_FLAG);
    await setCondition(actor, "bleeding", false);
  } else {
    await actor.setFlag(SYSTEM_ID, BLEEDING_FLAG, result.quietMinutes);
    await setCondition(actor, "bleeding", true);
  }

  const content = await foundry.applications.handlebars.renderTemplate(BLEEDING_TEMPLATE, {
    name: String(actor.name ?? ""),
    ht,
    modifier,
    target: ht + modifier,
    dice: dieResults(roll),
    roll: roll.total,
    lost: result.lost,
    stopped: result.stopped,
    // Only worth saying while it is counting towards something.
    quietMinutes: result.stopped ? 0 : result.quietMinutes,
    criticalSuccess: outcome.criticalSuccess,
    criticalFailure: outcome.criticalFailure,
    previous: current,
    now: current - result.lost,
    max,
  });

  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    content,
    rolls: [roll],
  });

  return result.lost;
}

/**
 * Binds a wound, which stops the bleeding (p. 424).
 *
 * "someone who is wounded but receives a successful First Aid roll within one
 * minute of his injury loses no HP to bleeding. A later roll will prevent
 * further HP loss." So a successful First Aid ends it, whenever it comes.
 */
export async function stopBleeding(actor: any): Promise<void> {
  if (!actor?.isOwner) return;
  if (actor.getFlag?.(SYSTEM_ID, BLEEDING_FLAG) !== undefined) {
    await actor.unsetFlag(SYSTEM_ID, BLEEDING_FLAG);
  }
  await setCondition(actor, "bleeding", false);
}
