/**
 * Poison on a sheet (GURPS Basic Set: Campaigns pp. 437-439).
 *
 * A poison outlives the moment it was administered: arsenic runs hourly for
 * eight hours, and mustard gas for a day. So a dose is written onto the victim
 * and advanced a cycle at a time, the way suffocation counts seconds -- because
 * how much time passed between one scene and the next is the GM's to say, and
 * nothing else in Foundry is going to tell us.
 *
 * Several doses can be running at once, which is why this is a list rather than
 * a single flag. Somebody who has been bitten twice is in twice the trouble.
 */

import { SYSTEM_ID } from "./constants.js";
import { syncHealthConditions } from "./conditions.js";
import { applyFatigue } from "./fatigue.js";
import { healthRollScore } from "./attributes.js";
import {
  SYMPTOM_THRESHOLDS,
  delayForSize,
  dosage,
  effectMinutes,
  poisonCycle,
  symptomShowing,
  treatmentBonus,
  treatmentRollModifier,
  type Poison,
  type Treatment,
} from "../rules/poison.js";
import { diseaseCycle, diseaseTreatmentBonus } from "../rules/disease.js";
import { resolveSuccess } from "../rules/success.js";
import { callCombatHook } from "./combat-extensions.js";
import { PROCEDURE_HOOKS } from "./procedure-extensions.js";

const POISON_TEMPLATE = `systems/${SYSTEM_ID}/templates/chat/poison.hbs`;

/** Where the doses somebody is carrying are kept. */
export const POISON_FLAG = "poisons";

/** A dose of something, at work on a particular victim. */
export interface ActivePoison {
  /** Unique within the actor, so a card's button knows which dose it means. */
  id: string;
  name: string;
  /** The HT modifier, already adjusted for the dose taken. Null: no roll. */
  resistanceModifier: number | null;
  damage: "toxic" | "fatigue" | "none";
  dice: number;
  adds: number;
  /** Multiplier on the damage from an outsized dose. */
  damageMultiplier: number;
  intervalSeconds: number;
  cycles: number;
  cyclesSuffered: number;
  /** Seconds before the first roll, after size and dose were accounted for. */
  delaySeconds: number;
  /** A standing bonus to resist, from an antidote or a course of treatment. */
  treatment: number;
  /**
   * Injury this dose has done so far, which is what its worse symptoms are
   * keyed to: "after the poison causes enough injury (usually 1/3, 1/2, or 2/3
   * of the victim's HP)" (p. 438).
   */
  hpLostToPoison?: number;
  reference: string;
  /**
   * True for an illness rather than a dose of something.
   *
   * A caught disease runs on the same machinery -- a cyclic resistance roll and
   * damage per failure -- so it lives in the same list, and this is what the
   * cards read to call it an illness instead of a poison.
   */
  illness?: boolean;
  /** The `<module>.<key>` of the module poison it was dosed from (since 1.57.0). */
  source?: string;
}

/** The doses at work on an actor. */
export function activePoisons(actor: any): ActivePoison[] {
  const stored = actor?.getFlag?.(SYSTEM_ID, POISON_FLAG);
  return Array.isArray(stored) ? (stored as ActivePoison[]) : [];
}

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

