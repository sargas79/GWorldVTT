/**
 * Staying conscious at 0 HP or less (GURPS Basic Set: Campaigns p. 419).
 *
 * "Make a HT roll at the start of your next turn, at -1 per full multiple of
 * HP below zero. Failure means you fall unconscious ... Success means you can
 * act normally, but must roll again every turn to continue functioning." A
 * turn of Do Nothing with no defense rolls needs no roll, which only the table
 * knows, so the roll is offered rather than made: on a card the GM's client
 * posts at the start of each such turn, and, with no combat running to have
 * turns, on the damage card itself.
 */

import { SYSTEM_ID } from "./constants.js";
import { consciousnessRollPenalty } from "../rules/injury.js";
import { attributeOf } from "./attributes.js";
import { traitsOf } from "./damage.js";
import { setCondition, hasCondition } from "./conditions.js";
import { rollSuccess } from "./roll.js";
import { PROCEDURE_HOOKS } from "./procedure-extensions.js";
import { callCombatHook } from "./combat-extensions.js";
import { rollOnce } from "./card-buttons.js";

/** Who owes a roll to stay conscious, and at what, as a card records it. */
export interface ConsciousnessEntry {
  uuid: string;
  name: string;
  /** The penalty for HP below zero; traits are added when the roll is made. */
  modifier: number;
}

const FLAG = "consciousness";

/**
 * Rolls HT to stay conscious, and puts a failure on the character. Resolves
 * to whether the roll was made: not by a user who does not own the character,
 * nor where a listener refused it.
 */
export async function rollConsciousness(actor: any, penalty: number): Promise<boolean> {
  if (!actor?.isOwner) return false;
  const traits = traitsOf(actor);
  const bonus = (Number(traits.consciousness) || 0) + (Number(traits.htRolls) || 0);
  const modifiers = [
    ...(penalty ? [{ label: game.i18n.localize("GWORLD.Consciousness.BelowZero"), value: penalty }] : []),
    ...(bonus ? [{ label: game.i18n.localize("GWORLD.Consciousness.Traits"), value: bonus }] : []),
  ];
  const outcome = await rollSuccess({
    actor,
    base: attributeOf(actor, "HT"),
    label: game.i18n.localize("GWORLD.Consciousness.Label"),
    kind: "attribute",
    modifiers,
    tags: ["consciousness", "HT"],
    // Staying conscious is resisting the injury, not an attempt, so it is
    // rolled however far below zero the HP have gone: at an effective 1 or 2
    // only a 3 or 4 keeps the character up (since API 1.121.0).
    resistance: true,
  });
  if (!outcome) return false;
  const previousPosture = String(actor.system?.posture ?? "standing");
  if (!outcome.success) {
    await actor.update({ "system.posture": "lying" });
    await setCondition(actor, "prone", true);
    await setCondition(actor, "unconscious", true);
    ui.notifications?.warn(game.i18n.format("GWORLD.Consciousness.Out", { name: String(actor.name ?? "") }));
  }
  // The modules hear it, and may take a failure back (since 1.43.0).
  callCombatHook(PROCEDURE_HOOKS.afterConsciousnessRoll, { actor, outcome, previousPosture });
  return true;
}

/** The entries a card records, for the characters a blow took to 0 HP or less. */
export function consciousnessEntries(results: Array<{ actor: any; required: boolean; penalty: number }>): ConsciousnessEntry[] {
  return results
    .filter((r) => r.required)
    .map((r) => ({ uuid: String(r.actor?.uuid ?? ""), name: String(r.actor?.name ?? ""), modifier: r.penalty }));
}

/** Adds the roll's control to a card, for each character it names that this user owns. */
export async function addConsciousnessControls(message: any, html: HTMLElement): Promise<void> {
  const entries = message?.getFlag?.(SYSTEM_ID, FLAG) as ConsciousnessEntry[] | undefined;
  if (!Array.isArray(entries) || entries.length === 0) return;
  const root = html.querySelector<HTMLElement>(".gworld-chat");
  if (!root || root.querySelector("[data-gworld-conscious]")) return;
  for (const entry of entries) {
    const actor: any = await fromUuid(entry.uuid).catch(() => null);
    if (!actor?.isOwner || hasCondition(actor, "unconscious") || hasCondition(actor, "dead")) continue;
    const row = document.createElement("div");
    row.className = "gc-apply";
    row.dataset.gworldConscious = entry.uuid;
    const who = document.createElement("div");
    who.className = "gc-who";
    who.textContent = entry.name;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "gc-apply-button";
    const label = game.i18n.localize("GWORLD.Consciousness.Roll");
    button.textContent = entry.modifier ? `${label} ${entry.modifier > 0 ? "+" : ""}${entry.modifier}` : label;
    // A refused roll gives the button back, so it can still be made.
    button.addEventListener("click", rollOnce(button, () => rollConsciousness(actor, entry.modifier)));
    row.append(who, button);
    root.append(row);
  }
}

/** At the start of a turn at 0 HP or less, the GM's client posts the roll for it. */
export function registerConsciousnessTurns(): void {
  Hooks.on(PROCEDURE_HOOKS.turnStart, (_combat: any, combatant: any) => {
    const activeGm = (game as any).users?.activeGM;
    if (!(activeGm ? activeGm.isSelf : game.user?.isGM)) return;
    const actor = combatant?.actor;
    if (!actor || (actor.type !== "character" && actor.type !== "npc")) return;
    const hp = Number(actor.system?.hp?.value);
    const maxHp = Number(actor.system?.hp?.max) || 10;
    if (!Number.isFinite(hp) || hp > 0) return;
    if (hasCondition(actor, "unconscious") || hasCondition(actor, "dead")) return;
    const entry: ConsciousnessEntry = { uuid: String(actor.uuid), name: String(actor.name ?? ""), modifier: consciousnessRollPenalty(hp, maxHp) };
    void ChatMessage.implementation.create({
      speaker: ChatMessage.implementation.getSpeaker({ actor }),
      content: `<div class="gworld gworld-chat"><div class="gc-head"><span class="gc-label">${game.i18n.localize("GWORLD.Consciousness.Label")}</span></div><p class="gc-note">${foundry.utils.escapeHTML(game.i18n.format("GWORLD.Consciousness.TurnStart", { name: String(actor.name ?? "") }))}</p></div>`,
      flags: { [SYSTEM_ID]: { [FLAG]: [entry] } },
    });
  });
}
