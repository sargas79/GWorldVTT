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
import { afterSuccessRoll, firstAidRules, physicianRoundsRules, procedureRoll } from "./procedure-extensions.js";
import { stopBleeding } from "./bleeding.js";
import { crippledPartName, crippledParts, treatCrippled } from "./crippling.js";
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
import { normalizeSkillName } from "../rules/skills.js";
import { parseTechLevel, skillTechLevel, techLevelModifier } from "../rules/tech-level.js";
import { isRuleOn } from "./optional-rules.js";

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
  // A bonus held for the healer's roll counts too (API 1.144.0).
  const hooked = procedureRoll({
    actor: healer, label: game.i18n.localize("GWORLD.Recovery.FirstAid"), kind: "skill", skill: "First Aid",
    base: skill, tags: ["firstAid"], modifiers: [], opponent: patient,
  });
  const added = hooked.added.reduce((sum, line) => sum + line.value, 0);
  const target = skill + modifier + added;

  const check = new Roll("3d6");
  await check.evaluate();
  await hooked.spend();
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
 * First Aid as a whole attempt (p. 424): the sheet's button and
 * `actors.firstAid` both come here, so `gworld.firstAid` hears every attempt,
 * not only the ones made from a sheet.
 *
 * The listeners go first because they may refuse, and a refusal should come
 * before anybody is asked for a modifier. `modifier` is a number, or a
 * question to ask once they have agreed, which may be cancelled (null).
 * Returns the HP it moved: nothing for a refusal or a cancel.
 */
