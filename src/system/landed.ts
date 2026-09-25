/**
 * Where a thrown or fired attack came down (since API 1.154.0), for the
 * modules whose rules act on the landing: something that goes off on impact,
 * or leaves an area where it falls.
 *
 * The attack roll says whether it struck its one target, and so where it is
 * on a hit; a miss lands wherever the scatter roll (Campaigns p. 414) puts it,
 * which is a roll of its own, so it is told again when that roll can place it.
 */

import { scatterPoint, type Scatter } from "../rules/scatter.js";
import type { Point } from "../rules/modifier-areas.js";
import { COMBAT_HOOKS, callCombatHook } from "./combat-extensions.js";
import { centerOf, pixelsPerYard } from "./modifier-areas.js";
import { facingRadians } from "./facing-geometry.js";
import { targetedTokens } from "./targets.js";

/** What `gworld.landed` is told. */
export interface LandedContext {
  /** Who threw or fired it. */
  actor: any;
  /** The weapon it came from, and which of its modes; null where not known. */
  item: any;
  mode: { index: number; ranged: boolean; derived?: string } | null;
  /** True for a thrown weapon, false for one fired or shot; null where not known (a scatter roll). */
  thrown: boolean | null;
  /** Whether the attack roll hit its target (before any defense); false for a scatter. */
  hit: boolean;
  /** The one token targeted, as a token document, or null. */
  target: any;
  /** Where it came down, in scene pixels; null where the system doesn't know. */
  point: Point | null;
  /** For a scatter roll, how far off and which way (p. 414); null after an attack roll. */
  scatter: Scatter | null;
}

/** A token's centre, for a placeable or the `{ actor, document }` an attack sequence targets. */
function tokenPoint(token: any): Point | null {
  return centerOf(token) ?? centerOf(token?.document) ?? centerOf(token?.object);
}

/** The one token targeted, or null for none or several. */
function oneTarget(): any {
  const targets = targetedTokens();
  return targets.length === 1 ? targets[0] : null;
}

/** Tells the listeners where an attack came down, after its roll. */
export function landedAfterAttack(options: {
  actor: any;
  item: any;
  mode: LandedContext["mode"];
  thrown: boolean;
  hit: boolean;
}): LandedContext {
  const token = oneTarget();
  return callCombatHook(COMBAT_HOOKS.landed, {
    actor: options.actor,
    item: options.item ?? null,
    mode: options.mode ?? null,
    thrown: options.thrown,
    hit: options.hit,
    target: token ? (token.document ?? token) : null,
    // On a hit it is where the target is; a miss is the scatter roll's to place.
    point: options.hit && token ? tokenPoint(token) : null,
    scatter: null,
  } as LandedContext);
}

/**
 * Tells the listeners where a miss scattered to: from the one token
 * targeted, the yards rolled in the direction rolled, round from the way the
 * attacker's token faces. With no token for either, the point is null.
 */
export function landedAfterScatter(options: {
  actor: any;
  item?: any;
  mode?: LandedContext["mode"];
  scatter: Scatter;
}): LandedContext {
  const token = oneTarget();
  const aimedAt = token ? tokenPoint(token) : null;
  const attacker = options.actor?.getActiveTokens?.()?.[0] ?? null;
  const rotation = Number(attacker?.document?.rotation ?? attacker?.rotation);
  const scene = (globalThis as any).canvas?.scene ?? null;
  const point = aimedAt && attacker && Number.isFinite(rotation)
    ? scatterPoint({
        aimedAt,
        facing: facingRadians(rotation),
        direction: options.scatter.direction,
        yards: options.scatter.yards,
        pixelsPerYard: pixelsPerYard(scene),
      })
    : null;
  return callCombatHook(COMBAT_HOOKS.landed, {
    actor: options.actor,
    item: options.item ?? null,
    mode: options.mode ?? null,
    thrown: null,
    hit: false,
    target: token ? (token.document ?? token) : null,
    point,
    scatter: { ...options.scatter },
  } as LandedContext);
}
