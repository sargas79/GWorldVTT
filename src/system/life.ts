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
import { skillLevelOf } from "./skill-level.js";
import { resolveSuccess } from "../rules/success.js";
import { studyLevels, studyPoints, type StudyMethod } from "../rules/study.js";
import { ATTRIBUTE_COST_PER_LEVEL, BASIC_SPEED_STEP, SECONDARY_COST_PER_LEVEL } from "../rules/attributes.js";
import { traitPoints } from "../rules/traits.js";
import { callCombatHook } from "./combat-extensions.js";
import { isRuleOn } from "./optional-rules.js";
import { PROCEDURE_HOOKS } from "./procedure-extensions.js";

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

/** The attributes a job can be rolled against instead of a skill. */
export const JOB_ATTRIBUTES = ["ST", "DX", "IQ", "HT", "Will", "Per"] as const;

/**
 * What a job is rolled against (Campaigns p. 516): a skill the character has,
 * or an attribute for work that needs no skill. Null when neither.
 */
export function jobRollLevel(actor: any, name: string): number | null {
  const key = String(name ?? "").trim();
  if ((JOB_ATTRIBUTES as readonly string[]).includes(key)) {
    const derived = actor?.system?.derived ?? {};
    const value = key === "Will" ? derived.will : key === "Per" ? derived.per : derived.attributes?.[key];
    return typeof value === "number" ? value : null;
  }
  return skillLevelOf(actor, key);
}

/**
 * Money in or out of the sheet's cash, with a line in the chat saying what
 * for, so the table can follow where it went. `chat: false` moves the money
 * and says nothing, for a purchase the sheet already shows.
 */
export async function adjustCash(options: { actor: any; amount: number; note?: string; chat?: boolean }): Promise<void> {
  const { actor } = options;
  if (!mayChange(actor) || !Number.isFinite(options.amount) || options.amount === 0) return;
  const before = Number(actor.system?.money) || 0;
  const after = Math.round((before + options.amount) * 100) / 100;
  await actor.update({ "system.money": after });
  if (options.chat === false) return;
  await post(actor, {
    kind: game.i18n.localize("GWORLD.Life.Cash"),
    detail: options.note || game.i18n.localize(options.amount > 0 ? "GWORLD.Life.CashIn" : "GWORLD.Life.CashOut"),
    lines: [
      game.i18n.format("GWORLD.Life.CashChange", { amount: `${options.amount > 0 ? "+" : "-"}$${Math.abs(options.amount)}` }),
      game.i18n.format("GWORLD.Life.MoneyLeft", { amount: after }),
    ],
    good: options.amount > 0,
    bad: after < 0,
  });
}

/**
 * The attributes and secondary characteristics study can raise (Characters
 * pp. 290, 292), by the key the character's banked hours are kept under:
 * where the bought figure is, what a level adds to it, and what it costs.
 */
export const STUDY_ATTRIBUTES = Object.freeze({
  ST: { path: "system.attributes.ST", step: 1, cost: ATTRIBUTE_COST_PER_LEVEL.ST, label: "GWORLD.Attribute.ST" },
  DX: { path: "system.attributes.DX", step: 1, cost: ATTRIBUTE_COST_PER_LEVEL.DX, label: "GWORLD.Attribute.DX" },
  IQ: { path: "system.attributes.IQ", step: 1, cost: ATTRIBUTE_COST_PER_LEVEL.IQ, label: "GWORLD.Attribute.IQ" },
  HT: { path: "system.attributes.HT", step: 1, cost: ATTRIBUTE_COST_PER_LEVEL.HT, label: "GWORLD.Attribute.HT" },
  hp: { path: "system.purchased.hp", step: 1, cost: SECONDARY_COST_PER_LEVEL.hp, label: "GWORLD.Secondary.HP" },
  will: { path: "system.purchased.will", step: 1, cost: SECONDARY_COST_PER_LEVEL.will, label: "GWORLD.Secondary.Will" },
  per: { path: "system.purchased.per", step: 1, cost: SECONDARY_COST_PER_LEVEL.per, label: "GWORLD.Secondary.Per" },
  fp: { path: "system.purchased.fp", step: 1, cost: SECONDARY_COST_PER_LEVEL.fp, label: "GWORLD.Secondary.FP" },
  basicSpeed: {
    path: "system.purchased.basicSpeed",
    step: BASIC_SPEED_STEP,
    cost: SECONDARY_COST_PER_LEVEL.basicSpeedQuarter,
    label: "GWORLD.Secondary.BasicSpeed",
  },
  basicMove: { path: "system.purchased.basicMove", step: 1, cost: SECONDARY_COST_PER_LEVEL.basicMove, label: "GWORLD.Secondary.BasicMove" },
});