export async function giveFirstAid(options: {
  healer: any;
  patient: any;
  modifier: number | (() => Promise<number | null>);
  skill?: number;
  techLevel?: number;
  label?: string;
}): Promise<number> {
  const { healer, patient } = options;

  // A listener may refuse, say a bandage won't stop this bleeding (API 1.36.0),
  // or move the treatment to another tech level (API 1.109.0). A TL the caller
  // gave is where the listeners start, as the healer's own is from the sheet.
  const rules = firstAidRules(healer, patient, options.techLevel);
  if (rules.refusal) {
    ui.notifications?.warn(rules.refusal);
    return 0;
  }

  const modifier = typeof options.modifier === "function" ? await options.modifier() : options.modifier;
  if (modifier === null) return 0;

  const restored = await applyFirstAid({
    healer,
    patient,
    modifier,
    techLevel: rules.techLevel,
    ...(typeof options.skill === "number" ? { skill: options.skill } : {}),
    ...(options.label ? { label: options.label } : {}),
  });

  // "someone who is wounded but receives a successful First Aid roll ... loses
  // no HP to bleeding. A later roll will prevent further HP loss."
  if (restored > 0 && rules.stopsBleeding) await stopBleeding(patient);
  else if (restored > 0 && patient.statuses?.has?.("bleeding")) {
    ui.notifications?.info(game.i18n.format("GWORLD.Recovery.StillBleeding", { patient: String(patient.name ?? "") }));
  }
  return restored;
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
  /**
   * A number, or a question to ask once no listener has refused, which may
   * be cancelled (null), as the sheet's button asks it (since 1.142.0).
   */
  modifier: number | (() => Promise<number | null>);
  /** A Physician skill that stands in for the healer's (since 1.60.0). */
  skill?: number;
  /** The TL that skill was learned at, where it isn't the healer's (since 1.142.0). */
  techLevel?: number;
  /** Who attends, as the card names them (since 1.60.0). */
  label?: string;
}): Promise<void> {
  const { healer, patient } = options;
  if (!mayChange(patient)) return;

  const physician = physicianSkillItem(healer);
  const skill = typeof options.skill === "number" ? options.skill : (skillLevelOf(healer, "Physician") ?? attributeOf(healer, "IQ") - 5);
  // Physician is a technological skill (Characters p. 168), learned at the TL
  // the caller gives, else at the one recorded for it, else at the healer's own.
  const personal = parseTechLevel(healer?.system?.tl) ?? 3;
  const skillTl = typeof options.techLevel === "number" && Number.isFinite(options.techLevel)
    ? Math.max(0, Math.floor(options.techLevel))
    : physician
      ? skillTechLevel(String(physician.name ?? ""), physician.system?.techLevel, personal)
      : personal;

  // A listener may refuse the rounds, or move them to another tech level --
  // a doctor without the supplies of their own TL -- and add lines to the
  // card (API 1.142.0). They go first, so a refusal comes before anybody is
  // asked for a modifier.
  const rules = physicianRoundsRules(healer, patient, skillTl);
  if (rules.refusal) {
    ui.notifications?.warn(rules.refusal);
    return;
  }

  // Working at another TL than the skill's is the Tech-Level Modifiers
  // table's business (Characters p. 168), as it is for any gear: a line keyed
  // and tagged `techLevel`, which a listener may change or take out.
  const given: Array<{ key: string; label: string; value: number }> = [];
  if (rules.techLevel !== skillTl && isRuleOn("techLevelModifiers")) {
    const value = techLevelModifier({ skillTechLevel: skillTl, equipmentTechLevel: rules.techLevel, iqBased: (physician?.system?.attribute ?? "IQ") === "IQ" });
    if (value === null) {
      ui.notifications?.warn(F("AttendBeyondTl", { tl: rules.techLevel, skill: skillTl }));
      return;
    }
    if (value !== 0) given.push({ key: "techLevel", label: game.i18n.format("GWORLD.TechLevel.Line", { equipment: rules.techLevel, skill: skillTl }), value });
  }

  const modifier = typeof options.modifier === "function" ? await options.modifier() : options.modifier;
  if (modifier === null) return;

  // What the modules add: care, gear, a medical bed (API 1.60.0, tagged "physician"),
  // with the TL line as they left it.
  // And a bonus held for the physician's roll (API 1.144.0).
  const hooked = procedureRoll({
    actor: healer, label: R("Attend"), kind: "skill", skill: "Physician",
    base: skill, tags: ["physician", ...given.map((line) => line.key)], modifiers: [...given], opponent: patient,
  });
  const added = hooked.lines.reduce((sum, line) => sum + line.value, 0);
  const target = skill + modifier + added;
  const roll = new Roll("3d6");
  await roll.evaluate();
  await hooked.spend();
  const outcome = resolveSuccess(roll.total, target, dieResults(roll));
  const result = cureResult(outcome);
  const moved = cureHitPoints(result);

  const hp = patient.system?.hp ?? { value: 0, max: 0 };
  const previous = Number(hp.value) || 0;
  const max = Number(hp.max) || 0;
  const now = Math.min(max, previous + moved);
  if (moved !== 0) await patient.update({ "system.hp.value": now });

  // Rounds that succeed put the patient in this physician's care, and a
  // lasting crippling heals sooner for it (p. 422; since 1.156.0), at the TL
  // the rounds were made at once the listeners have had their say.
  const inCare = outcome.success ? await putCrippledInCare(patient, rules.techLevel) : [];

  await post(patient, {
    kind: R("Attend"),
    detail: F("AttendBy", { healer: options.label ?? String(healer?.name ?? ""), skill }),
    target,
    dice: dieResults(roll),
    roll: roll.total,
    lines: [
      ...(rules.techLevel !== skillTl ? [F("AttendAtTl", { tl: rules.techLevel })] : []),
      ...rules.lines,
      R(`Cure.${result}`),
      ...(moved !== 0 ? [F("CureHp", { hp: Math.abs(moved), previous, now })] : []),
      ...(inCare.length > 0 ? [F("AttendCrippled", { parts: inCare.join(", "), tl: rules.techLevel })] : []),
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
 * Puts the patient's lasting and undecided crippled parts in a physician's
 * care at this medical TL (p. 422; since 1.156.0), as `treatCrippled` does,
 * leaving any already in care at that TL or better. Temporary and permanent
 * parts are left alone: care changes nothing about when they end. Resolves to
 * the names of the parts it put in care.
 */
async function putCrippledInCare(patient: any, rawTechLevel: number): Promise<string[]> {
  // A listener may leave a fractional TL; a part keeps whole TLs, so compare
  // on the whole one or every rounds would put the same part in care again.
  const techLevel = Math.floor(rawTechLevel);
  const names: string[] = [];
  for (const part of crippledParts(patient)) {
    if (part.duration !== "lasting" && part.duration !== "undecided") continue;
    if (typeof part.treatedAtTl === "number" && part.treatedAtTl >= techLevel) continue;
    const treated = await treatCrippled(patient, part.id, { treatedAtTl: techLevel });
    if (treated) names.push(part.label || crippledPartName(part.location));
  }
  return names;
}

/** The healer's Physician skill item, compared through the "/TL" marker, or null. */
function physicianSkillItem(healer: any): any {
  const wanted = normalizeSkillName("Physician");
  return [...(healer?.items ?? [])].find((item: any) => item?.type === "skill" && normalizeSkillName(String(item.name ?? "")) === wanted) ?? null;
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
  // And a bonus held for the surgeon's roll (API 1.144.0).
  const hooked = procedureRoll({
    actor: surgeon, label: R("Surgery"), kind: "skill", skill: "Surgery",
    base: skill, tags: ["surgery"], modifiers: [], opponent: patient,
  });
  const added = hooked.added.reduce((sum, line) => sum + line.value, 0);
  const situation = surgeryModifier({
    techLevel,
    equipmentQuality: options.equipmentQuality,
    anesthetic: options.anesthetic,
    repairingCrippled: options.repairingCrippled,
  });

  const roll = new Roll("3d6");
  await roll.evaluate();
  await hooked.spend();
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
  // And a bonus held for the healer's roll (API 1.144.0).
  const hooked = procedureRoll({
    actor: healer, label: R("Resuscitate"), kind: "skill", skill: usingPhysician ? "Physician" : "First Aid",
    base: skill, tags: ["resuscitation", options.cause], modifiers: [], opponent: patient,
  });
  const added = hooked.added.reduce((sum, line) => sum + line.value, 0);

  const roll = new Roll("3d6");
  await roll.evaluate();
  await hooked.spend();
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
