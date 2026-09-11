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

/** Takes fatigue off a sheet, and hit points where the rule costs those too. */
async function spend(actor: any, fpLost: number, hpLost: number): Promise<{
  fp: { previous: number; now: number; max: number };
  hp: { previous: number; now: number; max: number };
}> {
  const fp = actor.system?.fp ?? { value: 0, max: 0 };
  const hp = actor.system?.hp ?? { value: 0, max: 0 };
  const fpBefore = Number(fp.value) || 0;
  const hpBefore = Number(hp.value) || 0;

  const changes: Record<string, number> = {};
  if (fpLost > 0) changes["system.fp.value"] = fpBefore - fpLost;
  if (hpLost > 0) changes["system.hp.value"] = hpBefore - hpLost;
  if (Object.keys(changes).length > 0) {
    await actor.update(changes);
    // Fatigue does not make anybody reeling, but hit points do, and going
    // hungry long enough is a way to reach zero without ever being hit.
    if (hpLost > 0) await syncHealthConditions(actor);
  }

  return {
    fp: { previous: fpBefore, now: fpBefore - fpLost, max: Number(fp.max) || 0 },
    hp: { previous: hpBefore, now: hpBefore - hpLost, max: Number(hp.max) || 0 },
  };
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

  const ht = Number(actor.system?.attributes?.HT) || 10;
  const encumbrance = Number(actor.system?.derived?.encumbrance?.level) || 0;

  const conditions = heat
    ? heatModifier({ encumbranceLevel: encumbrance, temperatureF: options.temperatureF })
    : coldModifier({
        clothing: options.clothing,
        wetClothes: options.wetClothes,
        temperatureF: options.temperatureF,
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

  const pools = await spend(actor, cost.fpLost, 0);

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
    lost: cost.fpLost,
    heatStroke: cost.heatStroke,
    // "You lose an extra 1 FP whenever you lose FP to exertion or dehydration"
    // -- which is not this roll, so it is reported rather than charged.
    surcharge: heat ? heatSurcharge(options.temperatureF) : 0,
    fp: pools.fp,
    rolls: stroke ? [roll, stroke] : [roll],
  });

  return cost.fpLost;
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

  const pools = await spend(actor, fpLost, thirst.hpLost);

  await post(actor, {
    kind: game.i18n.localize("GWORLD.Weather.Deprivation"),
    detail: game.i18n.format("GWORLD.Weather.Rations", {
      meals: options.mealsMissed,
      quarts: options.quartsDrunk,
      needed: waterNeeded(climate),
    }),
    hunger,
    thirst: thirst.fpLost,
    lost: fpLost,
    hpLost: thirst.hpLost,
    parched: thirst.hpLost > 0,
    fp: pools.fp,
    hp: pools.hp,
  });

  return fpLost;
}
