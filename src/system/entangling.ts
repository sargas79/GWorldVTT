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
import { formatDiceAdds } from "../rules/dice.js";
import { attributeOf } from "./attributes.js";
import {
  BOLAS_ESCAPE_ROLLS,
  BOLAS_FALL_DAMAGE,
  LARIAT_LENGTH_YARDS,
  MOLOTOV_BURNS_FOR,
  NET_ESCAPE_ROLLS,
  bolasDefense,
  bolasEscapeModifier,
  bolasHit,
  bolasTrips,
  bottleBreaks,
  lariatHold,
  lariatReadyTurns,
  molotovEffect,
  molotovLanding,
  mustBeCutFree,
  netEscapeTarget,
  type Limbs,
} from "../rules/entangling.js";

const CARD_TEMPLATE = `systems/${SYSTEM_ID}/templates/chat/entangled.hbs`;
const MOLOTOV_TEMPLATE = `systems/${SYSTEM_ID}/templates/chat/molotov.hbs`;
const BOTTLES_TEMPLATE = `systems/${SYSTEM_ID}/templates/chat/bottles.hbs`;

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
  /** Where it caught them, which is what it is doing to them. */
  where?: string;
  /** True where they were running when it caught them. */
  running?: boolean;
}): Promise<void> {
  const { actor } = options;
  if (!actor?.isOwner) return;

  const where = options.where ?? String(actor.system?.entangled?.where ?? "");
  const running = options.running ?? Boolean(actor.system?.entangled?.running);
  await actor.update({
    "system.entangled.kind": options.entanglement,
    "system.entangled.where": where,
    "system.entangled.running": running,
  });

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
      // What it is doing to them while they are still in it.
      doing: free ? [] : entanglementEffect({ entanglement: options.entanglement, where, running }),
    }),
    rolls: [roll],
  });
}

/** One line of what is being done to somebody, for the card. */
export interface EntanglementNote {
  /** The localisation key under GWORLD.Entangled.Doing. */
  key: string;
  /** What the line needs filled in, where it needs anything. */
  data?: Record<string, unknown>;
  /** True where the line is bad enough to be worth colouring. */
  grave?: boolean;
}

/**
 * What the thing holding them is actually doing (Campaigns pp. 410-411).
 *
 * Escaping is only half of being caught. A bolas round the legs trips a
 * running man and ties a standing one; round an arm it takes what he was
 * holding; round the neck it stops him breathing. A lariat is a Quick Contest
 * every turn, and the neck is that Contest five worse.
 */
export function entanglementEffect(options: {
  entanglement: Entanglement;
  where: string;
  running: boolean;
}): EntanglementNote[] {
  const notes: EntanglementNote[] = [];
  const where = options.where || "torso";

  if (options.entanglement === "bolas") {
    const hit = bolasHit(where);
    if (hit === "disarms") notes.push({ key: "Disarms" });
    if (hit === "trips") {
      notes.push({
        key: bolasTrips(options.running) ? "TripsRunning" : "TiesTheLegs",
        data: { damage: formatDiceAdds(BOLAS_FALL_DAMAGE) },
      });
    }
    // "If you hit the neck, the bolas cuts off the target's breathing (see
    // Suffocation, p. 436) until he escapes."
    if (hit === "neck") notes.push({ key: "Suffocates", grave: true });
    // "A successful parry with a cutting weapon cuts the cords, ruining the
    // bolas!" -- worth knowing while it is still round you.
    const parried = bolasDefense({ defense: "parry", cuttingWeapon: true });
    if (parried.cutsTheCords) notes.push({ key: "CutByCutting" });
  }

  if (options.entanglement === "lariat") {
    const hold = lariatHold({ location: where, running: options.running });
    if (hold.contestModifier !== 0) {
      notes.push({ key: "ContestAt", data: { modifier: hold.contestModifier } });
    } else if (!hold.rollsToStand) {
      notes.push({ key: "Contest" });
    }
    if (hold.suffocates) notes.push({ key: "Suffocates", grave: true });
    if (hold.rollsToStand) {
      notes.push({
        key: "RollsToStand",
        data: { damage: hold.fallDamage ? formatDiceAdds(hold.fallDamage) : "" },
      });
    }
    notes.push({ key: "LariatReady", data: { turns: lariatReadyTurns(LARIAT_LENGTH_YARDS) } });
  }

  return notes;
}

/**
 * A Molotov cocktail, thrown or dropped (p. 411).
 *
 * Three separate questions the book answers separately: whether the bottle
 * broke where it was aimed, what it does to whoever it caught, and -- for the
 * ones still on your belt -- whether falling over has just set you on fire.
 */
export async function throwMolotov(options: {
  actor: any;
  /** What the target did about it. */
  defense: "dodge" | "block" | "none";
  /** The DR where it struck, since it needs DR 3+ to break on anybody. */
  targetDr: number;
  /** True where the attack roll reached the Molotov's Malf. of 12. */
  malfunctioned: boolean;
  /** True for sealed armour, which keeps the fire out entirely. */
  sealed: boolean;
}): Promise<void> {
  const { actor } = options;
  if (!actor?.isOwner) return;

  const landing = molotovLanding({
    defense: options.defense,
    targetDr: options.targetDr,
    malfunctioned: options.malfunctioned,
  });
  const effect = molotovEffect({ landing, sealed: options.sealed });

  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    content: await foundry.applications.handlebars.renderTemplate(MOLOTOV_TEMPLATE, {
      name: String(actor.name ?? ""),
      landing,
      // Formatted here, so a figure with no adds reads "1d" and not "1d0".
      initial: effect.initial ? formatDiceAdds(effect.initial) : "",
      perSecond: formatDiceAdds(effect.perSecond),
      radiusYards: effect.radiusYards,
      // "Most DR protects at only 1/5 value; sealed armor protects completely."
      fifthDr: effect.drFraction < 1,
      burnsFor: formatDiceAdds(MOLOTOV_BURNS_FOR),
    }),
  });
}

/**
 * Whether the bottles on somebody's belt survived a fall (p. 411).
 *
 * "Roll 1d for each bottle if you fall; it breaks on a roll of 1-4."
 */
export async function checkBottles(actor: any, bottles: number): Promise<void> {
  if (!actor?.isOwner) return;
  const roll = new Roll(`${Math.max(1, bottles)}d6`);
  await roll.evaluate();
  const results = faces(roll);
  const broken = results.filter((die) => bottleBreaks(die)).length;

  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    content: await foundry.applications.handlebars.renderTemplate(BOTTLES_TEMPLATE, {
      name: String(actor.name ?? ""),
      dice: results,
      broken,
      bottles: Math.max(1, bottles),
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
