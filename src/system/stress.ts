/**
 * Stress and Derangement (Basic Set Revised pp. 572-573): "mental FP" and
 * "mental HP", an optional rule. Both are kept on the character as counts
 * (`system.stress`, `system.derangement`), so the book's "-3 Stress" is 3.
 *
 * Fright Checks add to them (`fright.ts`), resting takes Stress off (`recovery.ts`),
 * a Will roll at a day's end sheds Derangement, and the optional penalties
 * reach the rolls the book names through `taskRuleLines`.
 */

import { isRuleOn } from "./optional-rules.js";
import { skillLevelOf } from "./skill-level.js";
import {
  CLINICIAN_SKILL,
  addHardship,
  cureByPoints,
  dayWasQuiet,
  daysEnded,
  derangementPowerModifier,
  derangementRecoveryTarget,
  derangementRollPenalty,
  stressRecovered,
  stressRollPenalty,
  stressShedByClock,
  type FrightKind,
} from "../rules/stress.js";
import { resolveSuccess } from "../rules/success.js";
import { SYSTEM_ID } from "./constants.js";
import { everyActor } from "./every-actor.js";

/** Flags on a character: when the last hardship was inflicted, and the seconds of rest not yet a whole 10 minutes. */
const LAST_HARDSHIP_FLAG = "mentalLastHardship";
const CLOCK_CARRY_FLAG = "mentalClockCarry";
/** Marks the item that holds the points Derangement's overflow turned permanent. */
const PERMANENT_FLAG = "derangementOverflow";

const worldTime = (): number => Number((globalThis as { game?: { time?: { worldTime?: number } } }).game?.time?.worldTime) || 0;

const L = (key: string, data?: Record<string, unknown>) =>
  data ? game.i18n.format(`GWORLD.Stress.${key}`, data) : game.i18n.localize(`GWORLD.Stress.${key}`);

/** Skills that demand a steady hand, where Stress/2 applies (p. 573: "e.g., Explosives and Surgery"). */
export const STEADY_HAND_SKILLS: readonly string[] = ["Explosives", "Surgery"];

/** Whether the rule is in play. */
export function stressOn(): boolean {
  return isRuleOn("stressAndDerangement");
}

/** An actor's Stress and Derangement, as counts. */
export function mentalOf(actor: any): { stress: number; derangement: number; limit: number } {
  return {
    stress: Math.max(0, Number(actor?.system?.stress) || 0),
    derangement: Math.max(0, Number(actor?.system?.derangement) || 0),
    limit: Math.max(0, Number(actor?.system?.derived?.will) || 0),
  };
}

/** Levels of Fearlessness, which reduce Stress penalties (never Derangement's). */
export function fearlessnessLevels(actor: any): number {
  let levels = 0;
  for (const item of actor?.items ?? []) {
    if (item?.type === "trait" && /^fearlessness\b/i.test(String(item.name ?? ""))) {
      levels += Math.max(1, Number(item.system?.levels) || 1);
    }
  }
  return levels;
}

async function post(actor: any, html: string): Promise<void> {
  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    content: `<div class="gworld gworld-chat"><p>${html}</p></div>`,
  });
}

/**
 * Adds Stress (an ordinary Fright Check) or Derangement (a sanity-blasting
 * one) to an actor, applying the limits, and says so in chat. Returns what the
 * character now has and the points of permanent disadvantages the overflow
 * turns into; null where the rule is off or the actor can't be changed.
 */
export async function applyHardship(actor: any, options: { kind: FrightKind; amount: number }): Promise<{
  stress: number;
  derangement: number;
  permanentPoints: number;
} | null> {
  if (!stressOn() || !actor?.isOwner || !(options.amount > 0)) return null;
  const now = mentalOf(actor);
  const result = addHardship({ stress: now.stress, derangement: now.derangement, will: now.limit, kind: options.kind, amount: options.amount });
  await actor.update({ "system.stress": result.stress, "system.derangement": result.derangement });
  // A day that inflicts new hardship is no day's end for the Derangement roll.
  await actor.setFlag?.(SYSTEM_ID, LAST_HARDSHIP_FLAG, worldTime());
  // What the limit could not hold is now points of permanent mental disadvantages (p. 573).
  if (result.permanentPoints > 0) await addPermanentDisadvantage(actor, result.permanentPoints);
  await post(
    actor,
    L("Gained", {
      name: String(actor.name ?? ""),
      amount: options.amount,
      what: L(options.kind === "sanity" ? "Derangement" : "Stress"),
      stress: result.stress,
      derangement: result.derangement,
    }) + (result.permanentPoints > 0 ? ` ${L("Permanent", { points: result.permanentPoints })}` : ""),
  );
  return result;
}

