/**
 * Drugs, overdose and withdrawal (GURPS Basic Set: Campaigns pp. 440-441).
 *
 * Drinking was on the sheet and the rest of the chapter was not: a stimulant
 * that pays its fatigue back double when it wears off, a second dose that can
 * stop the heart, the overdose that comes of mixing depressants, and the
 * fourteen days of withdrawal from any of them.
 */

import { SYSTEM_ID } from "./constants.js";
import { attributeOf, healthRollScore } from "./attributes.js";
import { applyFatigue } from "./fatigue.js";
import { inflict } from "./afflictions.js";
import { setCondition } from "./conditions.js";
import { resolveSuccess } from "../rules/success.js";
import {
  DRUGS,
  OVERDOSE_POISON,
  WITHDRAWAL_DAYS,
  WITHDRAWAL_MAX,
  overdoseHours,
  overdoseModifier,
  stimulantCrash,
  stimulantDoseModifier,
  stimulantHours,
  withdrawalDay,
  type DrugKind,
} from "../rules/intoxication.js";

const CARD_TEMPLATE = `systems/${SYSTEM_ID}/templates/chat/drug.hbs`;
export const WITHDRAWAL_FLAG = "withdrawal";

const L = (key: string, data?: Record<string, unknown>) =>
  data ? game.i18n.format(`GWORLD.Drug.${key}`, data) : game.i18n.localize(`GWORLD.Drug.${key}`);

type Line = { key: string; data?: Record<string, unknown>; grave?: boolean };

async function roll3d(target: number) {
  const roll = new Roll("3d6");
  await roll.evaluate();
  const dice = (roll.dice[0]?.results ?? []).map((r: { result: number }) => r.result);
  return { roll, dice, outcome: resolveSuccess(roll.total, target, dice) };
}

async function post(actor: any, title: string, lines: Line[], rolled?: {
  target: number;
  roll: any;
  dice: number[];
  outcome: ReturnType<typeof resolveSuccess>;
}) {
  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    content: await foundry.applications.handlebars.renderTemplate(CARD_TEMPLATE, {
      title,
      rolled: Boolean(rolled),
      target: rolled?.target,
      dice: rolled?.dice ?? [],
      total: rolled?.roll?.total,
      outcome: rolled?.outcome,
      lines,
    }),
    ...(rolled ? { rolls: [rolled.roll] } : {}),
  });
}

/**
 * A dose of a potent stimulant (p. 440).
 *
 * "Restore 1d FP ... These effects endure for (12 - HT) hours, minimum one
 * hour. After that time, the user loses twice the FP he recovered." And a
 * second dose inside a day is a HT roll "at a cumulative -1 per dose after the
 * first. On a critical failure, he suffers a heart attack."
 */
export async function takeStimulant(options: { actor: any; dosesToday: number }): Promise<void> {
  const { actor } = options;
  if (!actor?.isOwner) return;

  const name = String(actor.name ?? "");
  const health = attributeOf(actor, "HT");
  const lines: Line[] = [];

  const restore = new Roll("1d6");
  await restore.evaluate();
  const fp = actor.system?.fp ?? { value: 0, max: 0 };
  const before = Number(fp.value) || 0;
  const after = Math.min(Number(fp.max) || before, before + restore.total);
  const gained = after - before;
  if (gained > 0) await actor.update({ "system.fp.value": after });

  const hours = stimulantHours(health);
  lines.push({ key: "Restores", data: { fp: gained } });
  lines.push({ key: "Lasts", data: { hours } });
  lines.push({ key: "Crash", data: { fp: stimulantCrash(gained), hours } });

  const doses = Math.max(1, Math.floor(options.dosesToday));
  let rolled: Awaited<ReturnType<typeof roll3d>> & { target: number } | undefined;
  if (doses >= 2) {
    const target = healthRollScore(actor) + stimulantDoseModifier(doses);
    rolled = { ...(await roll3d(target)), target };
    if (rolled.outcome.criticalFailure) {
      lines.push({ key: "HeartStops", grave: true });
      await inflict(actor, "heartAttack");
    }
  }

  await post(actor, L("StimulantTitle", { name, doses }), lines, rolled);
}

/**
 * A dose, or several, of a depressant (p. 441).
 *
 * "Anyone who takes two or more doses of depressants risks an overdose ... Any
 * alcohol at all counts as an extra dose ... each doubling of dosage gives -2
 * to resistance rolls." An overdose is the critical failure on that roll, and
 * it "causes unconsciousness for hours equal to the margin of failure. As
 * well, the drug acts as a poison."
 */
