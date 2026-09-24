/**
 * Taking fatigue off a sheet (GURPS Basic Set: Campaigns p. 426).
 *
 * Every way of losing FP goes through here, because none of them stops at zero.
 * "Thus, fatigue from starvation, dehydration, etc. will eventually kill you --
 * and you can work yourself to death": past 0 FP each further point of fatigue
 * is also a point of injury, and at -1xFP the character is unconscious and the
 * whole cost comes out of hit points.
 *
 * Writing that in one place is the point. Four modules spend fatigue -- heat,
 * hunger, extra effort, suffocation -- and each of them getting the chart right
 * separately is four chances to get it wrong.
 */

import { setCondition, syncHealthConditions } from "./conditions.js";
import { spendFatigue, type FatigueStatus } from "../rules/fatigue.js";
import { afterFatigue, fatigueCost } from "./procedure-extensions.js";

/** What a loss of fatigue cost, once the chart was applied. */
export interface FatigueApplied {
  fpLost: number;
  hpLost: number;
  /** What the `gworld.fatigueCost` listeners said changed the cost (since 1.76.0). */
  sources: string[];
  fp: { previous: number; now: number; max: number };
  hp: { previous: number; now: number; max: number };
  status: FatigueStatus;
}

/**
 * Takes fatigue off an actor, and hit points where the chart says so.
 *
 * The caller is trusted to have checked that this user may change the actor:
 * every caller has already said so in a way its own user can act on.
 */
export async function applyFatigue(
  actor: any,
  lost: number,
  options: {
    /**
     * False for FP spent on a spell or a psi ability: Fit and Very Fit
     * "apply only to FP lost to exertion, heat, etc." (Characters p. 55).
     */
    exertion?: boolean;
    /**
     * What the fatigue is for, which the `gworld.fatigueCost` listeners are
     * told before it is charged (since 1.76.0). Every system caller names one;
     * without one the cost is charged as given, which is how a caller that
     * already asked the listeners avoids asking twice.
     */
    reason?: string;
    /** What else the caller knows, passed to the listeners as `details`. */
    details?: Record<string, unknown>;
    /**
     * Where the caller has already asked the `gworld.fatigueCost` listeners
     * (extra effort weighs the cost against the FP left first), what they
     * said: the cost is charged as given, and `reason` still reaches the
     * `gworld.afterFatigue` listeners.
     */
    costed?: { sources: string[] };
  } = {},
): Promise<FatigueApplied> {
  const fp = actor?.system?.fp ?? { value: 0, max: 0 };
  const hp = actor?.system?.hp ?? { value: 0, max: 0 };
  const fpBefore = Number(fp.value) || 0;
  const hpBefore = Number(hp.value) || 0;
  const fpMax = Number(fp.max) || 0;
  const hpMax = Number(hp.max) || 0;

  // A module may change what this costs: a surcharge for the heat, gear that
  // spares the wearer (API 1.76.0).
  const costed = options.costed
    ? { fp: lost, sources: [...options.costed.sources] }
    : options.reason && lost > 0
    ? fatigueCost({ actor, fp: lost, reason: options.reason, exertion: options.exertion !== false, ...(options.details ? { details: options.details } : {}) })
    : { fp: lost, sources: [] as string[] };

  const spent = spendFatigue({
    currentFp: fpBefore,
    maxFp: fpMax,
    lost: costed.fp,
    // Very Fit: "you lose FP at only half the normal rate" (Characters p. 55).
    halved:
      options.exertion !== false &&
      actor?.system?.derived?.traitEffects?.fatigueLossHalved === true,
  });

  const changes: Record<string, number> = {};
  if (spent.fpLost !== 0) changes["system.fp.value"] = spent.fp;
  if (spent.hpLost > 0) changes["system.hp.value"] = hpBefore - spent.hpLost;

  if (Object.keys(changes).length > 0) {
    await actor.update(changes);
    // Injury from fatigue is injury: it makes somebody reeling and it kills
    // them, on the same thresholds as a blow would.
    if (spent.hpLost > 0) await syncHealthConditions(actor);
    // "You fall unconscious... you awaken when you reach positive FP." Only the
    // falling asleep is done here: waking is somebody else's rule, and clearing
    // the condition on the way past would wake a character knocked out by a
    // blow to the head as soon as they caught their breath.
    if (spent.status === "unconscious") await setCondition(actor, "unconscious", true);
  }

  const applied: FatigueApplied = {
    fpLost: spent.fpLost,
    hpLost: spent.hpLost,
    sources: costed.sources,
    fp: { previous: fpBefore, now: spent.fp, max: fpMax },
    hp: { previous: hpBefore, now: hpBefore - spent.hpLost, max: hpMax },
    status: spent.status,
  };

  // What it came to, for a rule that follows from the FP actually lost
  // rather than the price asked (API 1.138.0). Only fatigue the listeners
  // were asked about, and only where there was something to pay.
  if (options.reason && costed.fp > 0) {
    afterFatigue({
      actor,
      reason: options.reason,
      details: options.details ?? {},
      exertion: options.exertion !== false,
      fpLost: applied.fpLost,
      hpLost: applied.hpLost,
      fp: applied.fp,
      hp: applied.hp,
      sources: applied.sources,
    });
  }
  return applied;
}

/**
 * Charges a module's fatigue the way the system charges its own (Campaigns
 * p. 426; since API 1.109.0): `gworld.fatigueCost` first, told `reason`
 * (`module` where none is given) and `details`, then Very Fit's halving for
 * exertion, then the chart -- past 0 FP each point is a point of injury too,
 * and at -1xFP the character falls unconscious -- and since 1.138.0
 * `gworld.afterFatigue` with what it came to. Null for a user who can't
 * change the actor or an amount that isn't a positive number.
 */
export async function spendFatigueFor(
  actor: any,
  fp: number,
  options: { reason?: string; details?: Record<string, unknown>; exertion?: boolean } = {},
): Promise<FatigueApplied | null> {
  const amount = Math.floor(Number(fp));
  if (!actor?.isOwner || !Number.isFinite(amount) || amount <= 0) return null;
  return applyFatigue(actor, amount, {
    reason: String(options.reason ?? "").trim() || "module",
    exertion: options.exertion !== false,
    ...(options.details ? { details: options.details } : {}),
  });
}

/** What `restoreFatigue` gave back. */
export interface FatigueRestored {
  /** FP before and after, and the most there are. */
  from: number;
  to: number;
  max: number;
  reason: string;
}

/**
 * Gives an actor FP back outside rest (Campaigns p. 427; since API 1.104.0):
 * a drug, a meal of the module's, energy lent. Never above the FP the actor
 * has. Waking someone who reached positive FP is left to the rules that do it,
 * as losing FP leaves it. Null for a user who can't change the actor or an
 * amount that isn't a positive number.
 */
export async function restoreFatigue(actor: any, fp: number, options: { reason?: string } = {}): Promise<FatigueRestored | null> {
  const amount = Math.floor(Number(fp));
  if (!actor?.isOwner || !Number.isFinite(amount) || amount <= 0) return null;
  const current = Number(actor.system?.fp?.value) || 0;
  const max = Number(actor.system?.fp?.max) || 0;
  const to = current >= max ? current : Math.min(max, current + amount);
  if (to !== current) await actor.update({ "system.fp.value": to });
  return { from: current, to, max, reason: String(options.reason ?? "") };
}
