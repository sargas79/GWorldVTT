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
import { stressRollLines } from "./stress.js";
import { abstractNpcSkill, clampBad, hamClausePenalty } from "../rules/tasks-and-feats.js";
import { resolveSuccess } from "../rules/success.js";

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
export function taskRuleLines(context: { actor: any; kind: string; skill?: string; tags: readonly string[]; opponent?: any }): Array<{ label: string; value: number }> {
  // Stress and Derangement's optional penalties (Revised p. 573).
  const lines: Array<{ label: string; value: number }> = stressRollLines(context);
  const ham = hamClauseOf(context.actor);
  if (ham) lines.push({ label: L("HamLine", { trait: ham.trait }), value: ham.penalty });
  const bad = badAppliesTo(context) ? currentBad() : 0;
  if (bad !== 0) lines.push({ label: L("BadLine"), value: bad });
  return lines;
}

/** Whether Basic Abstract Difficulty is the penalty of this roll: a task, not a fight and not a Contest against an NPC with no sheet. */
function badAppliesTo(context: { kind: string; tags: readonly string[]; opponent?: any }): boolean {
  const fighting = context.kind === "attack" || context.kind === "defense";
  const againstUnstatted = context.tags.includes("contest") && !context.opponent;
  return !fighting && !againstUnstatted;
}

/**
 * Whether Basic Abstract Difficulty, being in force for this roll, replaces
 * its situational modifiers (Revised p. 578): those typed at the roll and the
 * scene's own. What the character brings (equipment, disadvantages, held
 * bonuses) stays.
 */
export function badReplacesSituational(context: { kind: string; tags: readonly string[]; opponent?: any }): boolean {
  return badAppliesTo(context) && currentBad() !== 0;
}

/** Ends the Ham Clause of every character in the world: the scene it was invoked in is over. */
export async function endSceneHamClauses(): Promise<number> {
  let ended = 0;
  for (const actor of (game as any).actors ?? []) {
    if (!hamClauseOf(actor)) continue;
    await endHamClause(actor);
    ended += 1;
  }
  return ended;
}

/** Ends the scene's rule effects by hand: every Ham Clause, and the viewed scene's own BAD. */
export async function endScene(scene?: any): Promise<void> {
  const ended = await endSceneHamClauses();
  const target = scene ?? (globalThis as any).canvas?.scene;
  if (target?.getFlag?.(SYSTEM_ID, BAD_KEY) !== undefined && target?.getFlag?.(SYSTEM_ID, BAD_KEY) !== null) await clearSceneBad(target);
  ui.notifications?.info(L("SceneEnded", { count: ended }));
}

/**
 * Sets Basic Abstract Difficulty from a prompt: a penalty, and whether it is
 * the world's, the viewed scene's, or the scene's own dropped again.
 */
export async function promptBad(): Promise<void> {
  const scene = (globalThis as any).canvas?.scene ?? null;
  const own = scene?.getFlag?.(SYSTEM_ID, BAD_KEY);
  const esc = foundry.utils.escapeHTML;
  const result = await foundry.applications.api.DialogV2.prompt({
    window: { title: L("BadDialogTitle") },
    content: `<div class="gworld" style="display:flex;flex-direction:column;gap:6px">
      <p class="hint">${esc(L("BadDialogHint", { bad: currentBad() }))}</p>
      <label style="display:flex;justify-content:space-between;gap:8px"><span>${esc(L("BadValue"))}</span>
        <input type="number" name="bad" value="${Math.abs(currentBad())}" min="0" max="10" step="1" style="width:70px"></label>
      <label style="display:flex;justify-content:space-between;gap:8px"><span>${esc(L("BadWhere"))}</span>
        <select name="where">
          ${scene ? `<option value="scene">${esc(L("BadScene", { name: String(scene.name ?? "") }))}</option>` : ""}
          <option value="world">${esc(L("BadWorld"))}</option>
          ${scene && own !== undefined && own !== null ? `<option value="clear">${esc(L("BadClear"))}</option>` : ""}
        </select></label>
    </div>`,
    ok: {
      label: L("BadSet"),
      callback: (_event: Event, button: HTMLElement) => {
        const root = button.closest<HTMLElement>(".application");
        return {
          bad: Number(root?.querySelector<HTMLInputElement>('input[name="bad"]')?.value) || 0,
          where: String(root?.querySelector<HTMLSelectElement>('select[name="where"]')?.value ?? "world"),
        };
      },
    },
    rejectClose: false,
  });
  if (!result || typeof result !== "object") return;
  const { bad, where } = result as { bad: number; where: string };
  if (where === "clear") await clearSceneBad(scene);
  else await setBad(bad, where === "scene" ? scene : undefined);
}