/** Posts one poison card. */
async function post(actor: any, context: Record<string, unknown>): Promise<void> {
  const content = await foundry.applications.handlebars.renderTemplate(POISON_TEMPLATE, {
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

/** Writes the list back, dropping the flag entirely when it empties. */
async function store(actor: any, doses: ActivePoison[]): Promise<void> {
  if (doses.length === 0) {
    if (actor.getFlag?.(SYSTEM_ID, POISON_FLAG) !== undefined) {
      await actor.unsetFlag(SYSTEM_ID, POISON_FLAG);
    }
    return;
  }
  await actor.setFlag(SYSTEM_ID, POISON_FLAG, doses);
}

/**
 * Administers a dose (pp. 437-438).
 *
 * The victim's size stretches or shrinks the delay and the dose adjusts
 * everything else, so both are folded in here: what gets written onto the sheet
 * is this poison as it will actually behave in this victim.
 */
export async function dosePoison(options: {
  actor: any;
  poison: Poison;
  /** Doublings of the standard dose: 1 is a double dose, -1 is a half. */
  doublings?: number;
}): Promise<ActivePoison | null> {
  const { actor, poison } = options;
  if (!mayChange(actor)) return null;

  const dose = dosage(options.doublings ?? 0);
  const sizeModifier = Number(actor.system?.sm) || 0;

  const active: ActivePoison = {
    id: foundry.utils.randomID(),
    name: poison.name,
    resistanceModifier:
      poison.resistanceModifier === null
        ? null
        : poison.resistanceModifier + dose.resistanceModifier,
    damage: poison.damage,
    dice: poison.dice,
    adds: poison.adds,
    damageMultiplier: dose.damageMultiplier,
    intervalSeconds: Math.round(poison.intervalSeconds * dose.timeMultiplier),
    cycles: poison.cycles,
    cyclesSuffered: 0,
    delaySeconds: Math.round(delayForSize(poison.delaySeconds, sizeModifier) * dose.timeMultiplier),
    treatment: 0,
    reference: poison.reference ?? "",
    // A module's own poison says whose it is, for the cycle hook (since 1.57.0).
    ...(poison.source ? { source: poison.source } : {}),
  };

  await store(actor, [...activePoisons(actor), active]);

  await post(actor, {
    kind: game.i18n.localize("GWORLD.Poison.Dosed"),
    poison: active,
    // A poison nobody can resist has no roll to report, which is worth saying
    // outright rather than showing a blank target.
    noRoll: active.resistanceModifier === null,
    detectionBonus: dose.detectionBonus,
    doubled: (options.doublings ?? 0) !== 0,
  });

  return active;
}

/**
 * Notes a treatment against a dose (p. 439).
 *
 * The bonus is standing: "the correct antidote or medical procedures can help
 * prevent further damage, providing their bonus to future HT rolls." Whether
 * the First Aid or Physician roll behind it succeeded is the caller's to check.
 */
export async function treatPoison(options: {
  actor: any;
  id: string;
  treatment: Treatment;
  /** An antidote's bonus, which is the poison's own and not a general rule. */
  antidoteBonus?: number;
  /**
   * The treater's First Aid or Physician -- Physician alone for medical
   * procedures -- or null where nobody has it. An antidote needs no roll.
   */
  skillLevel?: number | null;
}): Promise<void> {
  const { actor } = options;
  if (!mayChange(actor)) return;

  const techLevel = Number(actor.system?.tl) || 3;
  const bonus =
    options.treatment === "antidote"
      ? Math.max(0, options.antidoteBonus ?? 0)
      : treatmentBonus(options.treatment, techLevel);

  const doses = activePoisons(actor);
  const dose = doses.find((d) => d.id === options.id);
  if (!dose) return;

  // Every treatment but an antidote is a skill roll first (p. 439): sucking the
  // wound "requires a First Aid or Physician roll at -2", inducing vomiting
  // "calls for a First Aid or Physician roll", and medical procedures "require
  // a Physician roll". The bonus is only there if the roll is made.
  let rolled: { roll: any; target: number; success: boolean } | null = null;
  if (options.treatment !== "antidote") {
    const target = (options.skillLevel ?? 0) + treatmentRollModifier(options.treatment);
    const roll = new Roll("3d6");
    await roll.evaluate();
    const outcome = resolveSuccess(roll.total, target, dieResults(roll));
    rolled = { roll, target, success: options.skillLevel != null && outcome.success };
  }
  const helped = rolled === null || rolled.success;

  // Treatments do not stack into a heap of bonuses: the best one applies.
  if (helped) {
    dose.treatment = Math.max(dose.treatment, bonus);
    await store(actor, doses);
  }

  await post(actor, {
    kind: game.i18n.localize("GWORLD.Poison.Treated"),
    poison: dose,
    treatment: game.i18n.localize(`GWORLD.Poison.Treatment_${options.treatment}`),
    bonus: helped ? bonus : 0,
    ...(rolled
      ? {
          target: rolled.target,
          dice: dieResults(rolled.roll),
          roll: rolled.roll.total,
          success: rolled.success,
          treatmentFailed: !rolled.success,
          noSkill: options.skillLevel == null,
          rolls: [rolled.roll],
        }
      : {}),
  });
}

/**
 * Treats an illness rather than a poison (p. 443).
 *
 * The poison treatments are the wrong list for a disease: nobody sucks
 * influenza out of a wound. "At TL6+, antibiotics give +3 to recover from most
 * bacterial diseases. At any TL, a physician's care provides the same bonuses
 * to recover from disease that it gives to recover from injuries."
 */
export async function treatIllness(options: {
  actor: any;
  id: string;
  antibiotics: boolean;
  drugResistant: boolean;
  /** The physician's medical-care bonus, as recovery would give it. */
  physicianBonus: number;
}): Promise<void> {
  const { actor } = options;
  if (!mayChange(actor)) return;

  const doses = activePoisons(actor);
  const dose = doses.find((d) => d.id === options.id);
  if (!dose) return;

  const bonus = diseaseTreatmentBonus({
    techLevel: Number(actor.system?.tl) || 3,
    antibiotics: options.antibiotics,
    drugResistant: options.drugResistant,
    physicianBonus: options.physicianBonus,
  });
  dose.treatment = Math.max(dose.treatment, bonus);
  await store(actor, doses);

  await post(actor, {
    kind: game.i18n.localize("GWORLD.Illness.Treated"),
    illness: true,
    poison: dose,
    treatment: game.i18n.localize(options.antibiotics ? "GWORLD.Illness.Antibiotics" : "GWORLD.Illness.Care"),
    bonus,
  });
}

/**
 * Advances one dose by one cycle (p. 438).
 *
 * "The victim gets a new HT roll to resist every cycle. On a success, he shakes
 * off the poison; on a failure, an additional cycle of damage occurs." Damage
 * is toxic, so DR never enters into it -- which is why this writes to the sheet
 * directly rather than going through the damage pipeline.
 */
export async function advancePoison(options: { actor: any; id: string }): Promise<number> {
  const { actor } = options;
  if (!mayChange(actor)) return 0;

  const doses = activePoisons(actor);
  const dose = doses.find((d) => d.id === options.id);
  if (!dose) return 0;

  const ht = healthRollScore(actor);
  const target = ht + (dose.resistanceModifier ?? 0) + dose.treatment;

  // A poison that allows no roll is not resisted, and no dice are wasted on it.
  const check = dose.resistanceModifier === null ? null : new Roll("3d6");
  if (check) await check.evaluate();
  const outcome = check ? resolveSuccess(check.total, target, dieResults(check)) : null;

  // A caught disease runs on its own rule (p. 442), which is the poison's
  // shape with a roll always allowed; a poison may allow none at all.
  const cycle = dose.illness
    ? (() => {
        const ill = diseaseCycle({
          disease: dose,
          resisted: outcome ? outcome.success : false,
          cyclesSoFar: dose.cyclesSuffered,
        });
        return { shakenOff: ill.recovered, cyclesSuffered: ill.cyclesSuffered, continues: ill.continues };
      })()
    : poisonCycle({
        poison: dose,
        resisted: outcome ? outcome.success : null,
        cyclesSoFar: dose.cyclesSuffered,
      });

  const rolls: any[] = check ? [check] : [];
  let damageDice: number[] = [];
  let hpLost = 0;
  let fpLost = 0;

  if (!cycle.shakenOff && dose.damage !== "none") {
    const damage = dose.dice > 0 ? new Roll(`${dose.dice}d6`) : null;
    if (damage) {
      await damage.evaluate();
      rolls.push(damage);
      damageDice = dieResults(damage);
    }

    const rolled = (damage?.total ?? 0) + dose.adds;
    const suffered = Math.max(0, Math.round(rolled * dose.damageMultiplier));

    if (dose.damage === "fatigue") {
      const spent = await applyFatigue(actor, suffered);
      fpLost = spent.fpLost;
      hpLost = spent.hpLost;
    } else {
      // "DR has no effect on this damage", and toxic damage has a wounding
      // modifier of x1, so the injury is what the dice said.
      const hp = actor.system?.hp ?? { value: 0, max: 0 };
      hpLost = suffered;
      await actor.update({ "system.hp.value": (Number(hp.value) || 0) - suffered });
      await syncHealthConditions(actor);
    }
  }

  dose.cyclesSuffered = cycle.cyclesSuffered;

  // Worse symptoms "occur automatically after the poison causes enough injury
  // (usually 1/3, 1/2, or 2/3 of the victim's HP)" -- which they are is the
  // poison's own description, so the card names the thresholds crossed.
  const lostBefore = Number(dose.hpLostToPoison ?? 0) || 0;
  dose.hpLostToPoison = lostBefore + (dose.damage === "toxic" ? hpLost : 0);
  const maxHp = Number(actor.system?.hp?.max ?? 0) || 0;
  const symptomsNow = SYMPTOM_THRESHOLDS.filter(
    (threshold) =>
      symptomShowing({ hpLostToPoison: dose.hpLostToPoison ?? 0, maxHp, threshold }) &&
      !symptomShowing({ hpLostToPoison: lostBefore, maxHp, threshold }),
  ).map((threshold) => (threshold === 1 / 3 ? "1/3" : threshold === 1 / 2 ? "1/2" : "2/3"));

  // A poison that does something other than damage lasts, by default, "a
  // number of minutes equal to the margin of failure on the resistance roll".
  const effectFor =
    dose.damage === "none" && outcome && !outcome.success ? effectMinutes(outcome.margin) : null;

  const finished = cycle.shakenOff || !cycle.continues;
  await store(
    actor,
    finished ? doses.filter((d) => d.id !== dose.id) : doses,
  );

  // The modules hear the cycle (since 1.57.0): a poison of theirs may do more
  // than damage -- a condition for the margin's minutes, a symptom at a third
  // of HP lost -- and only its module knows what.
  callCombatHook(PROCEDURE_HOOKS.poisonCycle, {
    actor,
    poison: { ...dose },
    source: dose.source ?? null,
    resisted: outcome ? outcome.success : null,
    margin: outcome ? outcome.margin : 0,
    criticalFailure: outcome ? outcome.criticalFailure : false,
    hpLost,
    fpLost,
    hpLostToPoison: dose.hpLostToPoison ?? 0,
    symptomsNow: [...symptomsNow],
    effectMinutes: effectFor,
    finished,
  });

  const hp = actor.system?.hp ?? { value: 0, max: 0 };
  const fp = actor.system?.fp ?? { value: 0, max: 0 };

  await post(actor, {
    kind: game.i18n.localize(dose.illness ? "GWORLD.Illness.Cycle" : "GWORLD.Poison.Cycle"),
    illness: dose.illness === true,
    poison: dose,
    ...(check
      ? {
          target,
          dice: dieResults(check),
          roll: check.total,
          success: outcome!.success,
        }
      : { noRoll: true }),
    shakenOff: cycle.shakenOff,
    damageDice,
    // "Even a poison that inflicts 1 HP of injury per day can be lethal if it's
    // hard to resist and lasts for two dozen cycles", so the count is the point.
    cyclesSuffered: cycle.cyclesSuffered,
    cyclesLeft: Math.max(0, dose.cycles - cycle.cyclesSuffered),
    finished,
    hpLost,
    fpLost,
    symptomsNow,
    effectFor,
    hp: { now: Number(hp.value) || 0, max: Number(hp.max) || 0 },
    fp: { now: Number(fp.value) || 0, max: Number(fp.max) || 0 },
    rolls,
  });

  return hpLost + fpLost;
}

/** Takes a dose off the sheet, for a GM who has decided it is over. */
export async function clearPoison(actor: any, id: string): Promise<void> {
  if (!mayChange(actor)) return;
  await store(actor, activePoisons(actor).filter((dose) => dose.id !== id));
}