export type StudyAttribute = keyof typeof STUDY_ATTRIBUTES;

/**
 * What a stretch of study goes into (since API 1.146.0): a skill, an
 * attribute or secondary characteristic, or an advantage learned as if it
 * were a skill (Characters pp. 292, 294).
 */
export interface Studied {
  kind: "skill" | "attribute" | "trait";
  /** The skill or trait item; null for an attribute. */
  item: any;
  /** The attribute's key (`ST`, `DX`, `IQ`, `HT`, `hp`, `will`, `per`, `fp`, `basicSpeed`, `basicMove`); null otherwise. */
  attribute: StudyAttribute | null;
  /** What the card calls it. */
  name: string;
}

/** What a `gworld.studyModifiers` listener is handed (since API 1.133.0). */
export interface StudyModifiers {
  actor: any;
  /** The skill item studied; null when the study is of an attribute or a trait (since API 1.146.0). */
  skill: any;
  /** What is studied, whatever its kind (since API 1.146.0). Frozen. */
  studied: Readonly<Studied>;
  method: StudyMethod;
  /** The hours of the clock spent, to read. */
  hours: number;
  /** The share of `hours` that counts: 1, or what a listener set. */
  multiplier: number;
  /** Strings for the card. */
  lines: string[];
}

/**
 * The hours a stretch of study counts for once the modules have had their say
 * (since API 1.133.0). The method's rate is the book's; what else speeds or
 * slows the learning -- training aids, a trait, a campaign's rule -- is the
 * GM's call (pp. 292-293), so a module makes it through the multiplier. A
 * multiplier that isn't a number of 0 or more counts as 1, and the product is
 * kept to hundredths so the hours banked read cleanly.
 */
export function studyHoursCounted(context: StudyModifiers): { hours: number; multiplier: number; lines: string[] } {
  const asked = callCombatHook<StudyModifiers>(PROCEDURE_HOOKS.studyModifiers, context);
  const raw = asked.multiplier as unknown;
  const n = Number(raw);
  const multiplier = raw !== null && raw !== "" && Number.isFinite(n) && n >= 0 ? n : 1;
  const hours = Math.round(Math.max(0, context.hours) * multiplier * 100) / 100;
  const lines = (Array.isArray(asked.lines) ? asked.lines : [])
    .filter((line): line is string => typeof line === "string" && line.trim() !== "");
  return { hours, multiplier, lines };
}

/** Asks the listeners what the hours count for, with what is studied named. */
function countStudy(actor: any, studied: Studied, hours: number, method: StudyMethod) {
  return studyHoursCounted({
    actor,
    skill: studied.kind === "skill" ? studied.item : null,
    studied: Object.freeze({ ...studied }),
    method,
    hours,
    multiplier: 1,
    lines: [],
  });
}

