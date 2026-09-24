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

type HeldWeaponChange =
  | { action: "unready"; uuid: string; unready: boolean; reason: string }
  | { action: "knockAway"; uuid: string; reason: string };

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
 * to. Null where it can't be made: an item that can't take it, or nobody
 * connected who may.
 */
async function change(item: any, request: HeldWeaponChange): Promise<UnreadyChanged | KnockedAway | null> {
  if (!accepts(item, request.action)) return null;
  if (item.isOwner) return applyHere(item, request);
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
 * anything but equipment on an actor, or where neither the user nor a GM
 * connected can change it.
 */
export async function setWeaponUnready(
  item: any,
  unready: boolean,
  options: { reason?: string } = {},
): Promise<UnreadyChanged | null> {
  const result = await change(item, { action: "unready", uuid: String(item?.uuid ?? ""), unready: unready === true, reason: String(options?.reason ?? "") });
  return result as UnreadyChanged | null;
}

/**
 * Knocks a weapon or shield out of its holder's hands, with no roll and no
 * card: it is no longer carried or equipped until somebody picks it up. Null
 * for anything but equipment or a shield on an actor, or where neither the
 * user nor a GM connected can change it.
 */
export async function knockWeaponAway(item: any, options: { reason?: string } = {}): Promise<KnockedAway | null> {
  const result = await change(item, { action: "knockAway", uuid: String(item?.uuid ?? ""), reason: String(options?.reason ?? "") });
  return result as KnockedAway | null;
}

/**
 * The GM's side of the query. Only the two changes above are made, and only
 * to gear, so a player's client can't use it to write anything else.
 */
export async function answerHeldWeaponQuery(data: unknown): Promise<UnreadyChanged | KnockedAway | null> {
  const request = data as Partial<HeldWeaponChange> | null;
  if (!request || typeof request.uuid !== "string" || !request.uuid) return null;
  if (request.action !== "unready" && request.action !== "knockAway") return null;
  const item = await fromUuid(request.uuid).catch(() => null);
  if (!item) return null;
  const reason = String(request.reason ?? "");
  return request.action === "unready"
    ? applyHere(item, { action: "unready", uuid: request.uuid, unready: (request as { unready?: unknown }).unready === true, reason })
    : applyHere(item, { action: "knockAway", uuid: request.uuid, reason });
}

/** Lets the GM's client answer. Called during `init`. */
export function registerHeldWeaponQuery(): void {
  const queries = (CONFIG as any).queries;
  if (queries && typeof queries === "object") queries[HELD_WEAPON_QUERY] = answerHeldWeaponQuery;
}
