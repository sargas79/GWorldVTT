/**
 * Throwing something (GURPS Basic Set: Campaigns p. 355).
 *
 * The arithmetic is in `src/rules/physical.ts`; this is the part that reads the
 * thrower off a sheet and posts what happened.
 *
 * No roll: how far a thing goes and what it does when it lands are both worked
 * out from ST, Basic Lift and the weight. Hitting with it is an ordinary attack
 * roll afterwards, which is a different button.
 */

import { SYSTEM_ID } from "./constants.js";
import { formatDiceAdds, parseDiceAdds } from "../rules/dice.js";
import { throwingDistance, thrownDamage } from "../rules/physical.js";

const THROW_TEMPLATE = `systems/${SYSTEM_ID}/templates/chat/throw.hbs`;

/** What a throw came to. */
export interface Throw {
  /** Yards, or null when it is past a two-handed lift and cannot be thrown. */
  distance: number | null;
  /** The damage, formatted, or blank where the thrust could not be read. */
  damage: string;
}

/**
 * Works out a throw and posts it.
 *
 * The thrower's ST and Basic Lift come off the sheet rather than being asked
 * for: they are already there, and a throw whose numbers disagree with the
 * character's own would be worse than no button at all.
 */
export async function rollThrow(options: { actor: any; weight: number }): Promise<Throw> {
  const { actor, weight } = options;

  const feats = actor?.system?.derived?.feats;
  const strength = Number(feats?.throwing?.strength) || 10;
  const basicLift = Number(feats?.throwing?.basicLift) || 0;

  const distance = throwingDistance({ strength, basicLift, weight });

  // A weapon whose thrust cannot be parsed throws for no stated damage rather
  // than for a made-up figure: the distance is still worth knowing.
  const thrust = parseDiceAdds(String(actor?.system?.derived?.thrust ?? ""));
  const damage = thrust ? thrownDamage(thrust, weight, basicLift) : null;
  const formatted = damage ? formatDiceAdds(damage) : "";

  const content = await foundry.applications.handlebars.renderTemplate(THROW_TEMPLATE, {
    name: String(actor?.name ?? ""),
    weight,
    basicLift,
    // Null means it is past a two-handed lift, which is not a short throw but
    // no throw at all.
    tooHeavy: distance === null,
    distance: distance === null ? 0 : Math.round(distance * 10) / 10,
    damage: formatted,
  });

  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    content,
  });

  return { distance, damage: formatted };
}
