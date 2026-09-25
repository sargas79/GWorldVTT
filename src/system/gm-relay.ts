/**
 * Dosing, injuring and conditioning an actor the user doesn't own, through
 * the GM's client (since API 1.149.0).
 *
 * A player's gas grenade, cautery or shocking device often lands on a token
 * the player doesn't own, and only an owner can write to an actor. So, as a
 * disarm's change to the foe's weapon does (`held-weapons.ts`), these effects
 * are made by whoever may make them: the user's own client where they own the
 * actor, and the active GM's otherwise, asked through a Foundry user query.
 *
 * The GM's client doesn't take the request on trust. The caller must name the
 * actor the effect comes from -- `source` -- and own it: that is its reason to
 * act on somebody else's character. Foundry hands the handler the user who
 * sent the query (the server fills that in from the sender's own connection),
 * and the GM's client checks that user owns the source, or the target, or is
 * a GM. A GM caller and the target's owner act directly, as they always did.
 * Areas on a scene go the same way since API 1.150.0 (below).
 */

import { SYSTEM_ID } from "./constants.js";
import { conditionLabel, setCondition } from "./conditions.js";
import { stopBleeding } from "./bleeding.js";
import { advancePoison, dosePoison } from "./poison.js";
import { shock, type ShockOptions } from "./hazards.js";
import { applyCondition, removeCondition, type ConditionApplication } from "./procedure-extensions.js";
import { addArea, removeArea } from "./modifier-areas.js";
import type { Poison } from "../rules/poison.js";

/** The query the GM's client answers. */
export const EFFECT_QUERY = `${SYSTEM_ID}.effect`;

/** How long to wait for the GM's client before giving up. */
const QUERY_TIMEOUT_MS = 10_000;

/** The effects that go through the GM, each with the arguments it needs besides the actor. */
export interface EffectArguments {
  dosePoison: { poison: Poison; doublings: number };
  advancePoison: { id: string };
  stopBleeding: Record<string, never>;
  applyCondition: { application: ConditionApplication };
  removeCondition: { id: string };
  shock: { options: Omit<ShockOptions, "actor"> };
}

export type EffectAction = keyof EffectArguments;

/** What the GM's client is sent. */
interface EffectRequest<A extends EffectAction = EffectAction> {
  action: A;
  actorUuid: string;
  sourceUuid: string;
  args: EffectArguments[A];
}

/** Each effect as its owner's client makes it. */
const HANDLERS: { [A in EffectAction]: (actor: any, args: EffectArguments[A]) => Promise<unknown> } = {
  dosePoison: (actor, args) => dosePoison({ actor, poison: args.poison, doublings: Number(args.doublings) || 0 }),
  advancePoison: (actor, args) => advancePoison({ actor, id: String(args.id ?? "") }),
  stopBleeding: (actor) => stopBleeding(actor),
  applyCondition: (actor, args) =>
    applyCondition(actor, args.application, { setSystemCondition: setCondition, systemConditionLabel: conditionLabel }),
  removeCondition: (actor, args) => removeCondition(actor, String(args.id ?? ""), { setSystemCondition: setCondition }),
  shock: (actor, args) => shock({ ...args.options, actor }),
};

/** Whether the arguments are the right shape for the effect: checked on the GM's side. */
function wellFormed(action: EffectAction, args: any): boolean {
  if (!args || typeof args !== "object") return action === "stopBleeding";
  switch (action) {
    case "dosePoison":
      return !!args.poison && typeof args.poison === "object" && typeof args.poison.name === "string";
    case "advancePoison":
    case "removeCondition":
      return typeof args.id === "string" && args.id !== "";
    case "applyCondition":
      return !!args.application && typeof args.application === "object";
    case "shock":
      return !!args.options && typeof args.options === "object";
    default:
      return true;
  }
}

/** Whether a user owns a document, asked the way Foundry asks it. */
function owns(user: any, document: any): boolean {
  if (!user || typeof document?.testUserPermission !== "function") return false;
  return document.testUserPermission(user, "OWNER") === true;
}