/** The card for a stretch of study, whatever went into it. */
async function postStudy(options: {
  actor: any;
  name: string;
  hours: number;
  method: StudyMethod;
  counted: { hours: number; multiplier: number; lines: string[] };
  outcome: string;
  banked: number;
  good: boolean;
}): Promise<void> {
  const { counted } = options;
  await post(options.actor, {
    kind: game.i18n.localize("GWORLD.Life.Study"),
    detail: game.i18n.format("GWORLD.Life.Studied", {
      hours: options.hours,
      skill: options.name,
      method: game.i18n.localize(`GWORLD.Life.Method.${options.method}`),
    }),
    lines: [
      // The card says what the hours were worth when a module changed it,
      // so the table can see why the points don't match the clock.
      ...(counted.multiplier !== 1 ? [game.i18n.format("GWORLD.Life.StudyCounted", { hours: counted.hours })] : []),
      ...counted.lines,
      options.outcome,
      game.i18n.format("GWORLD.Life.Banked", { hours: options.banked }),
    ],
    good: options.good,
  });
}

/** Points learned go onto the ledger as an award: a point learned is a point earned. */
function studyAward(actor: any, points: number, name: string): Record<string, unknown> {
  if (points <= 0) return {};
  const awards = [...(actor.system?.points?.awards ?? [])];
  awards.push({ points, note: game.i18n.format("GWORLD.Life.StudyAward", { skill: name }), at: Date.now() });
  return { "system.points.awards": awards };
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

  const name = String(skill.name);
  const counted = countStudy(actor, { kind: "skill", item: skill, attribute: null, name }, options.hours, options.method);
  const result = studyPoints({
    hours: counted.hours,
    method: options.method,
    banked: Number(skill.system?.studyHours) || 0,
  });

  const changes: Record<string, unknown> = { "system.studyHours": result.bankedHours };
  if (result.points > 0) {
    changes["system.points"] = (Number(skill.system?.points) || 0) + result.points;
  }
  await skill.update(changes);

  if (result.points > 0) await actor.update(studyAward(actor, result.points, name));

  await postStudy({
    actor,
    name,
    hours: options.hours,
    method: options.method,
    counted,
    outcome: result.points > 0
      ? game.i18n.format("GWORLD.Life.PointsEarned", { points: result.points })
      : game.i18n.localize("GWORLD.Life.NoPointYet"),
    banked: result.bankedHours,
    good: result.points > 0,
  });

  return result.points;
}

/** The GM's option that lets study raise attributes (since API 1.146.0). */
export const STUDY_ATTRIBUTES_RULE = "studyAttributes";

/**
 * Studies an attribute or secondary characteristic for a stretch of hours.
 *
 * This is a GM's option, not a book rule: the book raises attributes with
 * earned points (Characters p. 290) and lets study reach skills, spells,
 * techniques and some advantages (p. 292). With the `studyAttributes` switch
 * on, the hours count as for a skill, 200 of learning a point, but the score
 * only moves when a whole level is paid for at the p. 290 price -- ten points
 * of HT, five of Will. The hours short of that are banked on the character,
 * and the level's points go onto the ledger as an award. Returns the points
 * the levels gained cost; 0, with nothing done, while the switch is off.
 */
export async function studyAttribute(options: {
  actor: any;
  attribute: StudyAttribute;
  hours: number;
  method: StudyMethod;
}): Promise<number> {
  const { actor } = options;
  if (!isRuleOn(STUDY_ATTRIBUTES_RULE)) return 0;
  if (!mayChange(actor)) return 0;
  if (!Object.prototype.hasOwnProperty.call(STUDY_ATTRIBUTES, options.attribute)) return 0;
  const spec = STUDY_ATTRIBUTES[options.attribute];

  const name = game.i18n.localize(spec.label);
  const counted = countStudy(
    actor,
    { kind: "attribute", item: null, attribute: options.attribute, name },
    options.hours,
    options.method,
  );
  const result = studyLevels({
    hours: counted.hours,
    method: options.method,
    banked: Number(actor.system?.studyHours?.[options.attribute]) || 0,
    levelCost: () => spec.cost,
  });

  const changes: Record<string, unknown> = { [`system.studyHours.${options.attribute}`]: result.bankedHours };
  if (result.levels > 0) {
    const bought = Number(foundry.utils.getProperty(actor, spec.path)) || 0;
    changes[spec.path] = bought + result.levels * spec.step;
    Object.assign(changes, studyAward(actor, result.points, name));
  }
  await actor.update(changes);

  await postStudy({
    actor,
    name,
    hours: options.hours,
    method: options.method,
    counted,
    outcome: result.levels > 0
      ? game.i18n.format("GWORLD.Life.LevelsEarned", { name, amount: result.levels * spec.step, points: result.points })
      : game.i18n.localize("GWORLD.Life.NoLevelYet"),
    banked: result.bankedHours,
    good: result.levels > 0,
  });

  return result.points;
}

