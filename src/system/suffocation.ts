/**
 * Time without air (GURPS Basic Set: Campaigns p. 436).
 *
 * Advanced a span at a time rather than run on a clock: how many seconds passed
 * between one thing and the next is the GM's to say, the same way a minute of
 * bleeding is. What this does is work out what that span cost.
 *
 * The total is kept on the actor, because the two dangerous thresholds are
 * about elapsed time rather than about hit points -- four minutes kills you
 * whatever your FP, and two minutes risks a point of IQ even if somebody pulls
 * you out.
 */

import { SYSTEM_ID } from "./constants.js";
import { setCondition } from "./conditions.js";
import {
  DROWNING_ROLL_SECONDS,
  SECONDS_TO_DEATH,
  brainDamageRoll,
  suffocationSecond,
  type AirSupply,
} from "../rules/suffocation.js";
import { resolveSuccess } from "../rules/success.js";

const SUFFOCATION_TEMPLATE = `systems/${SYSTEM_ID}/templates/chat/suffocation.hbs`;

/** Where the seconds without air are counted. */
export const SUFFOCATION_FLAG = "airless";

/** The individual d6 faces from an evaluated Roll. */
function dieResults(roll: any): number[] {
  return (roll.dice?.[0]?.results ?? []).map((r: { result: number }) => r.result);
}

/**
 * Advances the clock on somebody who cannot breathe.
 *
 * With no air at all it is a point of fatigue a second. Drowning is slower --
 * "you can get some air, but you also inhale water" -- and costs a point only
 * on the five-second Swimming rolls that are missed, so those are rolled here.
 */
export async function rollSuffocation(options: {
  actor: any;
  seconds: number;
  air: AirSupply;
}): Promise<number> {
  const { actor, air } = options;
  if (!actor?.isOwner) {
    ui.notifications?.warn(
      game.i18n.format("GWORLD.Chat.CannotApply", { names: String(actor?.name ?? "") }),
    );
    return 0;
  }

  const seconds = Math.max(1, Math.floor(options.seconds));
  const before = Number(actor.getFlag?.(SYSTEM_ID, SUFFOCATION_FLAG)) || 0;
  const after = before + seconds;

  const fp = actor.system?.fp ?? { value: 0, max: 0 };
  const current = Number(fp.value) || 0;

  const rolls: any[] = [];
  let lost = 0;

  if (air === "none") {
    lost = seconds;
  } else {
    // One Swimming roll per five seconds of the span, each failure a point.
    const swimming = Number(actor.system?.derived?.feats?.swimming?.skill) || 6;
    const attempts = Math.floor(after / DROWNING_ROLL_SECONDS) - Math.floor(before / DROWNING_ROLL_SECONDS);

    for (let i = 0; i < attempts; i += 1) {
      const roll = new Roll("3d6");
      await roll.evaluate();
      rolls.push(roll);
      if (!resolveSuccess(roll.total, swimming, dieResults(roll)).success) lost += 1;
    }
  }

  const now = current - lost;
  const state = suffocationSecond({ air, seconds: after, currentFp: now + lost });

  if (lost > 0) await actor.update({ "system.fp.value": now });
  await actor.setFlag(SYSTEM_ID, SUFFOCATION_FLAG, after);
  await setCondition(actor, "suffocating", true);

  // "Regardless of FP or HP, you die after four minutes without air."
  const dead = air === "none" && after >= SECONDS_TO_DEATH;
  if (dead) await setCondition(actor, "dead", true);

  const content = await foundry.applications.handlebars.renderTemplate(SUFFOCATION_TEMPLATE, {
    name: String(actor.name ?? ""),
    seconds,
    total: after,
    drowning: air === "drowning",
    lost,
    previous: current,
    now,
    max: Number(fp.max) || 0,
    // At nothing left it is a Will roll every second to stay awake, which is
    // the GM's to run second by second.
    willRolls: now <= 0,
    dead,
    brainDamage: !dead && brainDamageRoll(after),
    secondsToDeath: Math.max(0, SECONDS_TO_DEATH - after),
    airless: air === "none",
    // Only reported where it means something: the four-minute clock does not
    // run for somebody who is getting a little air.
    state,
  });

  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    content,
    rolls,
  });

  return lost;
}

/**
 * Gets air again (p. 436).
 *
 * "If you get clean air before you die, you stop losing FP and start to recover
 * FP at the usual rate." The clock is cleared, and whether the time already
 * spent cost anything permanent is the HT roll the card asked for.
 */
export async function catchBreath(actor: any): Promise<void> {
  if (!actor?.isOwner) return;
  if (actor.getFlag?.(SYSTEM_ID, SUFFOCATION_FLAG) !== undefined) {
    await actor.unsetFlag(SYSTEM_ID, SUFFOCATION_FLAG);
  }
  await setCondition(actor, "suffocating", false);
}