/** The actor a `source` option names: an actor, or a token's actor. */
export function sourceActor(source: any): any {
  if (!source || typeof source !== "object") return null;
  if (source.documentName === "Actor") return source;
  return source.actor ?? (typeof source.testUserPermission === "function" ? source : null);
}

/**
 * Makes an effect on an actor: here where the user owns it (a GM always
 * does), and through the active GM's client where the user owns the `source`
 * instead. Anywhere else, or with no GM connected, the effect is made here
 * all the same, so it refuses as it always has -- `refused` for the caller --
 * and with no GM connected the user is told.
 */
export async function relayEffect<A extends EffectAction, T>(
  action: A,
  actor: any,
  source: any,
  args: EffectArguments[A],
  refused: T,
): Promise<T> {
  const here = () => HANDLERS[action](actor, args) as Promise<T>;
  if (!actor || actor.isOwner) return here();
  const user = (game as any).user;
  const from = sourceActor(source);
  if (!owns(user, from)) return here();
  const gm = (game as any).users?.activeGM;
  if (!gm || gm.isSelf || typeof gm.query !== "function") {
    ui.notifications?.warn(game.i18n.format("GWORLD.Chat.NoGmToApply", { names: String(actor?.name ?? "") }));
    return refused;
  }
  const request: EffectRequest<A> = { action, actorUuid: String(actor.uuid ?? ""), sourceUuid: String(from.uuid ?? ""), args };
  try {
    const result = await gm.query(EFFECT_QUERY, request, { timeout: QUERY_TIMEOUT_MS });
    return (result === null || result === undefined ? refused : result) as T;
  } catch (error) {
    console.warn(`${SYSTEM_ID} | the GM's client could not change ${String(actor?.name ?? "")}`, error);
    return refused;
  }
}

/**
 * The GM's side of the query. Only the effects above are made, only to an
 * actor, and only for a sender who may ask: a GM, the target's owner, or the
 * owner of the source actor named. Who the sender is comes from the `user`
 * Foundry hands the handler, never from the payload.
 */
export async function answerEffectQuery(data: unknown, context?: { user?: any }): Promise<unknown> {
  const request = data as Partial<EffectRequest> | null;
  if (!request || typeof request.actorUuid !== "string" || !request.actorUuid) return null;
  const action = request.action;
  if (typeof action !== "string" || !Object.prototype.hasOwnProperty.call(HANDLERS, action)) return null;
  if (!wellFormed(action, request.args)) return null;
  const actor = await fromUuid(request.actorUuid).catch(() => null);
  if (!actor || (actor as any).documentName !== "Actor") return null;
  const user = context?.user;
  if (!user) return null;
  if (user.isGM !== true && !owns(user, actor)) {
    const source = typeof request.sourceUuid === "string" && request.sourceUuid
      ? await fromUuid(request.sourceUuid).catch(() => null)
      : null;
    if (!source || (source as any).documentName !== "Actor" || !owns(user, source)) return null;
  }
  const result = await HANDLERS[action](actor, (request.args ?? {}) as never);
  return result === undefined ? null : result;
}

/*
 * Placing and removing an area through the GM's client (since API 1.150.0).
 *
 * A player's smoke round or dropped light leaves an area on the scene, and
 * only a GM may write the scene. So `areas.add` and `areas.remove` go the same
 * way as the effects above: here where the user may change the scene, and
 * through the active GM's client where the user owns the `source` actor the
 * area comes from. The scene travels by its uuid, so the area goes on the
 * scene the player named, not the one the GM is viewing.
 */

/** The query the GM's client answers for areas. */
export const AREA_QUERY = `${SYSTEM_ID}.area`;

/** What `areas.add` takes. */
export type AreaInput = Parameters<typeof addArea>[1];

/** What the GM's client is sent for an area. */
interface AreaRequest {
  action: "add" | "remove";
  sceneUuid: string;
  sourceUuid: string;
  area?: AreaInput;
  id?: string;
}

/** A scene as a module names it: the document, or its id or uuid. */
export function sceneFrom(scene: any): any {
  if (typeof scene !== "string") return scene ?? null;
  const scenes = (game as any).scenes;
  return scenes?.get?.(scene) ?? scenes?.get?.(scene.replace(/^Scene\./, "")) ?? null;
}

