/**
 * Extra Effort Extras (Basic Set Revised pp. 571-572): extra effort with
 * powers, Godlike Extra Effort, FP traded for skill and for resistance, and
 * Combining ST. The combat options and the cap are pure rules
 * (`rules/extra-effort-extras.ts`) that the add-on's Martial Arts options
 * still hold until it retires them.
 */

import { isRuleOn } from "./optional-rules.js";
import { spendFatigue } from "./extra-effort.js";
import { addPendingModifier } from "./pending-modifiers.js";
import {
  MARCHING_SKILLS,
  POWER_EFFORT_MAX_PERCENT,
  combinedBasicLift,
  combinedStrength,
  fatigueForSkillBonus,
  godlikeEffect,
  powerEffortCost,
  powerEffortTarget,
} from "../rules/extra-effort-extras.js";
import { resolveSuccess } from "../rules/success.js";

/** The source a held fatigue-for-skill bonus carries. */
export const FATIGUE_TRADE_SOURCE = "fatigueTrade";

const L = (key: string, data?: Record<string, unknown>) =>
  data ? game.i18n.format(`GWORLD.ExtraEffort.${key}`, data) : game.i18n.localize(`GWORLD.ExtraEffort.${key}`);

/** What a power's extra effort came to. */
export interface PowerEffortResult {
  success: boolean;
  criticalSuccess: boolean;
  criticalFailure: boolean;
  /** The increase gained, as a percentage (Godlike: multiplied by the FP spent); 0 on a failure. */
  percentGained: number;
  fpPaid: number;
  target: number;
}

/**
 * Rolls extra effort with a power (pp. 571-572): Will at -1 per 5% of increase
 * (at most 100%), +5 motivated, plus the power's Talent. The FP are paid after
 * the roll, 1 a roll unless Godlike Extra Effort spends more; a critical
 * success is free. In combat the caller rolls the attack or defense instead
 * and only asks the cost of `powerEffortFp`.
 */
export async function rollPowerExtraEffort(options: {
  actor: any;
  percentIncrease: number;
  motivated?: boolean;
  talent?: number;
  /** Godlike Extra Effort: FP spent, each multiplying the bonus. Ignored where the switch is off. */
  fpSpent?: number;
}): Promise<PowerEffortResult | null> {
  const { actor } = options;
  if (!isRuleOn("powerExtraEffort") || !actor?.isOwner) return null;
  const godlike = isRuleOn("godlikeExtraEffort");
  const fpSpent = godlike ? Math.max(1, Math.floor(options.fpSpent ?? 1)) : 1;
  const will = Number(actor.system?.derived?.will) || 10;
  const percent = Math.max(0, options.percentIncrease);
  const target = powerEffortTarget({
    will,
    percentIncrease: percent,
    motivated: options.motivated === true,
    talent: options.talent ?? 0,
    uncapped: godlike,
  });
  const roll = new Roll("3d6");
  await roll.evaluate();
  const dice = roll.dice?.[0]?.results?.map((r: { result: number }) => r.result) ?? [];
  const outcome = resolveSuccess(roll.total, target, dice);
  const asked = godlike ? percent : Math.min(POWER_EFFORT_MAX_PERCENT, percent);
  const gained = outcome.success ? (godlike ? godlikeEffect(asked, fpSpent) : asked) : 0;

  const cost = powerEffortCost({ criticalSuccess: outcome.criticalSuccess, fpSpent });
  let paid = 0;
  if (cost > 0) paid = (await spendFatigue(actor, cost, L("PowerTitle"))) ? cost : 0;

  const detail = outcome.criticalFailure
    ? L("PowerCriticalFailure", { natural: roll.total === 18 ? L("PowerNaturalEighteen") : "" })
    : outcome.criticalSuccess
      ? L("PowerCriticalSuccess", { percent: gained })
      : outcome.success
        ? L("PowerSuccess", { percent: gained })
        : L("PowerFailure");
  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    content: `<p><strong>${L("PowerTitle")}</strong> (+${asked}%): ${target} — ${roll.total}. ${detail} ${L("Spent", { fp: paid })}</p>`,
    rolls: [roll],
  });
  return { success: outcome.success, criticalSuccess: outcome.criticalSuccess, criticalFailure: outcome.criticalFailure, percentGained: gained, fpPaid: paid, target };
}

/**
 * Trades FP for a bonus on the next roll (p. 572): 1 FP per +1, up to +4, no
 * Will roll. `kind` "skill" holds it for the next skill roll (an attack, where
 * the GM allows it, as `attack`); "resistance" for the next attribute roll of
 * a defender resisting an ability. Returns the bonus held, 0 where none.
 */
export async function tradeFatigueForBonus(options: {
  actor: any;
  fp: number;
  kind: "skill" | "attack" | "resistance";
}): Promise<number> {
  const { actor } = options;
  if (!isRuleOn("fatigueForSkill") || !actor?.isOwner) return 0;
  const bonus = fatigueForSkillBonus(options.fp);
  if (bonus <= 0) return 0;
  if (!(await spendFatigue(actor, bonus, L("TradeTitle")))) return 0;
  const id = await addPendingModifier(actor, {
    label: L(options.kind === "resistance" ? "TradeResistanceLine" : "TradeSkillLine"),
    value: bonus,
    source: FATIGUE_TRADE_SOURCE,
    tags: [options.kind === "resistance" ? "attribute" : options.kind],
  });
  if (id) ui.notifications?.info(L("TradeHeld", { bonus }));
  return id ? bonus : 0;
}

/** The FP a power's extra effort costs in combat, per use: 1, or the Godlike multiple. */
export function powerEffortFp(fpSpent = 1): number {
  return isRuleOn("godlikeExtraEffort") ? Math.max(1, Math.floor(fpSpent)) : 1;
}

/** Whether anybody in a group has a skill that makes marching pace better (p. 572). */
export function isSkilledMarcher(actors: readonly any[]): boolean {
  return actors.some((actor) =>
    [...(actor?.items ?? [])].some((item: any) => {
      if (item?.type !== "skill") return false;
      const name = String(item.name ?? "").toLowerCase();
      return MARCHING_SKILLS.some((skill) => {
        const wanted = skill.toLowerCase();
        return wanted.includes("(") ? name.startsWith("professional skill") && name.includes("trail guide") : name === wanted || name.startsWith(wanted + " ") || name.startsWith(wanted + "/");
      });
    }),
  );
}

/**
 * Combining ST (p. 572): the group's Basic Lift and effective ST, from the
 * actors' Basic Lift. Only actors with a Basic Lift count.
 */
export function combiningSt(actors: readonly any[]): { basicLift: number; st: number; count: number } {
  const lifts = actors.map((a) => Number(a?.system?.derived?.basicLift)).filter((n) => Number.isFinite(n) && n > 0);
  return { basicLift: combinedBasicLift(lifts), st: combinedStrength(lifts), count: lifts.length };
}

/** Posts the combined Basic Lift and ST of a group to chat. */
export async function postCombiningSt(actors: readonly any[]): Promise<{ basicLift: number; st: number; count: number }> {
  const result = combiningSt(actors);
  await ChatMessage.implementation.create({
    content: `<p>${L("CombiningSt", { count: result.count, bl: result.basicLift, st: result.st })}</p>`,
  });
  return result;
}

