/**
 * A load pulled behind a character (GURPS Basic Set: Campaigns p. 353; since
 * API 1.113.0).
 *
 * What is pulled is kept on the actor, and its effective weight -- the load
 * and its conveyance together, divided as the book divides them -- counts
 * toward encumbrance while it lasts. The arithmetic is in `rules/towing.ts`.
 */

import { SYSTEM_ID } from "./constants.js";
import { TOWING_LIMIT_BL, canPull, towedWeight, type Conveyance } from "../rules/towing.js";

const TOWING_FLAG = "towing";

/** What a character is pulling, as `tow` keeps it and `derived.encumbrance.towing` reads it. */
export interface Towing {
  weight: number;
  conveyance: Conveyance;
  smooth: boolean;
  label: string;
}

/**
 * Starts pulling a load: `weight` is the load and its sledge, cart or wagon
 * together, in pounds. Replaces whatever was being pulled. Resolves to
 * `{ effective, limit, movable }`, or null for a user who can't change the
 * actor or a weight that isn't a positive number.
 */
export async function tow(actor: any, options: { weight: number; conveyance?: Conveyance; smooth?: boolean; label?: string }): Promise<{ effective: number; limit: number; movable: boolean } | null> {
  const weight = Number(options?.weight);
  if (!actor?.isOwner || !Number.isFinite(weight) || weight <= 0) return null;
  const conveyance: Conveyance = (["none", "sledge", "cart", "wagon"] as const).includes(options.conveyance as Conveyance)
    ? (options.conveyance as Conveyance)
    : "none";
  const towing: Towing = { weight, conveyance, smooth: options.smooth === true, label: String(options.label ?? "") };
  await actor.setFlag(SYSTEM_ID, TOWING_FLAG, towing);
  const effective = towedWeight(towing);
  const basicLift = Number(actor.system?.derived?.basicLift) || 0;
  return { effective, limit: TOWING_LIMIT_BL * basicLift, movable: canPull(effective, basicLift) };
}

/** Lets go of whatever was being pulled. False where nothing was, or the user can't change the actor. */
export async function stopTowing(actor: any): Promise<boolean> {
  if (!actor?.isOwner || !actor.getFlag?.(SYSTEM_ID, TOWING_FLAG)) return false;
  await actor.unsetFlag(SYSTEM_ID, TOWING_FLAG);
  return true;
}