/**
 * What the next levels of a trait cost, one at a time: the change in what it
 * is billed, modifiers and all, so the award keeps the ledger even. Null past
 * the book's last level or the table's end. A step that costs 0 points or
 * less -- two levels a cost table prices the same -- stops study there
 * (`studyLevels`), since no hours could be said to pay for it.
 */
function traitLevelCost(trait: any): (n: number) => number | null {
  const system = trait?.system ?? {};
  const table: number[] = Array.isArray(system.costTable) ? system.costTable : [];
  const perLevel = Number(system.pointsPerLevel) || 0;
  const max = Number(system.maxLevels) || 0;
  const levels = Number(system.levels) || 0;
  const cost = (at: number) =>
    traitPoints({
      points: Number(system.points) || 0,
      levels: at,
      pointsPerLevel: perLevel,
      costTable: table,
      modifiers: (system.modifiers ?? []).map((m: { value: unknown }) => Number(m?.value) || 0),
      selfControl: system.selfControl ?? null,
    });
  return (n) => {
    const at = levels + n;
    if (table.length === 0 && perLevel <= 0) return null;
    if (table.length > 0 && at >= table.length) return null;
    if (max > 0 && at >= max) return null;
    return cost(at + 1) - cost(at);
  };
}

/**
 * Whether study can raise a trait: one flagged `learnable` (Learnable
 * Advantages, Characters p. 294), an advantage or perk bought by the level,
 * with a level still to go that costs something.
 */
export function studiableTrait(trait: any): boolean {
  if (trait?.type !== "trait" || trait.system?.learnable !== true) return false;
  if (!["advantage", "perk"].includes(String(trait.system?.category))) return false;
  const next = traitLevelCost(trait)(0);
  return next !== null && next > 0;
}

/**
 * Studies an advantage learned as if it were a skill (Characters p. 294) for a
 * stretch of hours: the trait goes up a level when the hours come to that
 * level's cost at 200 hours of learning a point. The hours short of it are
 * banked on the trait, and the level's points go onto the ledger as an award.
 * Returns the points the levels gained cost.
 */
export async function studyTrait(options: {
  actor: any;
  traitId: string;
  hours: number;
  method: StudyMethod;
}): Promise<number> {
  const { actor } = options;
  if (!mayChange(actor)) return 0;
  const trait = actor.items?.get(options.traitId);
  if (!studiableTrait(trait)) return 0;

  const name = String(trait.name);
  const counted = countStudy(actor, { kind: "trait", item: trait, attribute: null, name }, options.hours, options.method);
  const result = studyLevels({
    hours: counted.hours,
    method: options.method,
    banked: Number(trait.system?.studyHours) || 0,
    levelCost: traitLevelCost(trait),
  });

  const changes: Record<string, unknown> = { "system.studyHours": result.bankedHours };
  if (result.levels > 0) changes["system.levels"] = (Number(trait.system?.levels) || 0) + result.levels;
  await trait.update(changes);
  if (result.levels > 0) await actor.update(studyAward(actor, result.points, name));

  await postStudy({
    actor,
    name,
    hours: options.hours,
    method: options.method,
    counted,
    outcome: result.levels > 0
      ? game.i18n.format("GWORLD.Life.LevelsEarned", { name, amount: result.levels, points: result.points })
      : game.i18n.localize("GWORLD.Life.NoLevelYet"),
    banked: result.bankedHours,
    good: result.levels > 0,
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
  const level = jobRollLevel(actor, String(job.skill ?? ""));
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
