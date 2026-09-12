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

/** What a loss of fatigue cost, once the chart was applied. */
export interface FatigueApplied {
  fpLost: number;
  hpLost: number;
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
export async function applyFatigue(actor: any, lost: number): Promise<FatigueApplied> {
  const fp = actor?.system?.fp ?? { value: 0, max: 0 };
  const hp = actor?.system?.hp ?? { value: 0, max: 0 };
  const fpBefore = Number(fp.value) || 0;
  const hpBefore = Number(hp.value) || 0;
  const fpMax = Number(fp.max) || 0;
  const hpMax = Number(hp.max) || 0;

  const spent = spendFatigue({
    currentFp: fpBefore,
    maxFp: fpMax,
    lost,
    // Very Fit: "you lose FP at only half the normal rate" (Characters p. 55).
    halved: actor?.system?.derived?.traitEffects?.fatigueLossHalved === true,
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

  return {
    fpLost: spent.fpLost,
    hpLost: spent.hpLost,
    fp: { previous: fpBefore, now: spent.fp, max: fpMax },
    hp: { previous: hpBefore, now: hpBefore - spent.hpLost, max: hpMax },
    status: spent.status,
  };
}