export async function takeDepressant(options: {
  actor: any;
  drug: DrugKind;
  doses: number;
  anyAlcohol: boolean;
}): Promise<void> {
  const { actor } = options;
  if (!actor?.isOwner) return;

  const drug = DRUGS[options.drug];
  const name = String(actor.name ?? "");
  const doses = Math.max(1, Math.floor(options.doses));
  const risksOverdose = doses + (options.anyAlcohol ? 1 : 0) >= 2;
  const modifier =
    (drug.resistanceModifier ?? 0) + overdoseModifier({ doses, anyAlcohol: options.anyAlcohol });
  const target = healthRollScore(actor) + modifier;
  const rolled = { ...(await roll3d(target)), target };
  const lines: Line[] = [];

  if (!rolled.outcome.success) lines.push({ key: "Affected" });

  if (risksOverdose && rolled.outcome.criticalFailure) {
    const hours = overdoseHours(rolled.outcome.margin);
    await setCondition(actor, "unconscious", true);
    lines.push({ key: "Overdose", data: { hours }, grave: true });
    lines.push({
      key: "OverdosePoison",
      data: {
        damage: OVERDOSE_POISON.damagePerCycle,
        minutes: OVERDOSE_POISON.intervalSeconds / 60,
        cycles: OVERDOSE_POISON.cycles,
      },
      grave: true,
    });
  } else if (risksOverdose) {
    lines.push({ key: "RiskedOverdose" });
  }

  await post(actor, L("DepressantTitle", { name, drug: L(`Kind.${options.drug}`), doses }), lines, rolled);
}

/**
 * One day of withdrawal (p. 440).
 *
 * "Make daily withdrawal rolls against HT (maximum 13)", or Will for a
 * psychological dependency. The tally of good days is kept on the sheet, since
 * it runs to fourteen and a single lapse can put it back to nothing. A
 * psychological dependency that makes the fourteen "must make one final Will
 * roll. On a failure, you keep any quirks or disadvantages incurred along the
 * way" -- so that roll is made here too, on the day it falls due.
 */
export async function withdrawalRoll(options: {
  actor: any;
  psychological: boolean;
  drugAvailable: boolean;
}): Promise<void> {
  const { actor } = options;
  if (!actor?.isOwner) return;

  const name = String(actor.name ?? "");
  const will = Number(actor.system?.derived?.will) || 10;
  const score = options.psychological ? will : healthRollScore(actor);
  const target = Math.min(WITHDRAWAL_MAX, score);
  const rolled = { ...(await roll3d(target)), target };

  const held = actor.getFlag?.(SYSTEM_ID, WITHDRAWAL_FLAG) ?? {};
  const day = withdrawalDay({
    success: rolled.outcome.success,
    daysClear: Number(held.daysClear) || 0,
    drugAvailable: options.drugAvailable,
    psychological: options.psychological,
  });

  const lines: Line[] = [];
  if (day.gaveIn) lines.push({ key: "GaveIn", grave: true });
  if (day.hpLost > 0) {
    const hp = Number(actor.system?.hp?.value) || 0;
    await actor.update({ "system.hp.value": hp - day.hpLost });
    lines.push({ key: "HurtByWithdrawal", data: { hp: day.hpLost } });
  }
  if (day.quirk) lines.push({ key: "Quirk" });

  if (day.withdrawn) {
    await actor.unsetFlag?.(SYSTEM_ID, WITHDRAWAL_FLAG);
    lines.push({ key: "Withdrawn" });
    if (options.psychological) {
      const final = await roll3d(will);
      lines.push({ key: final.outcome.success ? "FinalWillKept" : "FinalWillFailed", grave: !final.outcome.success });
    }
  } else {
    await actor.setFlag?.(SYSTEM_ID, WITHDRAWAL_FLAG, { daysClear: day.daysClear });
    lines.push({ key: "Progress", data: { days: day.daysClear, needed: WITHDRAWAL_DAYS } });
  }

  await post(actor, L("WithdrawalTitle", { name }), lines, rolled);
}

/** Fatigue a stimulant's crash takes back, applied when the table says it has worn off. */
export async function stimulantWearsOff(actor: any, fpRestored: number): Promise<void> {
  if (!actor?.isOwner) return;
  await applyFatigue(actor, stimulantCrash(fpRestored), { exertion: false });
}
