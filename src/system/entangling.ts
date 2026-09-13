/**
 * Getting out of a net, a bolas or a lariat (GURPS Basic Set: Campaigns
 * pp. 410-411).
 *
 * All three end the same way: the victim is tied up and spends their turns
 * trying to get loose. The book counts three successes, and for a net it also
 * counts three failures in a row -- past which "he becomes so entangled that
 * he must be cut free", which is a different and much worse state than merely
 * being stuck.
 *
 * So this keeps a tally on the sheet rather than asking the table to remember
 * one per entangled combatant.
 */

import { SYSTEM_ID } from "./constants.js";
import { setCondition } from "./conditions.js";
import { resolveSuccess } from "../rules/success.js";
import { attributeOf } from "./attributes.js";
import {
  BOLAS_ESCAPE_ROLLS,
  NET_ESCAPE_ROLLS,
  bolasEscapeModifier,
  mustBeCutFree,
  netEscapeTarget,
  type Limbs,
} from "../rules/entangling.js";

const CARD_TEMPLATE = `systems/${SYSTEM_ID}/templates/chat/entangled.hbs`;

const L = (key: string, data?: Record<string, unknown>) =>
  data
    ? game.i18n.format(`GWORLD.Entangled.${key}`, data)
    : game.i18n.localize(`GWORLD.Entangled.${key}`);

/** What is holding them. */
export type Entanglement = "net" | "smallNet" | "bolas" | "lariat";

/** The d6 faces of an evaluated roll, for the card. */
function faces(roll: any): number[] {
  return (roll?.dice?.[0]?.results ?? []).map((r: { result: number }) => r.result);
}

/**
 * What the victim rolls against, and how many times (pp. 410-411).
 *
 * A net is DX-4 and counts failures as well as successes; a bolas is a plain
 * DX and counts only successes. A lariat is not escaped by rolling at all
 * while it stays taut -- "to escape from a taut lariat, cut the rope" -- so a
 * limp one is handled "as per Bolas", which is what this is.
 */
export function escapeTarget(options: {
  actor: any;
  entanglement: Entanglement;
  limbs: Limbs;
  oneHanded: boolean;
}): { target: number; needed: number; countsFailures: boolean } {
  const dexterity = attributeOf(options.actor, "DX");

  if (options.entanglement === "net" || options.entanglement === "smallNet") {
    return {
      target: netEscapeTarget({
        dexterity,
        small: options.entanglement === "smallNet",
        oneHanded: options.oneHanded,
      }),
      needed: NET_ESCAPE_ROLLS,
      countsFailures: true,
    };
  }

  return {
    target: dexterity + bolasEscapeModifier(options.limbs),
    needed: BOLAS_ESCAPE_ROLLS,
    countsFailures: false,
  };
}

/**
 * One attempt to get loose (pp. 410-411).
 *
 * "Each attempt counts as a Ready maneuver, during which time the victim may
 * take no other actions." That is the table's to honour; what this does is
 * roll it, keep the count, and say when they are out.
 */
export async function tryToEscape(options: {
  actor: any;
  entanglement: Entanglement;
  limbs: Limbs;
  oneHanded: boolean;
}): Promise<void> {
  const { actor } = options;
  if (!actor?.isOwner) return;

  const { target, needed, countsFailures } = escapeTarget(options);
  const roll = new Roll("3d6");
  await roll.evaluate();
  const outcome = resolveSuccess(roll.total, target, faces(roll));

  const held = actor.system?.entangled ?? { successes: 0, failures: 0 };
  const successes = outcome.success ? (Number(held.successes) || 0) + 1 : Number(held.successes) || 0;
  // "If the victim fails three consecutive rolls" -- consecutive, so a success
  // in between wipes the slate.
  const failures = outcome.success ? 0 : (Number(held.failures) || 0) + 1;

  const free = successes >= needed;
  const stuck = countsFailures && !free && mustBeCutFree(failures);

  await actor.update({
    "system.entangled.successes": free ? 0 : successes,
    "system.entangled.failures": free ? 0 : failures,
    "system.entangled.mustBeCut": stuck,
  });
  if (free) await setCondition(actor, "entangled", false);

  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    content: await foundry.applications.handlebars.renderTemplate(CARD_TEMPLATE, {
      name: String(actor.name ?? ""),
      what: L(`What.${options.entanglement}`),
      target,
      dice: faces(roll),
      roll: roll.total,
      outcome,
      successes,
      needed,
      free,
      stuck,
    }),
    rolls: [roll],
  });
}

/** Puts somebody in a net, and starts the tally from nothing. */
export async function entangle(actor: any, entanglement: Entanglement): Promise<void> {
  if (!actor?.isOwner) return;
  await actor.update({
    "system.entangled.kind": entanglement,
    "system.entangled.successes": 0,
    "system.entangled.failures": 0,
    "system.entangled.mustBeCut": false,
  });
  await setCondition(actor, "entangled", true);
}

/** Cuts somebody out of it, which is the only way past three failures. */
export async function cutFree(actor: any): Promise<void> {
  if (!actor?.isOwner) return;
  await actor.update({
    "system.entangled.successes": 0,
    "system.entangled.failures": 0,
    "system.entangled.mustBeCut": false,
  });
  await setCondition(actor, "entangled", false);
}
