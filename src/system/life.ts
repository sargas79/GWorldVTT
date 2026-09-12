/**
 * Life outside the fight (GURPS Basic Set: Characters pp. 24, 292; Campaigns
 * pp. 444, 516-518).
 *
 * Four things a character does between adventures, each a card: study a
 * skill and bank the hours, work a month at a job and get paid or not, pay
 * the month's cost of living, and grow a year older. The arithmetic is in
 * `src/rules/study.ts`, `jobs.ts`, `wealth.ts` and `aging.ts`; this is the
 * part that rolls and writes.
 */

import { SYSTEM_ID } from "./constants.js";
import { attributeOf } from "./attributes.js";
import { AGED_ATTRIBUTES, agingModifier, agingRoll, diesOfAge } from "../rules/aging.js";
import { CRITICAL_RAISE, jobRoll, type JobKind } from "../rules/jobs.js";
import { setCondition } from "./conditions.js";
import { normalizeSkillName } from "../rules/skills.js";
import { resolveSuccess } from "../rules/success.js";
import { studyPoints, type StudyMethod } from "../rules/study.js";

const LIFE_TEMPLATE = `systems/${SYSTEM_ID}/templates/chat/life.hbs`;

/** The individual d6 faces from an evaluated Roll. */
function dieResults(roll: any): number[] {
  return (roll.dice?.[0]?.results ?? []).map((r: { result: number }) => r.result);
}

function mayChange(actor: any): boolean {
  if (actor?.isOwner) return true;
  ui.notifications?.warn(
    game.i18n.format("GWORLD.Chat.CannotApply", { names: String(actor?.name ?? "") }),
  );
  return false;
}

