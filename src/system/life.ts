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
import { attributeOf, healthRollScore } from "./attributes.js";
import { agedAttribute, agingResult, type AgedAttribute } from "../rules/aging.js";
import { jobRoll } from "../rules/jobs.js";
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
 * A month at the job (Campaigns p. 517).
 *
 * Rolled against the job's skill, at the level the sheet has it -- or, for a
 * skill the character never learned, not at all: a job needs its skill.
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

  const target = level + options.modifier;
  const roll = new Roll("3d6");
  await roll.evaluate();
  const outcome = resolveSuccess(roll.total, target, dieResults(roll));
  const result = jobRoll({
    success: outcome.success,
    criticalSuccess: outcome.criticalSuccess,
    criticalFailure: outcome.criticalFailure,
    margin: outcome.margin,
  });

  const earned = pay * result.monthsPaid;
  const changes: Record<string, unknown> = {};
  if (earned > 0) changes["system.money"] = (Number(actor.system?.money) || 0) + earned;
  if (result.fired) changes["system.job.title"] = "";
  if (Object.keys(changes).length > 0) await actor.update(changes);

  const lines: string[] = [];
  if (earned > 0) lines.push(game.i18n.format("GWORLD.Life.Paid", { amount: earned }));
  else lines.push(game.i18n.localize("GWORLD.Life.NotPaid"));
  if (result.promoted) lines.push(game.i18n.localize("GWORLD.Life.Promoted"));
  if (result.fired) lines.push(game.i18n.localize("GWORLD.Life.Fired"));
  if (result.risk) {
    lines.push(
      job.risk
        ? game.i18n.format("GWORLD.Life.RiskNamed", { risk: String(job.risk) })
        : game.i18n.localize("GWORLD.Life.Risk"),
    );
  }

  await post(actor, {
    kind: game.i18n.localize("GWORLD.Life.Job"),
    detail: game.i18n.format("GWORLD.Life.Worked", { title: String(job.title), skill: String(job.skill) }),
    target,
    dice: dieResults(roll),
    roll: roll.total,
    lines,
    good: result.monthsPaid > 0,
    bad: result.fired,
    rolls: [roll],
  });
}

/** Pays a month's cost of living out of the money on the sheet (Characters p. 265). */
export async function payCostOfLiving(options: { actor: any; months: number }): Promise<void> {
  const { actor } = options;
  if (!mayChange(actor)) return;
  const monthly = Number(actor.system?.derived?.wealth?.costOfLiving) || 0;
  const months = Math.max(0, Math.floor(options.months));
  const due = monthly * months;
  const before = Number(actor.system?.money) || 0;
  await actor.update({ "system.money": before - due });

  await post(actor, {
    kind: game.i18n.localize("GWORLD.Life.CostOfLiving"),
    detail: game.i18n.format("GWORLD.Life.PaidMonths", { months, amount: due }),
    lines: [game.i18n.format("GWORLD.Life.MoneyLeft", { amount: before - due })],
    bad: before - due < 0,
  });
}

/**
 * An aging roll (Campaigns p. 444).
 *
 * A failure takes a point off the attribute a die names, and the sheet is
 * written down by that point: it is the bought figure that ages.
 */
export async function rollAging(options: { actor: any; modifier: number }): Promise<void> {
  const { actor } = options;
  if (!mayChange(actor)) return;

  const aging = actor.system?.derived?.aging ?? {};
  if (aging.unaging) {
    ui.notifications?.info(game.i18n.localize("GWORLD.Life.Unaging"));
    return;
  }

  const target = healthRollScore(actor) + options.modifier;
  const roll = new Roll("3d6");
  await roll.evaluate();
  const outcome = resolveSuccess(roll.total, target, dieResults(roll));
  const result = agingResult({
    success: outcome.success,
    criticalFailure: outcome.criticalFailure,
    rolled: roll.total,
    longevity: aging.longevity === true,
    ht: attributeOf(actor, "HT"),
  });

  const rolls: any[] = [roll];
  let attribute: AgedAttribute | null = null;
  if (!result.held) {
    const die = new Roll("1d6");
    await die.evaluate();
    rolls.push(die);
    attribute = agedAttribute(die.total);
    const bought = Number(actor.system?.attributes?.[attribute]) || 10;
    await actor.update({ [`system.attributes.${attribute}`]: Math.max(1, bought - result.lost) });
  }

  const lines: string[] = [];
  if (result.savedByLongevity) lines.push(game.i18n.localize("GWORLD.Life.Longevity"));
  if (result.held) lines.push(game.i18n.localize("GWORLD.Life.Held"));
  else lines.push(game.i18n.format("GWORLD.Life.Lost", { points: result.lost, attribute }));

  await post(actor, {
    kind: game.i18n.localize("GWORLD.Life.Aging"),
    detail: game.i18n.format("GWORLD.Life.AgingDetail", { age: aging.age ?? "?", rolls: aging.rollsPerYear ?? 0 }),
    target,
    dice: dieResults(roll),
    roll: roll.total,
    lines,
    good: result.held,
    bad: !result.held,
    rolls,
  });
}
