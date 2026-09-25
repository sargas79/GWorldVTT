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
 */

import { SYSTEM_ID } from "./constants.js";
import { conditionLabel, setCondition } from "./conditions.js";
import { stopBleeding } from "./bleeding.js";
import { advancePoison, dosePoison } from "./poison.js";
import { shock, type ShockOptions } from "./hazards.js";
import { applyCondition, removeCondition, type ConditionApplication } from "./procedure-extensions.js";
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

/** Lets the GM's client answer. Called during `init`. */
export function registerEffectQuery(): void {
  const queries = (CONFIG as any).queries;
  if (queries && typeof queries === "object") queries[EFFECT_QUERY] = answerEffectQuery;
}
