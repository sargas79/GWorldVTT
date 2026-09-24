/**
 * Knocking a weapon out of somebody's hand, or leaving it unready, when the
 * user doing it may not own them (since API 1.136.0).
 *
 * A disarm (GURPS Basic Set: Campaigns pp. 400-401) is rolled by the
 * attacker, but what it changes is the foe's weapon, and a player rarely owns
 * the foe. So the change is made by whoever may make it: the user's own
 * client where they own the item, and the active GM's otherwise, asked
 * through a Foundry user query. A module's own disarm or snatch goes the same
 * way through `items.knockAway` and `items.setUnready`.
 *
 * The GM's client doesn't take the request on trust. Foundry hands the
 * handler the user who sent the query -- the server fills that in from the
 * sender's own connection, so a payload can't claim to be somebody else --
 * and the change is made for a GM or the owner of the weapon's holder. Anyone
 * else needs a disarm they won (since API 1.143.0): the request names the
 * card of the Quick Contest tagged `disarm` that the sender rolled in the
 * last few minutes, whose attacker they own, whose foe's side is this weapon,
 * and whose result is this change. Each card gets through once. Owning a
 * character is no longer enough to knock away any foe's weapon.
 *
 * A weapon knocked away leaves the foe's hands: it stops being carried, so
 * it is on no attack list and weighs nothing, until somebody ticks it carried
 * again -- which is picking it up.
 */

import { SYSTEM_ID } from "./constants.js";
import { disarmResult } from "../rules/melee-situations.js";
import type { QuickContestRecord } from "./contest.js";

/** The query the GM's client answers. */
export const HELD_WEAPON_QUERY = `${SYSTEM_ID}.heldWeapon`;

/** How long to wait for the GM's client before giving up. */
const QUERY_TIMEOUT_MS = 10_000;

/**
 * How long after its contest a disarm may still be applied. The result is
 * applied the moment the contest is rolled, so this is only slack for a slow
 * connection; an old card is not a disarm that has just happened.
 */
const CONTEST_WINDOW_MS = 2 * 60_000;

/** The contest cards the GM's client has already acted on: each gets through once. */
const spentContests = new Set<string>();

/** What `items.setUnready` did. */
export interface UnreadyChanged {
  itemId: string;
  unready: boolean;
  reason: string;
}

/** What `items.knockAway` did. */
export interface KnockedAway {
  itemId: string;
  reason: string;
}

/** What a caller may pass: why, and on whose behalf. */
export interface HeldWeaponOptions {
  reason?: string;
  /**
   * The actor doing it -- on a disarm, the attacker. A user who doesn't own
   * the weapon's holder may still have it changed on behalf of an actor they
   * own.
   */
  attacker?: any;
  /**
   * The chat message of the disarm behind it (since API 1.143.0), or its id:
   * the card of a Quick Contest tagged `disarm`, as `roll.quickContest`
   * posts it and returns its `messageId`. What lets a user who owns neither
   * the weapon's holder nor the GM's seat have the change made.
   */
  contest?: any;
}

type HeldWeaponChange =
  | { action: "unready"; uuid: string; unready: boolean; reason: string; attackerUuid: string; contestId: string }
  | { action: "knockAway"; uuid: string; reason: string; attackerUuid: string; contestId: string };

/**
 * Whether the change can be made to this item at all. Only gear can leave a
 * hand: a trait's attack is part of the body, and a skill is not a thing.
 * Only equipment keeps `unready`; a shield is never swung out of readiness.
 */
function accepts(item: any, action: HeldWeaponChange["action"]): boolean {
  if (!item?.actor && !item?.parent) return false;
  if (action === "unready") return item?.type === "equipment";
  return item?.type === "equipment" || item?.type === "shield";
}

/** Whether a user owns a document, asked the way Foundry asks it. */
function owns(user: any, document: any): boolean {
  if (!user || typeof document?.testUserPermission !== "function") return false;
  return document.testUserPermission(user, "OWNER") === true;
}