/**
 * Rolls for an NPC without a sheet at 10 + |BAD| (Revised p. 578) and says
 * how it went. Resolves to the outcome, or null where the switch is off or
 * the dialog was cancelled.
 */
export async function rollUnstattedNpc(): Promise<{ success: boolean; total: number; skill: number } | null> {
  if (!isRuleOn("basicAbstractDifficulty")) {
    ui.notifications?.warn(L("BadOff"));
    return null;
  }
  const esc = foundry.utils.escapeHTML;
  const skill = unstattedNpcSkill();
  const name = await foundry.applications.api.DialogV2.prompt({
    window: { title: L("NpcRollTitle") },
    content: `<div class="gworld"><p class="hint">${esc(L("NpcRollHint", { skill, bad: currentBad() }))}</p>
      <label style="display:flex;justify-content:space-between;gap:8px"><span>${esc(L("NpcRollWho"))}</span>
        <input type="text" name="who" placeholder="${esc(L("NpcRollWhoPlaceholder"))}"></label></div>`,
    ok: {
      label: game.i18n.localize("GWORLD.Chat.Roll"),
      callback: (_event: Event, button: HTMLElement) =>
        String(button.closest<HTMLElement>(".application")?.querySelector<HTMLInputElement>('input[name="who"]')?.value ?? "").trim(),
    },
    rejectClose: false,
  });
  if (typeof name !== "string") return null;
  const roll = new Roll("3d6");
  await roll.evaluate();
  const dice: number[] = (roll as any).dice?.[0]?.results?.map((r: { result: number }) => r.result) ?? [];
  const resolved = resolveSuccess(Number(roll.total), skill, dice);
  const key = resolved.criticalSuccess ? "CriticalSuccess" : resolved.criticalFailure ? "CriticalFailure" : resolved.success ? "Success" : "Failure";
  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker(),
    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    rolls: [roll],
    content:
      `<div class="gworld gworld-chat"><div class="gc-head"><span class="gc-label">${esc(L("NpcRollCard", { who: name || L("NpcRollAnon") }))}</span>` +
      `<span class="gc-target">${esc(String(skill))}</span></div>` +
      `<div class="gc-note">${esc(L("NpcRollLine", { total: Number(roll.total), skill, bad: currentBad() }))}</div>` +
      `<div class="gc-result ${resolved.success ? "success" : "failure"}">${esc(game.i18n.localize(`GWORLD.Roll.${key}`))}</div></div>`,
  });
  return { success: resolved.success, total: Number(roll.total), skill };
}

/**
 * Registers the hooks that end a Ham Clause: with the battle it was invoked
 * in, and with the scene (when another scene is made active, or the active
 * one is turned off).
 */
export function registerTaskRules(): void {
  Hooks.on("deleteCombat", (combat: any, _options: unknown, userId: string) => {
    if (userId !== game.user?.id) return;
    for (const combatant of combat?.combatants ?? []) {
      const actor = combatant.actor;
      if (actor && hamClauseOf(actor)) void endHamClause(actor);
    }
  });
  Hooks.on("updateScene", (_scene: any, change: Record<string, unknown>, _options: unknown, userId: string) => {
    if (userId !== game.user?.id || !game.user?.isGM) return;
    if (change?.active === true || change?.active === false) void endSceneHamClauses();
  });
}
