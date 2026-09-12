/**
 * Weather, hunger and thirst on a sheet (GURPS Basic Set: Campaigns pp. 426-435).
 *
 * The arithmetic is in `src/rules/environment.ts`; this is the part that rolls
 * against the weather and writes what it cost.
 *
 * Both halves are advanced a span at a time rather than run on a clock -- one
 * roll per half hour of heat, one card per day of going short of food and
 * water -- because how much time passed between one scene and the next is the
 * GM's to say. That also keeps the two shapes apart: the weather is a roll that
 * can be made, and going hungry is not.
 */

import { SYSTEM_ID } from "./constants.js";
import { syncHealthConditions } from "./conditions.js";
import { applyFatigue } from "./fatigue.js";
import { healthRollScore } from "./attributes.js";
import {
  coldInterval,
  coldModifier,
  exposureResult,
  heatModifier,
  heatSurcharge,
  waterNeeded,
  starvationFatigue,
  dehydrationForDay,
  HEAT_INTERVAL_MINUTES,
  type Climate,
  type ColdClothing,
} from "../rules/environment.js";
import { resolveSuccess } from "../rules/success.js";

const EXPOSURE_TEMPLATE = `systems/${SYSTEM_ID}/templates/chat/exposure.hbs`;

/** The individual d6 faces from an evaluated Roll. */
function dieResults(roll: any): number[] {
  return (roll.dice?.[0]?.results ?? []).map((r: { result: number }) => r.result);
}

/**
 * Whether this user may change the sheet they are about to change.
 *
 * Foundry refuses the update anyway, but it refuses it with a permission error
 * in the console rather than something a player can act on.
 */
function mayChange(actor: any): boolean {
  if (actor?.isOwner) return true;
  ui.notifications?.warn(
    game.i18n.format("GWORLD.Chat.CannotApply", { names: String(actor?.name ?? "") }),
  );
  return false;
}

/** Posts one exposure card. */
async function post(actor: any, context: Record<string, unknown>): Promise<void> {
  const content = await foundry.applications.handlebars.renderTemplate(EXPOSURE_TEMPLATE, {
    name: String(actor?.name ?? ""),
    ...context,
  });

  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    content,
    rolls: (context.rolls as any[]) ?? [],
  });
}

/**
 * One roll against the weather (pp. 430, 434).
 *
 * "Roll vs. HT" every half hour in the heat, and rather more often than that in
 * a wind. The roll itself is HT, or HT-based Survival where that is better,
 * which is the sheet's to know; the modifier comes off what the character is
 * wearing, carrying and standing in.
 */
export async function rollExposure(options: {
  actor: any;
  heat: boolean;
  temperatureF: number;
  clothing: ColdClothing;
  wetClothes: boolean;
  windMph: number;
  /** Anything the GM wants to add that the sheet cannot know. */
  modifier: number;
}): Promise<number> {
  const { actor, heat } = options;
  if (!mayChange(actor)) return 0;

  const ht = healthRollScore(actor);
  const encumbrance = Number(actor.system?.derived?.encumbrance?.level) || 0;
  // Temperature Tolerance widens the comfort zone (Characters p. 93).
  const zone = actor.system?.derived?.traitEffects?.temperatureTolerance ?? { coldF: 0, heatF: 0 };

  const conditions = heat
    ? heatModifier({
        encumbranceLevel: encumbrance,
        temperatureF: options.temperatureF,
        toleranceF: Number(zone.heatF) || 0,
      })
    : coldModifier({
        clothing: options.clothing,
        wetClothes: options.wetClothes,
        temperatureF: options.temperatureF,
        toleranceF: Number(zone.coldF) || 0,
      });

  const target = ht + conditions + options.modifier;

  const roll = new Roll("3d6");
  await roll.evaluate();
  const outcome = resolveSuccess(roll.total, target, dieResults(roll));

  // Heat stroke costs a die rather than a point, so the die is only rolled
  // where the rule calls for one.
  const stroke = heat && outcome.criticalFailure ? new Roll("1d6") : null;
  if (stroke) await stroke.evaluate();

  const cost = exposureResult({
    success: outcome.success,
    criticalFailure: outcome.criticalFailure,
    ...(stroke ? { strokeRoll: stroke.total } : {}),
    heat,
  });

  const pools = await applyFatigue(actor, cost.fpLost);

  await post(actor, {
    heat,
    kind: heat ? game.i18n.localize("GWORLD.Weather.Heat") : game.i18n.localize("GWORLD.Weather.Cold"),
    detail: game.i18n.format("GWORLD.Weather.Conditions", {
      degrees: options.temperatureF,
      minutes: heat ? HEAT_INTERVAL_MINUTES : coldInterval(options.windMph),
    }),
    target,
    dice: dieResults(roll),
    roll: roll.total,
    success: outcome.success,
    criticalFailure: outcome.criticalFailure,
    lost: pools.fpLost,
    heatStroke: cost.heatStroke,
    // Past 0 FP the weather starts costing hit points instead (p. 426).
    hpLost: pools.hpLost,
    hp: pools.hp,
    collapsing: pools.status === "collapsing" || pools.status === "unconscious",
    unconscious: pools.status === "unconscious",
    // "You lose an extra 1 FP whenever you lose FP to exertion or dehydration"
    // -- which is not this roll, so it is reported rather than charged.
    surcharge: heat ? heatSurcharge(options.temperatureF) : 0,
    fp: pools.fp,
    rolls: stroke ? [roll, stroke] : [roll],
  });

  return pools.fpLost;
}

/**
 * A day of too little food and water (p. 426).
 *
 * No roll: missing meals costs a point each and being short of water costs
 * three over the day, and neither is something you can be good at. What the day
 * needed depends on the climate, which is why it is asked for.
 */
export async function applyDeprivation(options: {
  actor: any;
  mealsMissed: number;
  climate: Climate;
  quartsDrunk: number;
}): Promise<number> {
  const { actor, climate } = options;
  if (!mayChange(actor)) return 0;

  const hunger = starvationFatigue(options.mealsMissed);
  const thirst = dehydrationForDay({ climate, quartsDrunk: options.quartsDrunk });
  const fpLost = hunger + thirst.fpLost;

  const pools = await applyFatigue(actor, fpLost);

  // Drinking under a quart a day costs a hit point of its own, on top of
  // anything the fatigue chart charged for going below zero.
  if (thirst.hpLost > 0) {
    await actor.update({ "system.hp.value": pools.hp.now - thirst.hpLost });
    await syncHealthConditions(actor);
  }

  await post(actor, {
    kind: game.i18n.localize("GWORLD.Weather.Deprivation"),
    detail: game.i18n.format("GWORLD.Weather.Rations", {
      meals: options.mealsMissed,
      quarts: options.quartsDrunk,
      needed: waterNeeded(climate),
    }),
    hunger,
    thirst: thirst.fpLost,
    lost: pools.fpLost,
    hpLost: pools.hpLost + thirst.hpLost,
    parched: thirst.hpLost > 0,
    fp: pools.fp,
    hp: { ...pools.hp, now: pools.hp.now - thirst.hpLost },
    collapsing: pools.status === "collapsing" || pools.status === "unconscious",
    unconscious: pools.status === "unconscious",
  });

  return pools.fpLost;
}
