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
 * and the change is made only for a GM, the owner of the weapon's holder, or
 * the owner of the attacker the request names. A player can knock a foe's
 * weapon away on behalf of their own character, and nobody else's.
 *
 * A weapon knocked away leaves the foe's hands: it stops being carried, so
 * it is on no attack list and weighs nothing, until somebody ticks it carried
 * again -- which is picking it up.
 */

import { SYSTEM_ID } from "./constants.js";

/** The query the GM's client answers. */
export const HELD_WEAPON_QUERY = `${SYSTEM_ID}.heldWeapon`;

/** How long to wait for the GM's client before giving up. */
const QUERY_TIMEOUT_MS = 10_000;

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
}

type HeldWeaponChange =
  | { action: "unready"; uuid: string; unready: boolean; reason: string; attackerUuid: string }
  | { action: "knockAway"; uuid: string; reason: string; attackerUuid: string };

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
 * Whether this user may have the change made: a GM, the owner of the item's
 * holder, or the owner of the attacker acting.
 */
function mayRequest(user: any, item: any, attacker: any): boolean {
  if (!user) return false;
  if (user.isGM) return true;
  return owns(user, item?.actor ?? item?.parent) || owns(user, attacker);
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
  // Not worth troubling the GM with what they would only refuse.
  if (!mayRequest((game as any).user, item, attacker)) return null;
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
 * nor the `attacker` named, or where no GM is connected to make it.
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
  }, attacker);
  return result as UnreadyChanged | null;
}

/**
 * Knocks a weapon or shield out of its holder's hands, with no roll and no
 * card: it is no longer carried or equipped until somebody picks it up. Null
 * for anything but equipment or a shield on an actor, for a user who owns
 * neither its holder nor the `attacker` named, or where no GM is connected to
 * make it.
 */
export async function knockWeaponAway(item: any, options: HeldWeaponOptions = {}): Promise<KnockedAway | null> {
  const attacker = options?.attacker ?? null;
  const result = await change(item, {
    action: "knockAway",
    uuid: String(item?.uuid ?? ""),
    reason: String(options?.reason ?? ""),
    attackerUuid: String(attacker?.uuid ?? ""),
  }, attacker);
  return result as KnockedAway | null;
}

/**
 * The GM's side of the query. Only the two changes above are made, only to
 * gear, and only for a sender who may ask: a GM, the owner of the weapon's
 * holder, or the owner of the attacker named. Who the sender is comes from
 * the `user` Foundry hands the handler, never from the payload.
 */
export async function answerHeldWeaponQuery(data: unknown, context?: { user?: any }): Promise<UnreadyChanged | KnockedAway | null> {
  const request = data as Partial<HeldWeaponChange> | null;
  if (!request || typeof request.uuid !== "string" || !request.uuid) return null;
  if (request.action !== "unready" && request.action !== "knockAway") return null;
  const item = await fromUuid(request.uuid).catch(() => null);
  if (!item) return null;
  const attackerUuid = typeof request.attackerUuid === "string" ? request.attackerUuid : "";
  const attacker = attackerUuid ? await fromUuid(attackerUuid).catch(() => null) : null;
  if (!mayRequest(context?.user, item, attacker)) return null;
  const reason = String(request.reason ?? "");
  return request.action === "unready"
    ? applyHere(item, { action: "unready", uuid: request.uuid, unready: (request as { unready?: unknown }).unready === true, reason, attackerUuid })
    : applyHere(item, { action: "knockAway", uuid: request.uuid, reason, attackerUuid });
}

/** Lets the GM's client answer. Called during `init`. */
export function registerHeldWeaponQuery(): void {
  const queries = (CONFIG as any).queries;
  if (queries && typeof queries === "object") queries[HELD_WEAPON_QUERY] = answerHeldWeaponQuery;
}