async function post(actor: any, context: Record<string, unknown>): Promise<void> {
  const content = await foundry.applications.handlebars.renderTemplate(LIFE_TEMPLATE, {
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

/** The level of a skill by name, or null when the character lacks it. */
function skillLevelOf(actor: any, name: string): number | null {
  const wanted = normalizeSkillName(name);
  for (const item of actor?.items ?? []) {
    if (item.type !== "skill") continue;
    if (normalizeSkillName(String(item.name)) !== wanted) continue;
    const level = item.system?.derived?.level;
    return typeof level === "number" ? level : null;
  }
  return null;
}

/**
 * Studies a skill for a stretch of hours (Characters p. 292).
 *
 * The points go into the skill and onto the ledger as an award, so that the
 * character's total still adds up: a point learned is a point earned. Hours
 * short of a point are banked on the skill for next time.
 */
export async function studySkill(options: {
  actor: any;
  skillId: string;
  hours: number;
  method: StudyMethod;
}): Promise<number> {
  const { actor } = options;
  if (!mayChange(actor)) return 0;
  const skill = actor.items?.get(options.skillId);
  if (!skill || skill.type !== "skill") return 0;

  const result = studyPoints({
    hours: options.hours,
    method: options.method,
    banked: Number(skill.system?.studyHours) || 0,
  });

  const changes: Record<string, unknown> = { "system.studyHours": result.bankedHours };
  if (result.points > 0) {
    changes["system.points"] = (Number(skill.system?.points) || 0) + result.points;
  }
  await skill.update(changes);

  if (result.points > 0) {
    const awards = [...(actor.system?.points?.awards ?? [])];
    awards.push({
      points: result.points,
      note: game.i18n.format("GWORLD.Life.StudyAward", { skill: String(skill.name) }),
      at: Date.now(),
    });
    await actor.update({ "system.points.awards": awards });
  }

  await post(actor, {
    kind: game.i18n.localize("GWORLD.Life.Study"),
    detail: game.i18n.format("GWORLD.Life.Studied", {
      hours: options.hours,
      skill: String(skill.name),
      method: game.i18n.localize(`GWORLD.Life.Method.${options.method}`),
    }),
    lines: [
      result.points > 0
        ? game.i18n.format("GWORLD.Life.PointsEarned", { points: result.points })
        : game.i18n.localize("GWORLD.Life.NoPointYet"),
      game.i18n.format("GWORLD.Life.Banked", { hours: result.bankedHours }),
    ],
    good: result.points > 0,
  });

  return result.points;
}

/**
 * A month at the job (Campaigns p. 516).
 *
 * Rolled against the job's skill, at the level the sheet has it -- or, for a
 * skill the character never learned, not at all: "candidates must have at
 * least one point in the skill -- default skill will not suffice!" A wage is
 * paid on anything but a critical; freelance work is paid by the margin.
 */
export async function workAMonth(options: { actor: any; modifier: number }): Promise<void> {
  const { actor } = options;
  if (!mayChange(actor)) return;

  const job = actor.system?.job ?? {};
  const pay = Number(actor.system?.derived?.wealth?.jobPay) || 0;
  const level = skillLevelOf(actor, String(job.skill ?? ""));
  if (!job.title || level === null) {
    ui.notifications?.warn(game.i18n.localize("GWORLD.Life.NoJob"));
    return;
  }

  const kind = (job.kind === "freelance" ? "freelance" : "wage") as JobKind;
  const target = level + options.modifier;
  const roll = new Roll("3d6");
  await roll.evaluate();
  const outcome = resolveSuccess(roll.total, target, dieResults(roll));
  const result = jobRoll({
    kind,
    success: outcome.success,
    criticalSuccess: outcome.criticalSuccess,
    criticalFailure: outcome.criticalFailure,
    margin: outcome.margin,
  });

  const earned = Math.round(pay * result.payMultiplier);
  const changes: Record<string, unknown> = {};
  if (earned > 0) changes["system.money"] = (Number(actor.system?.money) || 0) + earned;
  if (Object.keys(changes).length > 0) await actor.update(changes);

  const lines: string[] = [];
  if (earned > 0) lines.push(game.i18n.format("GWORLD.Life.Paid", { amount: earned }));
  else lines.push(game.i18n.localize("GWORLD.Life.NotPaid"));
  if (kind === "freelance" && result.payMultiplier !== 1 && result.payMultiplier > 0) {
    lines.push(game.i18n.format("GWORLD.Life.ByMargin", { percent: Math.round(result.payMultiplier * 100) }));
  }
  if (result.raise) lines.push(game.i18n.format("GWORLD.Life.Raise", { percent: Math.round(CRITICAL_RAISE * 100) }));
  if (result.disaster) {
    lines.push(
      job.risk
        ? game.i18n.format("GWORLD.Life.DisasterNamed", { risk: String(job.risk) })
        : game.i18n.localize("GWORLD.Life.Disaster"),
    );
  }

  await post(actor, {
    kind: game.i18n.localize("GWORLD.Life.Job"),
    detail: game.i18n.format("GWORLD.Life.Worked", {
      title: String(job.title),
      skill: String(job.skill),
      kind: game.i18n.localize(`GWORLD.Life.JobKind.${kind}`),
    }),
    target,
    dice: dieResults(roll),
    roll: roll.total,
    lines,
    good: earned > 0,
    bad: result.disaster,
    rolls: [roll],
  });
}

/**
 * Settles a month's accounts (Characters pp. 26, 265): the cost of living at
 * the character's Status, a Debt's payment, and an Independent Income's
 * receipts, out of and into the money on the sheet.
 */
export async function payCostOfLiving(options: { actor: any; months: number }): Promise<void> {
  const { actor } = options;
  if (!mayChange(actor)) return;
  const wealth = actor.system?.derived?.wealth ?? {};
  const monthly = Number(wealth.costOfLiving) || 0;
  const debt = Number(wealth.debt) || 0;
  const income = Number(wealth.independentIncome) || 0;
  const months = Math.max(0, Math.floor(options.months));
  const due = (monthly + debt) * months;
  const received = income * months;
  const before = Number(actor.system?.money) || 0;
  const after = before - due + received;
  await actor.update({ "system.money": after });

  const lines = [game.i18n.format("GWORLD.Life.MoneyLeft", { amount: after })];
  if (debt > 0) lines.unshift(game.i18n.format("GWORLD.Life.DebtPaid", { amount: debt * months }));
  if (income > 0) lines.unshift(game.i18n.format("GWORLD.Life.IncomeReceived", { amount: received }));

  await post(actor, {
    kind: game.i18n.localize("GWORLD.Life.CostOfLiving"),
    detail: game.i18n.format("GWORLD.Life.PaidMonths", { months, amount: monthly * months }),
    lines,
    bad: after < 0,
  });
}

/**
 * A series of aging rolls (Campaigns p. 444): "four HT rolls -- one for each
 * of your four basic attributes, in the following order: ST, DX, IQ, HT."
 *
 * The medical tech level is taken as the character's own unless the GM says
 * otherwise, and Fit's bonus is the one the page names rather than the
 * general HT-roll bonus, so it is not counted twice. A level lost comes off
 * the bought figure, and an attribute that reaches 0 is a natural death.
 */
export async function rollAging(options: { actor: any; modifier: number; medicalTl?: number }): Promise<void> {
  const { actor } = options;
  if (!mayChange(actor)) return;

  const aging = actor.system?.derived?.aging ?? {};
  if (aging.unaging) {
    ui.notifications?.info(game.i18n.localize("GWORLD.Life.Unaging"));
    return;
  }

  const ht = attributeOf(actor, "HT");
  const fit = Number(actor.system?.derived?.traitEffects?.htRolls) || 0;
  const medicalTl = options.medicalTl ?? (Number(actor.system?.tl) || 0);
  const modifier = agingModifier({ medicalTl, fit }) + options.modifier;
  const target = ht + modifier;

  const rolls: any[] = [];
  const lines: string[] = [];
  const changes: Record<string, number> = {};
  let dead = false;

  for (const attribute of AGED_ATTRIBUTES) {
    const roll = new Roll("3d6");
    await roll.evaluate();
    rolls.push(roll);
    const outcome = resolveSuccess(roll.total, target, dieResults(roll));
    const result = agingRoll({
      attribute,
      success: outcome.success,
      criticalFailure: outcome.criticalFailure,
      rolled: roll.total,
      longevity: aging.longevity === true,
      modifiedHt: target,
    });
    if (result.lost > 0) {
      const bought = Number(actor.system?.attributes?.[attribute]) || 10;
      const after = bought - result.lost;
      changes[`system.attributes.${attribute}`] = Math.max(1, after);
      if (diesOfAge(after)) dead = true;
      lines.push(game.i18n.format("GWORLD.Life.Lost", { attribute, roll: roll.total, points: result.lost }));
    } else {
      lines.push(
        game.i18n.format(result.savedByLongevity ? "GWORLD.Life.HeldByLongevity" : "GWORLD.Life.Held", {
          attribute,
          roll: roll.total,
        }),
      );
    }
  }

  if (Object.keys(changes).length > 0) await actor.update(changes);
  if (dead) {
    await setCondition(actor, "dead", true);
    lines.push(game.i18n.localize("GWORLD.Life.NaturalDeath"));
  }

  await post(actor, {
    kind: game.i18n.localize("GWORLD.Life.Aging"),
    detail: game.i18n.format("GWORLD.Life.AgingDetail", {
      age: aging.age ?? "?",
      rolls: aging.rollsPerYear ?? 0,
      modifier: modifier >= 0 ? `+${modifier}` : String(modifier),
    }),
    target,
    lines,
    good: Object.keys(changes).length === 0,
    bad: Object.keys(changes).length > 0,
    rolls,
  });
}