/** Takes Stress off for rest: 1 per 10 minutes, 1 more for an indulgence. Returns the Stress shed. */
export async function recoverStress(actor: any, options: { minutes: number; indulgence?: boolean }): Promise<number> {
  if (!stressOn() || !actor?.isOwner) return 0;
  const { stress } = mentalOf(actor);
  const shed = Math.min(stress, stressRecovered(options));
  if (shed <= 0) return 0;
  await actor.update({ "system.stress": stress - shed });
  await post(actor, L("Recovered", { name: String(actor.name ?? ""), shed, stress: stress - shed }));
  return shed;
}

/**
 * The day's end for a character with Derangement (p. 573): a Will roll sheds 1,
 * +1 with a clinician of skill 12 or better, whose own roll against their skill
 * sheds another. The GM calls it only for a day with no new Stress or
 * Derangement.
 */
export async function rollDerangementDayEnd(options: { actor: any; clinicianSkill?: number }): Promise<{ shed: number } | null> {
  const { actor } = options;
  if (!stressOn() || !actor?.isOwner) return null;
  const { derangement } = mentalOf(actor);
  if (derangement <= 0) return { shed: 0 };
  const clinician = (options.clinicianSkill ?? 0) >= CLINICIAN_SKILL;
  const will = Number(actor.system?.derived?.will) || 10;
  const target = derangementRecoveryTarget({ will, clinician });
  const own = new Roll("3d6");
  await own.evaluate();
  const ownDice = own.dice?.[0]?.results?.map((r: { result: number }) => r.result) ?? [];
  let shed = resolveSuccess(own.total, target, ownDice).success ? 1 : 0;
  const rolls = [own];
  let therapy = "";
  if (clinician) {
    const therapist = new Roll("3d6");
    await therapist.evaluate();
    const dice = therapist.dice?.[0]?.results?.map((r: { result: number }) => r.result) ?? [];
    const ok = resolveSuccess(therapist.total, options.clinicianSkill as number, dice).success;
    if (ok) shed += 1;
    rolls.push(therapist);
    therapy = ` ${L(ok ? "TherapyHelped" : "TherapyFailed", { skill: options.clinicianSkill as number, roll: therapist.total })}`;
  }
  shed = Math.min(shed, derangement);
  if (shed > 0) await actor.update({ "system.derangement": derangement - shed });
  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    content: `<div class="gworld gworld-chat"><p>${L("DayEndCard", { name: String(actor.name ?? ""), target, roll: own.total, shed, derangement: derangement - shed })}${therapy}</p>${derangement - shed > 0 ? `<p><small>${L("TreatmentPointer")}</small></p>` : ""}</div>`,
    rolls,
  });
  return { shed };
}

/** A clinician's level: the better of Psychology (Clinical) and Physician (Psychiatric), or null. */
export function clinicianSkillOf(actor: any): number | null {
  const levels = ["Psychology (Clinical)", "Physician (Psychiatric)"]
    .map((name) => skillLevelOf(actor, name))
    .filter((n): n is number => typeof n === "number");
  return levels.length ? Math.max(...levels) : null;
}

/**
 * A point of a new mental disadvantage buys off Stress (all of it) or 2
 * Derangement (p. 573). The disadvantage itself is the player's to add; this
 * takes the hardship off.
 */
export async function buyOffHardship(actor: any, options: { points: number; target: "stress" | "derangement" }): Promise<boolean> {
  if (!stressOn() || !actor?.isOwner) return false;
  const now = mentalOf(actor);
  const next = cureByPoints({ stress: now.stress, derangement: now.derangement, points: options.points, target: options.target });
  if (next.stress === now.stress && next.derangement === now.derangement) return false;
  await actor.update({ "system.stress": next.stress, "system.derangement": next.derangement });
  await post(actor, L("Cured", { name: String(actor.name ?? ""), stress: next.stress, derangement: next.derangement }));
  return true;
}

/**
 * The lines the optional penalties put on a success roll (p. 573): Stress/2 on
 * a self-control roll, a steady-hand skill and a HT roll against disease,
 * reduced by Fearlessness and never a bonus; Derangement/2 on an Influence roll.
 */
export function stressRollLines(context: { actor: any; kind: string; skill?: string; tags: readonly string[] }): Array<{ label: string; value: number }> {
  if (!stressOn()) return [];
  const lines: Array<{ label: string; value: number }> = [];
  const { stress, derangement } = mentalOf(context.actor);
  if (isRuleOn("stressRollPenalties") && stress > 0) {
    const skill = String(context.skill ?? "").replace(/\s*\(.*\)$/, "").trim().toLowerCase();
    const steady = STEADY_HAND_SKILLS.some((s) => s.toLowerCase() === skill);
    const disease = context.tags.includes("disease");
    if (context.kind === "selfControl" || steady || disease) {
      const value = stressRollPenalty(stress, fearlessnessLevels(context.actor));
      if (value !== 0) lines.push({ label: L("Line"), value });
    }
  }
  if (isRuleOn("derangementRollPenalties") && derangement > 0 && context.tags.includes("influence")) {
    const value = derangementRollPenalty(derangement);
    if (value !== 0) lines.push({ label: L("DerangementLine"), value });
  }
  lines.push(...derangementPowerLines(context));
  return lines;
}

