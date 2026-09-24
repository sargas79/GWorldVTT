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
import {
  fatigueRecovered,
  firstAidAt,
  firstAidRecovery,
  naturalRecovery,
  regeneratedHp,
  regenerationRate,
  wakingFrom,
} from "../rules/recovery.js";
import { resolveSuccess, type SuccessRollResult } from "../rules/success.js";
import { afterSuccessRoll, successRollModifiers } from "./procedure-extensions.js";
import { attributeOf, healthRollScore } from "./attributes.js";
import { setCondition, syncHealthConditions } from "./conditions.js";
import { refuseWhileHeld } from "./knockdown.js";
import {
  ANESTHESIA_TL,
  RESUSCITATION_MINUTES,
  careBonus,
  competentCare,
  cureHitPoints,
  cureResult,
  resuscitationModifier,
  risksInfection,
  surgeryEquipment,
  surgeryModifier,
  type ResuscitationCause,
  canResuscitate,
} from "../rules/medicine.js";
import { skillLevelOf } from "./skill-level.js";

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

const R = (key: string) => game.i18n.localize(`GWORLD.Recovery.${key}`);
const F = (key: string, data: Record<string, unknown>) =>
  game.i18n.format(`GWORLD.Recovery.${key}`, data);

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
 * Heals by Regeneration for a span of time (Characters p. 80).
 *
 * No roll: a regenerator heals at a rate, and the only question is how much
 * time has passed. Whole points only, so a Slow regenerator asked about eleven
 * hours has nothing back yet.
 */