/**
 * Whether this user may have the change made on their say alone: a GM, or the
 * owner of the item's holder.
 */
function maySayAlone(user: any, item: any): boolean {
  if (!user) return false;
  return user.isGM === true || owns(user, item?.actor ?? item?.parent);
}

/** A contest option as its message id: the id given, or the message's. */
function contestId(contest: any): string {
  if (typeof contest === "string") return contest;
  return String(contest?.id ?? "");
}

/**
 * Whether this chat message is a disarm this user won, just now, that makes
 * this change: a Quick Contest card tagged `disarm`, posted by the user in
 * the last few minutes, whose first side is the attacker named and whose
 * second is this item, with the result the change asks for -- the weapon
 * knocked away for `knockAway`, left unready for `unready`. Readying a
 * weapon is never a disarm's to do.
 */
export function isWonDisarm(message: any, user: any, change: Pick<HeldWeaponChange, "action" | "uuid" | "attackerUuid"> & { unready?: boolean }, now = Date.now()): boolean {
  if (!message || !user) return false;
  const record = message.flags?.[SYSTEM_ID]?.quickContest as Partial<QuickContestRecord> | undefined;
  if (!record || !Array.isArray(record.tags) || !record.tags.includes("disarm")) return false;
  const authorId = String(message.author?.id ?? message.author ?? "");
  if (!authorId || authorId !== String(user.id ?? "")) return false;
  const posted = Number(message.timestamp);
  if (!Number.isFinite(posted) || now - posted > CONTEST_WINDOW_MS || posted - now > CONTEST_WINDOW_MS) return false;
  if (!change.attackerUuid || record.first?.actorUuid !== change.attackerUuid) return false;
  if (!change.uuid || record.second?.itemUuid !== change.uuid) return false;
  if (record.outcome !== "first" && record.outcome !== "second" && record.outcome !== "tie") return false;
  const result = disarmResult({ outcome: record.outcome, marginOfVictory: Number(record.marginOfVictory) || 0 });
  return change.action === "knockAway" ? result.disarmed : change.unready === true && result.unready;
}

/** Makes the change on this client, which must own the item. */
async function applyHere(item: any, change: HeldWeaponChange): Promise<UnreadyChanged | KnockedAway | null> {
  if (!item?.isOwner || !accepts(item, change.action)) return null;
  const itemId = String(item.id ?? "");
  if (change.action === "unready") {
    if (Boolean(item.system?.unready) !== change.unready) await item.update({ "system.unready": change.unready });
    return { itemId, unready: change.unready, reason: change.reason };
  }
  // Out of the hand and off the body: not carried, not equipped, and not
  // unready either, since whoever picks it up readies it in doing so.
  await item.update({
    "system.carried": false,
    "system.equipped": false,
    ...(item.type === "equipment" ? { "system.unready": false } : {}),
  });
  return { itemId, reason: change.reason };
}

/**
 * Makes the change here where the user owns the item, or asks the active GM
 * to on behalf of an attacker the user owns. Null where it can't be made: an
 * item that can't take it, a user with no say over it, or no GM connected.
 */
async function change(item: any, request: HeldWeaponChange, attacker: any): Promise<UnreadyChanged | KnockedAway | null> {
  if (!accepts(item, request.action)) return null;
  if (item.isOwner) return applyHere(item, request);
  // Not worth troubling the GM with what they would only refuse: a user
  // with no say of their own needs their own attacker and a contest to show.
  const user = (game as any).user;
  if (!maySayAlone(user, item) && !(owns(user, attacker) && request.contestId)) return null;
  const gm = (game as any).users?.activeGM;
  if (!gm || gm.isSelf || typeof gm.query !== "function") return null;
  try {
    const result = await gm.query(HELD_WEAPON_QUERY, request, { timeout: QUERY_TIMEOUT_MS });
    return result && typeof result === "object" ? (result as UnreadyChanged | KnockedAway) : null;
  } catch (error) {
    console.warn(`${SYSTEM_ID} | the GM's client could not change ${String(item?.name ?? "")}`, error);
    return null;
  }
}

