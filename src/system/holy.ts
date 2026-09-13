/**
 * Applying a holy attack (GURPS Monster Hunters 1: Champions p. 51).
 *
 * Two ways in. A holy weapon's blow, applied from its damage card, touches
 * everyone it was applied to; and holy gear with no damage of its own -- a
 * splash of holy water, a brandished symbol -- touches whoever is targeted from
 * its row on the gear tab. Either way each creature is checked on its own:
 * burned for 1d ignoring DR if a Weakness makes it vulnerable, not if its last
 * burn is still fizzing, and not at all otherwise.
 */

import { SYSTEM_ID } from "./constants.js";
import { syncHealthConditions } from "./conditions.js";
import { isRuleOn } from "./optional-rules.js";
import { holyContact, vulnerableToHoly } from "../rules/holy.js";
import { weaknessOf, type Weakness } from "../rules/weakness.js";

const HOLY_FLAG = "holyFizzUntil";

const L = (key: string, data: Record<string, unknown> = {}) => game.i18n.format(`GWORLD.Holy.${key}`, data);

/** A character's Weaknesses, as the rules read them. */
function weaknessesOf(actor: any): Weakness[] {
  return [...(actor?.items ?? [])]
    .filter((item: any) => item.type === "trait")
    .map((item: any) => weaknessOf({ name: String(item.name ?? ""), levels: Number(item.system?.levels ?? 1) }))
    .filter((w): w is Weakness => w !== null);
}

/**
 * One holy contact with one creature. Returns whether it did anything worth a
 * card: nothing is said about a creature holy things do not touch, since that
 * is almost everyone a holy weapon hits.
 */
export async function applyHolyContact(actor: any, source: string): Promise<boolean> {
  if (!isRuleOn("holyAttacks") || !actor) return false;
  const now = Number((game as any).time?.worldTime ?? 0) || 0;
  const outcome = holyContact({
    vulnerable: vulnerableToHoly(weaknessesOf(actor)),
    fizzingUntil: Number(actor.getFlag?.(SYSTEM_ID, HOLY_FLAG)) || 0,
    now,
  });
  if (!outcome.burns && !outcome.fizzing) return false;
  if (!actor.isOwner) {
    ui.notifications?.warn(game.i18n.format("GWORLD.Chat.CannotApply", { names: String(actor.name ?? "") }));
    return false;
  }

  let text: string;
  let roll: any = null;
  if (outcome.burns) {
    roll = new Roll("1d6");
    await roll.evaluate();
    const previous = Number(actor.system?.hp?.value) || 0;
    await actor.update({ "system.hp.value": previous - roll.total });
    await actor.setFlag(SYSTEM_ID, HOLY_FLAG, outcome.fizzingUntil);
    await syncHealthConditions(actor);
    text = L("Burns", { name: String(actor.name ?? ""), source, injury: roll.total, from: previous, to: previous - roll.total });
  } else {
    const seconds = Math.max(0, Math.ceil(outcome.fizzingUntil - now));
    text = L("Fizzing", { name: String(actor.name ?? ""), source, seconds });
  }

  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    content: `<div class="gworld gworld-chat"><div class="gc-head"><span class="gc-label">${L("Title")}</span></div><div class="gc-result${outcome.burns ? " failure" : ""}">${text}</div><div class="gc-note">${L("Rule")}</div></div>`,
    ...(roll ? { rolls: [roll] } : {}),
  });
  return true;
}
