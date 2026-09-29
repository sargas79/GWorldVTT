/**
 * Tasks and feats (Basic Set Revised pp. 570, 578): the Ham Clause and Basic
 * Abstract Difficulty, as the modifiers they put on success rolls.
 *
 * The Ham Clause is a scene condition on the actor: a disadvantage the player
 * invoked, kept as a flag with the penalty it costs, read by every success
 * roll the actor makes and cleared when the fight it was invoked in is over,
 * or by the trait's own button.
 *
 * Basic Abstract Difficulty is a world setting with a scene override, applied
 * as one line on the rolls of tasks when its switch is on.
 */

import { SYSTEM_ID } from "./constants.js";
import { isRuleOn } from "./optional-rules.js";
import { abstractNpcSkill, clampBad, hamClausePenalty } from "../rules/tasks-and-feats.js";

/** The actor flag holding the invoked disadvantage. */
export const HAM_CLAUSE_FLAG = "hamClause";

/** The world setting holding Basic Abstract Difficulty, and the scene flag that overrides it. */
export const BAD_KEY = "basicAbstractDifficulty";

export interface HamClause {
  /** The disadvantage invoked, by name. */
  trait: string;
  /** Its point value, negative. */
  points: number;
  /** The penalty it puts on every success roll. */
  penalty: number;
}

const L = (key: string, data?: Record<string, unknown>) =>
  data ? game.i18n.format(`GWORLD.Tasks.${key}`, data) : game.i18n.localize(`GWORLD.Tasks.${key}`);

/** Registers the world setting. Called once, at init, with the others. */
export function registerTaskSettings(): void {
  game.settings.register(SYSTEM_ID, BAD_KEY, {
    name: "GWORLD.Tasks.BadSetting",
    hint: "GWORLD.Tasks.BadSettingHint",
    scope: "world",
    config: true,
    type: Number,
    default: 0,
  });
}

/** The invoked disadvantage on an actor, or null. */
export function hamClauseOf(actor: any): HamClause | null {
  const flag = actor?.getFlag?.(SYSTEM_ID, HAM_CLAUSE_FLAG);
  if (!flag || typeof flag !== "object") return null;
  const penalty = Number(flag.penalty);
  return Number.isFinite(penalty) && penalty < 0 ? { trait: String(flag.trait ?? ""), points: Number(flag.points) || 0, penalty } : null;
}

/** Whether a trait is a disadvantage a player may invoke: one with a negative cost. */
export function canInvokeHamClause(item: any): boolean {
  return item?.type === "trait" && (Number(item.system?.totalPoints ?? item.system?.points) || 0) < 0;
}

/** Invokes a disadvantage for the scene (p. 570), and says so in chat. Replaces any invoked before it. */
export async function invokeHamClause(actor: any, item: any): Promise<HamClause | null> {
  if (!canInvokeHamClause(item)) return null;
  const points = Number(item.system?.totalPoints ?? item.system?.points) || 0;
  const clause: HamClause = { trait: String(item.name ?? ""), points, penalty: hamClausePenalty(points) };
  await actor.setFlag(SYSTEM_ID, HAM_CLAUSE_FLAG, clause);
  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    content: `<p>${L("HamInvoked", { name: String(actor.name ?? ""), trait: clause.trait, penalty: clause.penalty })}</p>`,
  });
  return clause;
}

/** Ends the Ham Clause on an actor. */
export async function endHamClause(actor: any): Promise<void> {
  if (hamClauseOf(actor)) await actor.unsetFlag(SYSTEM_ID, HAM_CLAUSE_FLAG);
}

/**
 * The current Basic Abstract Difficulty, 0 to -10: the viewed scene's own where
 * it has one, else the world's. Zero while the switch is off.
 */
export function currentBad(scene?: any): number {
  if (!isRuleOn("basicAbstractDifficulty")) return 0;
  const own = (scene ?? (globalThis as any).canvas?.scene)?.getFlag?.(SYSTEM_ID, BAD_KEY);
  if (own !== undefined && own !== null && own !== "") return clampBad(Number(own));
  let world: unknown = 0;
  try {
    world = game.settings.get(SYSTEM_ID, BAD_KEY);
  } catch {
    world = 0;
  }
  return clampBad(Number(world));
}

/** Sets Basic Abstract Difficulty: the scene's own where one is given, else the world's. */
export async function setBad(value: number, scene?: any): Promise<number> {
  const bad = clampBad(value);
  if (scene) await scene.setFlag(SYSTEM_ID, BAD_KEY, bad);
  else await game.settings.set(SYSTEM_ID, BAD_KEY, bad);
  return bad;
}

/** Drops a scene's own Basic Abstract Difficulty, so the world's applies again. */
export async function clearSceneBad(scene: any): Promise<void> {
  await scene?.unsetFlag?.(SYSTEM_ID, BAD_KEY);
}

/** An unstatted NPC's effective skill at the current BAD (p. 578). */
export function unstattedNpcSkill(scene?: any): number {
  return abstractNpcSkill(currentBad(scene));
}

/**
 * The lines the two rules put on a success roll. BAD is the penalty of a task,
 * so a fighting roll (whose range and size the combat rules already price) does
 * not take it, and neither does the player's side of a Contest against an
 * opponent with no sheet, whose 10 + |BAD| has it counted already.
 */
export function taskRuleLines(context: { actor: any; kind: string; tags: readonly string[]; opponent?: any }): Array<{ label: string; value: number }> {
  const lines: Array<{ label: string; value: number }> = [];
  const ham = hamClauseOf(context.actor);
  if (ham) lines.push({ label: L("HamLine", { trait: ham.trait }), value: ham.penalty });
  const fighting = context.kind === "attack" || context.kind === "defense";
  const againstUnstatted = context.tags.includes("contest") && !context.opponent;
  const bad = fighting || againstUnstatted ? 0 : currentBad();
  if (bad !== 0) lines.push({ label: L("BadLine"), value: bad });
  return lines;
}

/** Registers the hook that ends a Ham Clause with the battle it was invoked in. */
export function registerTaskRules(): void {
  Hooks.on("deleteCombat", (combat: any, _options: unknown, userId: string) => {
    if (userId !== game.user?.id) return;
    for (const combatant of combat?.combatants ?? []) {
      const actor = combatant.actor;
      if (actor && hamClauseOf(actor)) void endHamClause(actor);
    }
  });
}