/**
 * Leaves a weapon unready, or readies it, with no roll and no card. Null for
 * anything but equipment on an actor, for a user who owns neither its holder
 * nor the `attacker` named with a won disarm `contest`, or where no GM is
 * connected to make it.
 */
export async function setWeaponUnready(
  item: any,
  unready: boolean,
  options: HeldWeaponOptions = {},
): Promise<UnreadyChanged | null> {
  const attacker = options?.attacker ?? null;
  const result = await change(item, {
    action: "unready",
    uuid: String(item?.uuid ?? ""),
    unready: unready === true,
    reason: String(options?.reason ?? ""),
    attackerUuid: String(attacker?.uuid ?? ""),
    contestId: contestId(options?.contest),
  }, attacker);
  return result as UnreadyChanged | null;
}

/**
 * Knocks a weapon or shield out of its holder's hands, with no roll and no
 * card: it is no longer carried or equipped until somebody picks it up. Null
 * for anything but equipment or a shield on an actor, for a user who owns
 * neither its holder nor the `attacker` named with a won disarm `contest`, or
 * where no GM is connected to make it.
 */
export async function knockWeaponAway(item: any, options: HeldWeaponOptions = {}): Promise<KnockedAway | null> {
  const attacker = options?.attacker ?? null;
  const result = await change(item, {
    action: "knockAway",
    uuid: String(item?.uuid ?? ""),
    reason: String(options?.reason ?? ""),
    attackerUuid: String(attacker?.uuid ?? ""),
    contestId: contestId(options?.contest),
  }, attacker);
  return result as KnockedAway | null;
}

/**
 * The GM's side of the query. Only the two changes above are made, only to
 * gear, and only for a sender who may ask: a GM, the owner of the weapon's
 * holder, or the owner of the attacker named who won the disarm on the
 * contest card named (see `isWonDisarm`), which is then spent. Who the sender
 * is comes from the `user` Foundry hands the handler, never from the payload.
 */
export async function answerHeldWeaponQuery(data: unknown, context?: { user?: any }): Promise<UnreadyChanged | KnockedAway | null> {
  const request = data as Partial<HeldWeaponChange> | null;
  if (!request || typeof request.uuid !== "string" || !request.uuid) return null;
  if (request.action !== "unready" && request.action !== "knockAway") return null;
  const item = await fromUuid(request.uuid).catch(() => null);
  if (!item || !accepts(item, request.action)) return null;
  const user = context?.user;
  const attackerUuid = typeof request.attackerUuid === "string" ? request.attackerUuid : "";
  const id = typeof request.contestId === "string" ? request.contestId : "";
  const unready = (request as { unready?: unknown }).unready === true;
  if (!maySayAlone(user, item)) {
    const attacker = attackerUuid ? await fromUuid(attackerUuid).catch(() => null) : null;
    if (!owns(user, attacker) || !id || spentContests.has(id)) return null;
    const message = (game as any).messages?.get?.(id) ?? null;
    if (!isWonDisarm(message, user, { action: request.action, uuid: request.uuid, attackerUuid, unready })) return null;
    // Spent before anything is awaited, so the same card sent twice at once
    // gets through only once.
    spentContests.add(id);
  }
  const reason = String(request.reason ?? "");
  return request.action === "unready"
    ? applyHere(item, { action: "unready", uuid: request.uuid, unready, reason, attackerUuid, contestId: id })
    : applyHere(item, { action: "knockAway", uuid: request.uuid, reason, attackerUuid, contestId: id });
}

/** Forgets which contest cards were spent. For tests. */
export function resetSpentContests(): void {
  spentContests.clear();
}

/** Lets the GM's client answer. Called during `init`. */
export function registerHeldWeaponQuery(): void {
  const queries = (CONFIG as any).queries;
  if (queries && typeof queries === "object") queries[HELD_WEAPON_QUERY] = answerHeldWeaponQuery;
}
