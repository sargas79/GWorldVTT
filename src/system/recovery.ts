/**
 * Mending what a fight cost (GURPS Basic Set: Campaigns pp. 423-427).
 *
 * Everything here writes to a sheet, which is why it lives on this side of the
 * line: the arithmetic is in `src/rules/recovery.ts` and this is the part that
 * rolls the dice, changes the numbers and says what happened.
 *
 * Each of these caps at the character's maximum. Healing past full is not a
 * rule anywhere in GURPS, and a bandage that took someone to 13 of 10 HP would
 * be a bug reported as a rules question.
 */

import { SYSTEM_ID } from "./constants.js";
import { syncHealthConditions } from "./conditions.js";
import {
  fatigueRecovered,
  firstAidAt,
  firstAidRecovery,
  naturalRecovery,
  wakingFrom,
} from "../rules/recovery.js";
import { resolveSuccess } from "../rules/success.js";
import { attributeOf } from "./attributes.js";

const RECOVERY_TEMPLATE = `systems/${SYSTEM_ID}/templates/chat/recovery.hbs`;

/**
 * A number off a sheet, or a fallback when there is none.
 *
 * `|| fallback` will not do: a First Aid of 0 is a real score for someone with
 * IQ 4, and would be silently replaced by it.
 */
function numberOr(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
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

/** The individual d6 faces from an evaluated Roll. */
function dieResults(roll: any): number[] {
  return (roll.dice?.[0]?.results ?? []).map((r: { result: number }) => r.result);
}

/** Posts one recovery card. */
async function post(actor: any, context: Record<string, unknown>): Promise<void> {
  const content = await foundry.applications.handlebars.renderTemplate(RECOVERY_TEMPLATE, {
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
 * Rests for a while and gets some fatigue back (p. 427).
 *
 * No roll: resting quietly works, and the only question is for how long.
 */
export async function restForFatigue(options: {
  actor: any;
  minutes: number;
  meal: boolean;
}): Promise<number> {
  const { actor, minutes, meal } = options;
  if (!mayChange(actor)) return 0;

  const fp = actor.system?.fp ?? { value: 0, max: 0 };
  const current = Number(fp.value) || 0;
  const max = Number(fp.max) || 0;

  const wanted = fatigueRecovered({ minutes, meal });
  const gained = Math.max(0, Math.min(wanted, max - current));
  if (gained > 0) await actor.update({ "system.fp.value": current + gained });

  await post(actor, {
    kind: game.i18n.localize("GWORLD.Recovery.Rest"),
    detail: meal
      ? game.i18n.format("GWORLD.Recovery.RestedFed", { minutes })
      : game.i18n.format("GWORLD.Recovery.Rested", { minutes }),
    gained,
    pool: "FP",
    previous: current,
    now: current + gained,
    max,
    // Someone already at full rested for nothing, which is worth saying rather
    // than posting a card that reports a gain of zero and no reason.
    full: gained === 0 && current >= max,
  });

  return gained;
}

/**
 * A day of rest and decent food (p. 424).
 *
 * "At the end of each day of rest and decent food, make a HT roll. On a
 * success, you recover 1 HP." The GM's bonus or penalty for conditions is asked
 * for rather than assumed, because only they know what the conditions were.
 */
export async function restForADay(options: {
  actor: any;
  modifier: number;
}): Promise<number> {
  const { actor, modifier } = options;
  if (!mayChange(actor)) return 0;

  const hp = actor.system?.hp ?? { value: 0, max: 0 };
  const current = Number(hp.value) || 0;
  const max = Number(hp.max) || 0;
  const ht = attributeOf(actor, "HT");

  const roll = new Roll("3d6");
  await roll.evaluate();
  const outcome = resolveSuccess(roll.total, ht + modifier, dieResults(roll));

  const wanted = outcome.success ? naturalRecovery(max) : 0;
  const gained = Math.max(0, Math.min(wanted, max - current));
  if (gained > 0) {
    await actor.update({ "system.hp.value": current + gained });
    // Reeling and dead are what the hit point total means, so they follow it
    // back up as readily as they followed it down.
    await syncHealthConditions(actor);
  }

  await post(actor, {
    kind: game.i18n.localize("GWORLD.Recovery.Daily"),
    detail: game.i18n.localize("GWORLD.Recovery.DailyDetail"),
    target: ht + modifier,
    dice: dieResults(roll),
    roll: roll.total,
    success: outcome.success,
    gained,
    pool: "HP",
    previous: current,
    now: current + gained,
    max,
    full: gained === 0 && outcome.success && current >= max,
    rolls: [roll],
  });

  return gained;
}

/**
 * Treats somebody's wounds (p. 424).
 *
 * The healer rolls their own First Aid at their own tech level, and the patient
 * is the one who gets better -- so this needs both, and writes to the one who
 * did not roll.
 */
export async function applyFirstAid(options: {
  healer: any;
  patient: any;
  modifier: number;
}): Promise<number> {
  const { healer, patient, modifier } = options;
  if (!mayChange(patient)) return 0;

  const skill = numberOr(healer?.system?.derived?.recovery?.firstAid, 6);
  const techLevel = numberOr(healer?.system?.tl, 3);
  const entry = firstAidAt(techLevel);

  const hp = patient.system?.hp ?? { value: 0, max: 0 };
  const current = Number(hp.value) || 0;
  const max = Number(hp.max) || 0;

  const check = new Roll("3d6");
  await check.evaluate();
  const outcome = resolveSuccess(check.total, skill + modifier, dieResults(check));

  // The table's dice are only rolled when there is something to roll them for:
  // a failure restores nothing, and a critical success takes the maximum.
  const healed = outcome.success && !outcome.criticalSuccess
    ? new Roll(`${entry.restored.dice}d6 ${entry.restored.adds >= 0 ? "+" : "-"} ${Math.abs(entry.restored.adds)}`)
    : null;
  if (healed) await healed.evaluate();

  const restored = firstAidRecovery({
    techLevel,
    outcome,
    rolled: healed?.total ?? 0,
    maxHp: max,
  });

  // A critical failure costs the patient, so this is not always a gain -- and
  // it is capped upwards at their maximum but never floored at their current,
  // because losing hit points is exactly what the rule says happens.
  const change = restored >= 0 ? Math.min(restored, Math.max(0, max - current)) : restored;
  if (change !== 0) {
    await patient.update({ "system.hp.value": current + change });
    await syncHealthConditions(patient);
  }

  await post(healer, {
    kind: game.i18n.localize("GWORLD.Recovery.FirstAid"),
    detail: game.i18n.format("GWORLD.Recovery.FirstAidDetail", {
      patient: String(patient.name ?? ""),
      minutes: entry.minutes,
      tl: techLevel,
    }),
    target: skill + modifier,
    dice: dieResults(check),
    roll: check.total,
    success: outcome.success,
    criticalSuccess: outcome.criticalSuccess,
    criticalFailure: outcome.criticalFailure,
    gained: change,
    pool: "HP",
    previous: current,
    now: current + change,
    max,
    full: change === 0 && outcome.success && current >= max,
    rolls: healed ? [check, healed] : [check],
  });

  return change;
}

/**
 * Comes round again (p. 423).
 *
 * Says what it takes -- a quarter of an hour, an hourly HT roll, or the far
 * worse business at -1xHP -- and rolls it where a roll is what it takes.
 */
export async function tryToWake(options: { actor: any }): Promise<boolean> {
  const { actor } = options;

  const hp = actor?.system?.hp ?? { value: 0, max: 0 };
  const waking = wakingFrom(Number(hp.value) || 0, Number(hp.max) || 0);
  const ht = attributeOf(actor, "HT");

  const roll = waking.needsRoll ? new Roll("3d6") : null;
  if (roll) await roll.evaluate();
  const outcome = roll ? resolveSuccess(roll.total, ht, dieResults(roll)) : null;

  await post(actor, {
    kind: game.i18n.localize("GWORLD.Recovery.Waking"),
    detail: game.i18n.localize(`GWORLD.Recovery.Waking_${waking.kind}`),
    ...(roll
      ? {
          target: ht,
          dice: dieResults(roll),
          roll: roll.total,
          success: outcome!.success,
          rolls: [roll],
        }
      : {}),
    // Failing the roll at -1xHP is not just "still asleep": from there it is a
    // HT roll every twelve hours against dying.
    warn: waking.kind === "mortal" && outcome?.success === false
      ? game.i18n.localize("GWORLD.Recovery.Mortal")
      : "",
  });

  return outcome?.success ?? true;
}