export async function regenerate(options: { actor: any; seconds: number }): Promise<number> {
  const { actor, seconds } = options;
  if (!mayChange(actor)) return 0;

  const rate = regenerationRate(Number(actor.system?.derived?.traitEffects?.regeneration ?? 0));
  if (!rate) return 0;

  const hp = actor.system?.hp ?? { value: 0, max: 0 };
  const previous = Number(hp.value) || 0;
  const max = Number(hp.max) || 0;
  const gained = Math.min(Math.max(0, max - previous), regeneratedHp(rate.key, seconds));

  if (gained > 0) await actor.update({ "system.hp.value": previous + gained });

  await post(actor, {
    kind: game.i18n.localize("GWORLD.Recovery.Regeneration"),
    detail: game.i18n.format("GWORLD.Recovery.RegenerationDetail", {
      rate: game.i18n.localize(`GWORLD.Recovery.Rate.${rate.key}`),
      seconds,
    }),
    full: previous >= max,
    gained,
    pool: "HP",
    previous,
    now: previous + gained,
    max,
  });
  return gained;
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

  // Fit and Very Fit "recover FP at twice the normal rate" (Characters p. 55).
  const wanted = fatigueRecovered({
    minutes,
    meal,
    multiplier: Number(actor.system?.derived?.traitEffects?.fatigueRecoveryMultiplier) || 1,
  });
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
  const ht = healthRollScore(actor);

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
  /** A skill that stands in for the healer's, as a device treating on its own does (since 1.60.0). */
  skill?: number;
  /** The TL the treatment is given at, where it isn't the healer's (since 1.60.0). */
  techLevel?: number;
  /** Who treats, as the card names them, where it isn't the healer (since 1.60.0). */
  label?: string;
}): Promise<number> {
  const { healer, patient, modifier } = options;
  if (!mayChange(patient)) return 0;

  const skill = typeof options.skill === "number" ? options.skill : numberOr(healer?.system?.derived?.recovery?.firstAid, 6);
  const techLevel = typeof options.techLevel === "number" ? options.techLevel : numberOr(healer?.system?.tl, 3);
  const entry = firstAidAt(techLevel);

  const hp = patient.system?.hp ?? { value: 0, max: 0 };
  const current = Number(hp.value) || 0;
  const max = Number(hp.max) || 0;

  // What the patient's conditions and the modules add to the roll (API 1.36.0).
  const added = successRollModifiers({
    actor: healer, label: game.i18n.localize("GWORLD.Recovery.FirstAid"), kind: "skill", skill: "First Aid",
    base: skill, tags: ["firstAid"], modifiers: [], opponent: patient,
  }).reduce((sum, line) => sum + line.value, 0);
  const target = skill + modifier + added;

  const check = new Roll("3d6");
  await check.evaluate();
  const outcome = resolveSuccess(check.total, target, dieResults(check));

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
    detail: (options.label ? `${options.label}: ` : "") + game.i18n.format("GWORLD.Recovery.FirstAidDetail", {
      patient: String(patient.name ?? ""),
      minutes: entry.minutes,
      tl: techLevel,
    }),
    target,
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
  // Out for a set time first -- a current still flowing, and the minutes after
  // it (p. 432) -- with no roll until the hold ends (since API 1.89.0).
  if (!refuseWhileHeld(actor, "unconscious")) return false;

  const hp = actor?.system?.hp ?? { value: 0, max: 0 };
  const waking = wakingFrom(Number(hp.value) || 0, Number(hp.max) || 0);
  const ht = healthRollScore(actor);

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

/**
 * A physician's rounds (Campaigns p. 424).
 *
 * "The healer may also make a Physician roll to cure the patient... On a
 * success, the patient recovers 1 HP; on a critical success, he recovers 2 HP.
 * This is in addition to natural healing. However, a critical failure costs
 * the patient 1 HP!"
 */
export async function attendPatient(options: {
  healer: any;
  patient: any;
  modifier: number;
  /** A Physician skill that stands in for the healer's (since 1.60.0). */
  skill?: number;
  /** Who attends, as the card names them (since 1.60.0). */
  label?: string;
}): Promise<void> {
  const { healer, patient } = options;
  if (!mayChange(patient)) return;

  const skill = typeof options.skill === "number" ? options.skill : (skillLevelOf(healer, "Physician") ?? attributeOf(healer, "IQ") - 5);
  // What the modules add: care, gear, a medical bed (API 1.60.0, tagged "physician").
  const added = successRollModifiers({
    actor: healer, label: R("Attend"), kind: "skill", skill: "Physician",
    base: skill, tags: ["physician"], modifiers: [], opponent: patient,
  }).reduce((sum, line) => sum + line.value, 0);
  const roll = new Roll("3d6");
  await roll.evaluate();
  const outcome = resolveSuccess(roll.total, skill + options.modifier + added, dieResults(roll));
  const result = cureResult(outcome);
  const moved = cureHitPoints(result);

  const hp = patient.system?.hp ?? { value: 0, max: 0 };
  const previous = Number(hp.value) || 0;
  const max = Number(hp.max) || 0;
  const now = Math.min(max, previous + moved);
  if (moved !== 0) await patient.update({ "system.hp.value": now });

  await post(patient, {
    kind: R("Attend"),
    detail: F("AttendBy", { healer: options.label ?? String(healer?.name ?? ""), skill }),
    target: skill + options.modifier + added,
    dice: dieResults(roll),
    roll: roll.total,
    lines: [
      R(`Cure.${result}`),
      ...(moved !== 0 ? [F("CureHp", { hp: Math.abs(moved), previous, now })] : []),
      // "Anyone under the care of a competent physician gets +1 on all rolls
      // for natural recovery" -- which is true whatever this roll did.
      ...(competentCare(skill) ? [F("CareBonus", { bonus: careBonus(skill) })] : []),
    ],
    good: moved > 0,
    bad: moved < 0,
    rolls: [roll],
  });
}

/**
 * An operation (Campaigns p. 424).
 *
 * "Surgery can physically repair damage to the body, but it's risky at low TLs
 * - especially prior to the invention of anesthesia and blood typing." What
 * the roll comes to is mostly the tools and the century.
 */
export async function operate(options: {
  surgeon: any;
  patient: any;
  anesthetic: boolean;
  repairingCrippled: boolean;
  equipmentQuality: number;
  modifier: number;
  /** A Surgery skill and TL that stand in for the surgeon's (since 1.60.0). */
  skill?: number;
  techLevel?: number;
  /** Who operates, as the card names them (since 1.60.0). */
  label?: string;
}): Promise<(SuccessRollResult & { target: number; techLevel: number }) | null> {
  const { surgeon, patient } = options;
  if (!mayChange(patient)) return null;

  const skill = typeof options.skill === "number" ? options.skill : (skillLevelOf(surgeon, "Surgery") ?? attributeOf(surgeon, "IQ") - 5);
  const techLevel = typeof options.techLevel === "number" ? options.techLevel : (Number(surgeon?.system?.tl) || 3);
  // What the modules add (API 1.60.0, tagged "surgery").
  const added = successRollModifiers({
    actor: surgeon, label: R("Surgery"), kind: "skill", skill: "Surgery",
    base: skill, tags: ["surgery"], modifiers: [], opponent: patient,
  }).reduce((sum, line) => sum + line.value, 0);
  const situation = surgeryModifier({
    techLevel,
    equipmentQuality: options.equipmentQuality,
    anesthetic: options.anesthetic,
    repairingCrippled: options.repairingCrippled,
  });

  const roll = new Roll("3d6");
  await roll.evaluate();
  const target = skill + situation + options.modifier + added;
  const outcome = resolveSuccess(roll.total, target, dieResults(roll));

  const lines = [
    F("SurgeryTools", { tl: techLevel, modifier: surgeryEquipment(techLevel) }),
    ...(options.anesthetic || techLevel < ANESTHESIA_TL ? [] : [R("NoAnesthetic")]),
    ...(options.repairingCrippled ? [R("RepairingCrippled")] : []),
    R(outcome.success ? "SurgeryWorked" : "SurgeryFailed"),
    // "On a failure, the patient needs 1d months to recover before another
    // attempt is possible."
    ...(!outcome.success && options.repairingCrippled ? [R("SurgeryWait")] : []),
    // "Before TL5... antiseptic practice is poor. Check for infection after
    // any surgery."
    ...(risksInfection(techLevel) ? [R("SurgeryInfection")] : []),
  ];

  await post(patient, {
    kind: R("Surgery"),
    detail: F("SurgeryBy", { surgeon: options.label ?? String(surgeon?.name ?? "") }),
    target,
    dice: dieResults(roll),
    roll: roll.total,
    lines,
    good: outcome.success,
    bad: !outcome.success,
    rolls: [roll],
  });

  // And the modules hear how it went (since API 1.112.0), as they do for any
  // success roll: whether it worked, by how much, and whether it was critical.
  afterSuccessRoll({ actor: surgeon, label: R("Surgery"), kind: "skill", skill: "Surgery", tags: ["surgery"], outcome, opponent: patient });
  return { ...outcome, target, techLevel };
}

/**
 * A minute on a drowned man's chest (Campaigns p. 425).
 *
 * "Reviving a drowning, asphyxiation, or heart attack victim requires
 * resuscitation... Each attempt takes one minute. Repeated attempts are
 * possible, but there is almost always a time limit."
 */
export async function resuscitate(options: {
  healer: any;
  patient: any;
  cause: ResuscitationCause;
  cpr: boolean;
  modifier: number;
  /** A skill that stands in for the healer's, as a device reviving on its own does (since API 1.77.0). */
  skill?: number;
  /** Which skill the stand-in is: Physician, the default, or First Aid at its penalty (since API 1.77.0). */
  skillKind?: "physician" | "firstAid";
  /** The TL of the skill, where it isn't the healer's (since API 1.77.0). */
  techLevel?: number;
  /** Who works on the patient, as the card names them, where it isn't the healer (since API 1.77.0). */
  label?: string;
}): Promise<void> {
  const { healer, patient } = options;
  if (!mayChange(patient)) return;
  const who = options.label ?? String(healer?.name ?? "");

  // "Make a successful Physician/TL7+ roll - or a First Aid/TL7+ roll at -4"
  // (p. 425). A healer whose skill is of an earlier TL has no resuscitation to
  // offer, however good at it they are.
  const healerTl = typeof options.techLevel === "number"
    ? options.techLevel
    : Number.parseInt(String(healer?.system?.tl ?? ""), 10) || 0;
  if (!canResuscitate(healerTl)) {
    await post(patient, {
      kind: R("Resuscitate"),
      detail: F("ResuscitateBy", { healer: who, cause: R(`Cause.${options.cause}`) }),
      lines: [F("ResuscitateNeedsTl", { tl: healerTl })],
    });
    return;
  }

  // A stand-in skill is a learned one, never a default.
  const standIn = typeof options.skill === "number";
  const physician = standIn ? null : skillLevelOf(healer, "Physician");
  const firstAid = standIn ? null : skillLevelOf(healer, "First Aid");
  const usingPhysician = standIn
    ? options.skillKind !== "firstAid"
    : physician !== null && (firstAid === null || physician >= firstAid);
  const skill = standIn
    ? (options.skill as number)
    : usingPhysician
      ? (physician ?? 0)
      : (firstAid ?? attributeOf(healer, "IQ") - 4);

  const situation = resuscitationModifier({
    skill: usingPhysician ? "physician" : "firstAid",
    cause: options.cause,
    cpr: options.cpr,
    byDefault: !standIn && !usingPhysician && firstAid === null,
  });

  // What the modules add: a defibrillator, a resuscitator (API 1.76.0,
  // tagged "resuscitation" and the cause).
  const added = successRollModifiers({
    actor: healer, label: R("Resuscitate"), kind: "skill", skill: usingPhysician ? "Physician" : "First Aid",
    base: skill, tags: ["resuscitation", options.cause], modifiers: [], opponent: patient,
  }).reduce((sum, line) => sum + line.value, 0);

  const roll = new Roll("3d6");
  await roll.evaluate();
  const target = skill + situation + options.modifier + added;
  const outcome = resolveSuccess(roll.total, target, dieResults(roll));

  if (outcome.success) {
    await setCondition(patient, "unconscious", false);
    await setCondition(patient, "heartAttack", false);
  }

  await post(patient, {
    kind: R("Resuscitate"),
    detail: F("ResuscitateBy", {
      healer: who,
      cause: R(`Cause.${options.cause}`),
    }),
    target,
    dice: dieResults(roll),
    roll: roll.total,
    lines: [
      R(outcome.success ? "Revived" : "StillGone"),
      F("ResuscitateAgain", { minutes: RESUSCITATION_MINUTES }),
    ],
    good: outcome.success,
    bad: !outcome.success,
    rolls: [roll],
  });
}