/**
 * Turns points of Derangement beyond the limit into permanent mental
 * disadvantages (p. 573): one disadvantage on the character that holds them,
 * named for what it is, which the player renames and splits as they choose.
 * Points already turned permanent are added to. Returns the points it now
 * holds, or null where nothing could be added.
 */
export async function addPermanentDisadvantage(actor: any, points: number): Promise<number | null> {
  if (!actor?.isOwner || !(points > 0)) return null;
  const held = [...(actor.items ?? [])].find((item: any) => item?.type === "trait" && item.getFlag?.(SYSTEM_ID, PERMANENT_FLAG) === true);
  if (held) {
    const total = Math.abs(Number(held.system?.points) || 0) + points;
    await held.update({ "system.points": -total });
    return total;
  }
  await actor.createEmbeddedDocuments("Item", [{
    name: L("PermanentName"),
    type: "trait",
    system: { category: "disadvantage", points: -points, description: `<p>${L("PermanentDescription")}</p>` },
    flags: { [SYSTEM_ID]: { [PERMANENT_FLAG]: true } },
  }]);
  return points;
}

/** Whether an actor is in a battle that has begun, where time passes by rounds and not by rest. */
function inBattle(actor: any): boolean {
  for (const combat of (globalThis as { game?: { combats?: Iterable<any> } }).game?.combats ?? []) {
    if (!combat?.started) continue;
    for (const combatant of combat.combatants ?? []) if (combatant?.actor === actor) return true;
  }
  return false;
}

/**
 * Lets the world clock's advance work on an actor's hardship (p. 573): Stress
 * bleeds off 1 per 10 minutes, and each midnight that closes a day without
 * new Stress or Derangement is the day's end, for the Derangement roll. A
 * character in a battle is not at rest. Without the switch nothing happens.
 */
export async function mentalTimePasses(actor: any, options: { from: number; to: number }): Promise<{ shed: number; days: number }> {
  const none = { shed: 0, days: 0 };
  if (!stressOn() || !isRuleOn("mentalOnTheClock") || !actor?.isOwner || inBattle(actor)) return none;
  const { stress, derangement } = mentalOf(actor);
  const elapsed = options.to - options.from;
  if (!(elapsed > 0)) return none;
  let shed = 0;
  const carried = Number(actor.getFlag?.(SYSTEM_ID, CLOCK_CARRY_FLAG)) || 0;
  if (stress > 0) {
    const clock = stressShedByClock(carried, elapsed);
    if (clock.carry !== carried) await actor.setFlag?.(SYSTEM_ID, CLOCK_CARRY_FLAG, clock.carry);
    if (clock.shed > 0) shed = await recoverStress(actor, { minutes: clock.shed * 10 });
  } else if (carried !== 0) {
    await actor.unsetFlag?.(SYSTEM_ID, CLOCK_CARRY_FLAG);
  }
  let days = 0;
  if (derangement > 0) {
    const last = actor.getFlag?.(SYSTEM_ID, LAST_HARDSHIP_FLAG);
    const lastHardship = typeof last === "number" ? last : null;
    for (const dayStart of daysEnded(options.from, options.to)) {
      if (!dayWasQuiet(dayStart, lastHardship)) continue;
      if (mentalOf(actor).derangement <= 0) break;
      await rollDerangementDayEnd({ actor });
      days++;
    }
  }
  return { shed, days };
}

/** Registers the world-time hook that lets the clock rest an actor's Stress and close a day for Derangement. */
export function registerStressHooks(): void {
  Hooks.on("updateWorldTime", (time: number, delta: number) => {
    if (!game.user?.isGM || !stressOn() || !isRuleOn("mentalOnTheClock")) return;
    const elapsed = Number(delta) || 0;
    if (elapsed <= 0) return;
    for (const actor of everyActor()) void mentalTimePasses(actor, { from: Number(time) - elapsed, to: Number(time) });
  });
}

/**
 * The line Derangement puts on a roll for a supernatural power (p. 573):
 * Derangement/2 against the powers that need a focused mind or chi, and
 * against resisting an evil one that causes more Derangement, and a bonus of
 * that size to use such an evil one. The roll says which it is by its tags:
 * `power` or `supernatural` for a power's roll, `evil` for one that
 * causes Derangement, `resist` for resisting one.
 */
export function derangementPowerLines(context: { tags: readonly string[]; actor: any }): Array<{ label: string; value: number }> {
  if (!stressOn() || !isRuleOn("derangementRollPenalties")) return [];
  const evil = context.tags.includes("evil");
  const power = context.tags.includes("power") || context.tags.includes("supernatural") || evil;
  if (!power) return [];
  const { derangement } = mentalOf(context.actor);
  const value = derangementPowerModifier(derangement, { evil, resisting: context.tags.includes("resist") });
  return value === 0 ? [] : [{ label: L("DerangementPowerLine"), value }];
}
