/**
 * Using a trait that asks something of its user (GURPS Basic Set Revised
 * pp. 330-332, Characters p. 116): the roll-to-use button on a trait's row.
 *
 * Each Requires (Attribute), (Skill) and Active Defense Roll is made in turn,
 * then the Unreliable/Activation roll; Hard to Use and Reliable are lines on
 * every roll but the defense. A use that fails any of them does not work. What
 * the ability costs -- Costs Fatigue, Costs Hit Points -- is paid for the
 * attempt, since "each use" costs whether or not it takes.
 */
import type { RollModifier } from "./roll.js";
import { rollSuccess } from "./roll.js";
import { spendFatigueFor, spendHitPointsFor } from "./fatigue.js";

export interface AbilityUseResult {
  /** True where every roll succeeded (or there were none to make). */
  success: boolean;
  /** Each roll made, in order, with how it came out. */
  rolls: Array<{ label: string; success: boolean }>;
  fpSpent: number;
  hpSpent: number;
}

/** The entry of `derived.abilityRolls` for a trait, or null for one that asks nothing. */
export function abilityRollsFor(actor: any, itemId: string): any | null {
  const list = actor?.system?.derived?.abilityRolls;
  return Array.isArray(list) ? list.find((entry: any) => String(entry.id) === String(itemId)) ?? null : null;
}

/** Asks for a score the sheet doesn't know, such as the level of the skill a Requires Skill Roll names. */
async function askForScore(label: string): Promise<number | null> {
  const result = await foundry.applications.api.DialogV2.prompt({
    window: { title: label },
    content: `<div class="gworld"><label style="display:flex;align-items:center;gap:8px">
      <span>${game.i18n.localize("GWORLD.Ability.ScorePrompt")}</span>
      <input type="number" name="score" value="10" step="1" autofocus style="width:80px"></label></div>`,
    ok: {
      label: game.i18n.localize("GWORLD.Chat.Roll"),
      callback: async (_event: Event, button: HTMLElement) => {
        const input = button.closest<HTMLElement>(".application")?.querySelector<HTMLInputElement>('input[name="score"]');
        return Number(input?.value ?? 0);
      },
    },
    rejectClose: false,
  });
  return typeof result === "number" && Number.isFinite(result) ? result : null;
}

/**
 * Makes the rolls to use a trait and pays what the use costs. Null for a user
 * who doesn't own the actor, a trait that asks nothing, or a roll the user
 * backed out of (nothing is paid then).
 */
export async function useAbility(actor: any, itemId: string): Promise<AbilityUseResult | null> {
  if (!actor?.isOwner) return null;
  const entry = abilityRollsFor(actor, itemId);
  if (!entry) return null;
  const lines: RollModifier[] = [];
  if (entry.bonus) lines.push({ label: game.i18n.localize("GWORLD.Ability.Reliable"), value: entry.bonus, key: "reliable" });
  if (entry.penalty) lines.push({ label: game.i18n.localize("GWORLD.Ability.HardToUse"), value: entry.penalty, key: "hardToUse" });

  const made: AbilityUseResult["rolls"] = [];
  let success = true;
  for (const roll of entry.rolls as Array<{ label: string; base: number | null; contest: boolean; modified: boolean }>) {
    const name = game.i18n.format("GWORLD.Ability.RollLabel", { trait: entry.name, roll: roll.label });
    const base = roll.base ?? (await askForScore(name));
    if (base === null) return null;
    const outcome = await rollSuccess({
      actor,
      base,
      label: roll.contest ? game.i18n.format("GWORLD.Ability.ContestLabel", { label: name }) : name,
      kind: "attribute",
      skill: String(entry.name ?? ""),
      modifiers: roll.modified ? lines : [],
    });
    if (!outcome) return null;
    made.push({ label: roll.label, success: outcome.success === true });
    if (!outcome.success) {
      success = false;
      break;
    }
  }

  const fp = Math.max(0, Number(entry.fpCost) || 0);
  const hp = Math.max(0, Number(entry.hpCost) || 0);
  if (fp > 0) await spendFatigueFor(actor, fp, { reason: String(entry.name ?? "") });
  if (hp > 0) await spendHitPointsFor(actor, hp, { reason: String(entry.name ?? "") });
  ui.notifications?.info(game.i18n.format(success ? "GWORLD.Ability.Works" : "GWORLD.Ability.Fails", { name: String(actor.name ?? ""), trait: String(entry.name ?? "") }));
  return { success, rolls: made, fpSpent: fp, hpSpent: hp };
}