/** Whether the current user may write the scene here, as `addArea` asks it. */
function writesScene(scene: any): boolean {
  return !scene || scene.isOwner === true || (game as any).user?.isGM === true;
}

/**
 * Sends an area request to the active GM's client where the user owns the
 * source; null where it can't be sent, so the caller does it here and is
 * refused as before.
 */
async function relayArea<T>(scene: any, source: any, request: Omit<AreaRequest, "sceneUuid" | "sourceUuid">, refused: T): Promise<T | undefined> {
  const from = sourceActor(source);
  if (!owns((game as any).user, from)) return undefined;
  const gm = (game as any).users?.activeGM;
  if (!gm || gm.isSelf || typeof gm.query !== "function") {
    ui.notifications?.warn(game.i18n.format("GWORLD.Chat.NoGmToApply", { names: String(scene?.name ?? "") }));
    return refused;
  }
  const payload: AreaRequest = { ...request, sceneUuid: String(scene.uuid ?? ""), sourceUuid: String(from.uuid ?? "") };
  try {
    const result = await gm.query(AREA_QUERY, payload, { timeout: QUERY_TIMEOUT_MS });
    return (result === null || result === undefined ? refused : result) as T;
  } catch (error) {
    console.warn(`${SYSTEM_ID} | the GM's client could not change the scene ${String(scene?.name ?? "")}`, error);
    return refused;
  }
}

/**
 * `areas.add` (source since 1.150.0): the area on the scene named, here where
 * the user may write it, else through the GM's client for the owner of
 * `source`. The area's id, or null where refused.
 */
export async function addAreaFor(scene: any, area: AreaInput, options: { source?: any } = {}): Promise<string | null> {
  const target = sceneFrom(scene);
  if (!writesScene(target) && area && typeof area === "object") {
    const relayed = await relayArea<string | null>(target, options?.source, { action: "add", area }, null);
    if (relayed !== undefined) return relayed;
  }
  return target ? addArea(target, area) : null;
}

/** `areas.remove` (source since 1.150.0): as `addAreaFor`, taking the area off. */
export async function removeAreaFor(scene: any, id: string, options: { source?: any } = {}): Promise<void> {
  const target = sceneFrom(scene);
  if (!writesScene(target)) {
    const relayed = await relayArea<boolean>(target, options?.source, { action: "remove", id: String(id ?? "") }, false);
    if (relayed !== undefined) return;
  }
  if (target) await removeArea(target, id);
}

/**
 * The GM's side of the area query: an area added to or taken off a scene, for
 * a GM, the scene's owner, or the owner of the source actor named. Returns the
 * area's id, true for a removal, or null where refused.
 */
export async function answerAreaQuery(data: unknown, context?: { user?: any }): Promise<unknown> {
  const request = data as Partial<AreaRequest> | null;
  if (!request || typeof request.sceneUuid !== "string" || !request.sceneUuid) return null;
  if (request.action !== "add" && request.action !== "remove") return null;
  if (request.action === "add" && (!request.area || typeof request.area !== "object")) return null;
  if (request.action === "remove" && (typeof request.id !== "string" || !request.id)) return null;
  const scene = await fromUuid(request.sceneUuid).catch(() => null);
  if (!scene || (scene as any).documentName !== "Scene") return null;
  const user = context?.user;
  if (!user) return null;
  if (user.isGM !== true && !owns(user, scene)) {
    const source = typeof request.sourceUuid === "string" && request.sourceUuid
      ? await fromUuid(request.sourceUuid).catch(() => null)
      : null;
    if (!source || (source as any).documentName !== "Actor" || !owns(user, source)) return null;
  }
  if (request.action === "add") return (await addArea(scene, request.area as AreaInput)) ?? null;
  await removeArea(scene, request.id as string);
  return true;
}

/** Lets the GM's client answer. Called during `init`. */
export function registerEffectQuery(): void {
  const queries = (CONFIG as any).queries;
  if (queries && typeof queries === "object") {
    queries[EFFECT_QUERY] = answerEffectQuery;
    queries[AREA_QUERY] = answerAreaQuery;
  }
}
