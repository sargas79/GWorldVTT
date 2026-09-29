/**
 * Energy Reserve at the table (Basic Set Revised p. 326; since API 1.167.0).
 *
 * A reserve is a pool of one origin. Where an ability of that origin costs FP,
 * `applyFatigue` asks here first and the reserve pays what it holds. A hostile
 * power of the same origin may drain it; nothing else can. Time recharges it a
 * point every ten minutes, or as slowly as its limitations say.
 */

import {
  drainsReserve,
  originKey,
  payFromReserve,
  rechargeReserve,
  reserveValue,
  type ReserveUse,
} from "../rules/energy-reserve.js";
import { everyActor } from "./every-actor.js";

/** A character's reserve as prepared: what it holds and how fast it recharges. */
export interface ReserveView {
  key: string;
  origin: string;
  max: number;
  value: number;
  /** Seconds a point takes to come back, or null where only energy theft refills it. */
  interval: number | null;
}

/** What the sheet has stored as used, by origin key. */
function usedOf(actor: any): Record<string, ReserveUse> {
  const held = actor?.system?.session?.reserves;
  return held && typeof held === "object" ? (held as Record<string, ReserveUse>) : {};
}

/** The reserves a character has. */
export function reservesOf(actor: any): ReserveView[] {
  const list = actor?.system?.derived?.reserves;
  return Array.isArray(list) ? (list as ReserveView[]) : [];
}

/**
 * How a cost of FP for an ability of `origin` would be paid: what the reserve
 * covers, what is left for FP, and the reserve state that would result.
 */
export function reservePlan(
  actor: any,
  origin: string,
  cost: number,
): { reserve: number; rest: number; reserves: Record<string, ReserveUse> } {
  const key = originKey(origin);
  const held = reservesOf(actor).find((r) => r.key === key);
  const used = usedOf(actor);
  if (!held) return { reserve: 0, rest: Math.max(0, Math.floor(cost)), reserves: used };
  const paid = payFromReserve(cost, held.value);
  const before = used[key] ?? { spent: 0, carry: 0 };
  return {
    ...paid,
    reserves: { ...used, [key]: { spent: before.spent + paid.reserve, carry: before.carry } },
  };
}

/**
 * Takes what the reserve of `origin` can pay of a cost, and says what is left
 * for the caller to charge as FP (since API 1.167.0).
 */
export async function chargeReserve(
  actor: any,
  origin: string,
  cost: number,
): Promise<{ reserve: number; rest: number }> {
  if (!actor?.isOwner && !game.user?.isGM) return { reserve: 0, rest: Math.max(0, Math.floor(cost)) };
  const plan = reservePlan(actor, origin, cost);
  if (plan.reserve > 0) await actor.update({ "system.session.reserves": plan.reserves });
  return { reserve: plan.reserve, rest: plan.rest };
}

/**
 * A hostile power drains a reserve: only one of the same origin can, and it
 * takes as much as there is, never below none. Returns what it took.
 */
export async function drainReserve(actor: any, reserveOrigin: string, powerOrigin: string, amount: number): Promise<number> {
  if (!drainsReserve(reserveOrigin, powerOrigin)) return 0;
  const taken = await chargeReserve(actor, reserveOrigin, Math.max(0, Math.floor(amount)));
  return taken.reserve;
}

/** Gives points back to a reserve, up to its size (Recover Energy, Absorption, energy theft). */
export async function restoreReserve(actor: any, origin: string, amount: number): Promise<number> {
  if (!actor?.isOwner && !game.user?.isGM) return 0;
  const key = originKey(origin);
  const held = reservesOf(actor).find((r) => r.key === key);
  if (!held) return 0;
  const used = usedOf(actor);
  const before = used[key] ?? { spent: 0, carry: 0 };
  const gained = Math.min(before.spent, Math.max(0, Math.floor(amount)));
  if (gained <= 0) return 0;
  await actor.update({ "system.session.reserves": { ...used, [key]: { spent: before.spent - gained, carry: before.carry } } });
  return gained;
}

/**
 * Edits a reserve from the sheet: a positive change gives points back, a
 * negative one spends them, "full" refills it. Only what the reserve holds can
 * be spent and only what it has used can be restored. Returns the points moved.
 */
export async function adjustReserve(actor: any, origin: string, change: number | "full"): Promise<number> {
  if (!actor?.isOwner && !game.user?.isGM) return 0;
  const held = reservesOf(actor).find((r) => r.key === originKey(origin));
  if (!held) return 0;
  if (change === "full") return restoreReserve(actor, origin, held.max);
  if (change < 0) return (await chargeReserve(actor, origin, -change)).reserve;
  return restoreReserve(actor, origin, change);
}

/**
 * Lets time recharge a character's reserves. Returns the new state where
 * anything changed, or null.
 */
export function rechargedReserves(actor: any, seconds: number): Record<string, ReserveUse> | null {
  const used = usedOf(actor);
  const next: Record<string, ReserveUse> = { ...used };
  let changed = false;
  for (const r of reservesOf(actor)) {
    const before = used[r.key];
    if (!before || before.spent <= 0) continue;
    const after = rechargeReserve(before, r.interval, seconds);
    if (after.spent !== before.spent || after.carry !== before.carry) {
      next[r.key] = { spent: after.spent, carry: after.carry };
      changed = true;
    }
  }
  return changed ? next : null;
}

/** Recharges a character's reserves for a span of time, and saves it. */
export async function rechargeFor(actor: any, seconds: number): Promise<void> {
  if (!actor?.isOwner && !game.user?.isGM) return;
  const next = rechargedReserves(actor, seconds);
  if (next) await actor.update({ "system.session.reserves": next });
}

/**
 * A rest recharges reserves through the same minutes as it recovers FP
 * ("if you do rest, you recover FP at the same time", p. 326). Returns the
 * points each reserve gained, for the rest's card.
 */
export async function rechargeForRest(actor: any, seconds: number): Promise<Array<{ origin: string; gained: number; value: number; max: number }>> {
  if (!actor?.isOwner && !game.user?.isGM) return [];
  const used = usedOf(actor);
  const next = rechargedReserves(actor, seconds);
  if (!next) return [];
  await actor.update({ "system.session.reserves": next });
  return reservesOf(actor)
    .map((r) => {
      const gained = Math.max(0, (used[r.key]?.spent ?? 0) - (next[r.key]?.spent ?? 0));
      return { origin: r.origin, gained, value: reserveValue(r.max, next[r.key]?.spent ?? 0), max: r.max };
    })
    .filter((r) => r.gained > 0);
}

/** Registers the world-time hook that recharges every reserve as the clock moves. */
export function registerReserveHooks(): void {
  Hooks.on("updateWorldTime", (_worldTime: number, delta: number) => {
    if (!game.user?.isGM) return;
    const seconds = Number(delta) || 0;
    if (seconds <= 0) return;
    for (const actor of everyActor()) void rechargeFor(actor, seconds);
  });
}

export { reserveValue };
