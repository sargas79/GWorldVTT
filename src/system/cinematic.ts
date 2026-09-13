/**
 * The cinematic rules, where they touch the sheet (Campaigns p. 417).
 *
 * Two of them are things a player does after the dice have landed and the
 * damage is already written down: declaring a wound a scratch, and buying a
 * failed defense back. Both cost something, and both are refused where the
 * price cannot be paid -- a rule that quietly gives away what it charges for
 * is not the rule the book wrote.
 */

import { SYSTEM_ID } from "./constants.js";
import { isRuleOn } from "./optional-rules.js";
import { spendFatigue } from "./extra-effort.js";
import { syncHealthConditions } from "./conditions.js";
import { FLESH_WOUND_COST, TV_ACTION_FP, fleshWound } from "../rules/cinematic.js";

const L = (key: string, data?: Record<string, unknown>) =>
  data ? game.i18n.format(`GWORLD.Cinematic.${key}`, data) : game.i18n.localize(`GWORLD.Cinematic.${key}`);

/** What the damage card remembers about one wound, so it can be taken back. */
export interface FleshWoundEntry {
  uuid: string;
  name: string;
  /** Injury actually taken, which is what all but a point of is given back. */
  injury: number;
  /** True when it came off Fatigue Points, which the rule allows for. */
  fatigue: boolean;
}

/** Unspent character points, as the ledger works them out. */
export function unspentPointsOf(actor: any): number {
  return Number(actor?.system?.derived?.points?.unspent ?? 0) || 0;
}

/**
 * Declares a wound a flesh wound (p. 417).
 *
 * "This lets you ignore all but 1 HP (or FP) of damage . . . at the cost of one
 * unspent character point. If you have no unspent points, the GM might let you
 * go into 'debt': he will subtract these points from those you earn for the
 * adventure."
 *
 * The point is spent as a negative award on the ledger rather than by moving
 * the starting total, which is what makes the debt work: a character with
 * nothing to spend goes below zero and pays it back out of the next award,
 * and the log says where it went.
 */
export async function declareFleshWound(actor: any, entry: FleshWoundEntry): Promise<boolean> {
  if (!actor?.isOwner || !isRuleOn("fleshWounds")) return false;

  const { taken, ignored } = fleshWound(entry.injury);
  if (ignored <= 0) {
    ui.notifications?.info(L("NothingToIgnore"));
    return false;
  }

  const pool = entry.fatigue ? actor.system?.fp : actor.system?.hp;
  const max = Number(pool?.max) || 0;
  const restored = Math.min(max, (Number(pool?.value) || 0) + ignored);

  const unspent = unspentPointsOf(actor);
  const awards = [
    ...(actor.system?.points?.awards ?? []),
    { points: -FLESH_WOUND_COST, note: L("AwardNote"), at: Date.now() },
  ];

  await actor.update({
    [`system.${entry.fatigue ? "fp" : "hp"}.value`]: restored,
    "system.points.awards": awards,
  });
  await syncHealthConditions(actor);

  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    content: await foundry.applications.handlebars.renderTemplate(
      `systems/${SYSTEM_ID}/templates/chat/flesh-wound.hbs`,
      {
        name: String(actor.name ?? ""),
        ignored,
        taken,
        pool: entry.fatigue ? "FP" : "HP",
        current: restored,
        max,
        // A character with nothing to spend goes into debt, which the book
        // allows and the card had better say out loud.
        inDebt: unspent < FLESH_WOUND_COST,
        unspent: unspent - FLESH_WOUND_COST,
      },
    ),
  });
  return true;
}

/** What the defense card remembers, so a failed roll can be bought back. */
export interface TvActionEntry {
  uuid: string;
  name: string;
  /** The attack it failed against, for the card to name. */
  attack: string;
}

/**
 * Converts a failed defense into a success (p. 417).
 *
 * "This costs him 1 FP and he loses his next turn." The fatigue is taken
 * first: a defender who cannot pay does not get the save, and nothing is said
 * on their behalf.
 */
export async function buyDefenseBack(actor: any, entry: TvActionEntry): Promise<boolean> {
  if (!actor?.isOwner || !isRuleOn("tvActionViolence")) return false;

  const paid = await spendFatigue(actor, TV_ACTION_FP, L("Action"));
  if (!paid) return false;

  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    content: await foundry.applications.handlebars.renderTemplate(
      `systems/${SYSTEM_ID}/templates/chat/tv-action.hbs`,
      { name: String(actor.name ?? ""), attack: entry.attack, fp: TV_ACTION_FP },
    ),
  });
  return true;
}

/**
 * Whether this actor is a mook (Campaigns p. 417).
 *
 * Only an NPC can be, and only where the table is playing the rule: a flag
 * left ticked on a sheet does nothing once Cannon Fodder is switched off.
 */
export function isCannonFodder(actor: any): boolean {
  return (
    isRuleOn("cannonFodder") &&
    actor?.type === "npc" &&
    actor?.system?.cannonFodder === true
  );
}

/**
 * Whether this actor never runs out and never jams (Campaigns p. 417).
 *
 * "PCs always have spare ammunition or power cells. If they use up all they
 * are carrying, they immediately find more. Furthermore, weapons never
 * malfunction." PCs, so a mook's rifle jams and empties as it always did --
 * which is half of what makes the rule feel the way it is meant to.
 */
export function hasInfiniteAmmunition(actor: any): boolean {
  return isRuleOn("infiniteAmmunition") && actor?.type === "character";
}
