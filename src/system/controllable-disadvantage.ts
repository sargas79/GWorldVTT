/**
 * Controllable Disadvantage (Basic Set Revised p. 328): the perk lets its
 * owner inflict one chosen disadvantage on themselves by rolling against HT,
 * for a physical trait, or Will, for a mental one, at -1 for each further
 * attempt in the hour.
 *
 * The roll is made here, at the score and the penalty the perk gives; what
 * the disadvantage does once inflicted is the table's to play, so the card
 * says which one and whether it took.
 */

import { controllableKind, controllableName, controllableTarget, nextControllableTry, perkSpecialty, type ControllableTries } from "../rules/addendum-perks.js";
import { SYSTEM_ID } from "./constants.js";
import { attributeOf, healthRollScore } from "./attributes.js";
import { rollSuccess } from "./roll.js";

/** The flag an actor's tries of the hour are kept in, by normalised disadvantage. */
export const CONTROLLABLE_FLAG = "controllableTries";

const L = (key: string) => game.i18n.localize(`GWORLD.Perks.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`GWORLD.Perks.${key}`, data);

function triesOf(actor: any): Record<string, ControllableTries> {
  const stored = actor?.getFlag?.(SYSTEM_ID, CONTROLLABLE_FLAG);
  return stored && typeof stored === "object" ? { ...(stored as Record<string, ControllableTries>) } : {};
}

/** Whether the roll is against HT (physical) or Will (mental). Asked where the perk's specialty doesn't say. */
async function askKind(disadvantage: string): Promise<"physical" | "mental" | null> {
  const esc = foundry.utils.escapeHTML;
  const answer = await foundry.applications.api.DialogV2.prompt({
    window: { title: F("InflictTitle", { disadvantage }) },
    content: `<div class="gworld"><p class="ihint">${esc(L("InflictKindHint"))}</p>
      <label style="display:flex;gap:8px;justify-content:space-between;align-items:center"><span>${esc(L("InflictKind"))}</span>
      <select name="kind"><option value="physical">${esc(L("KindPhysical"))}</option><option value="mental">${esc(L("KindMental"))}</option></select></label></div>`,
    ok: {
      label: L("Inflict"),
      callback: (_event: Event, button: HTMLElement) =>
        button.closest<HTMLElement>(".application")?.querySelector<HTMLSelectElement>('select[name="kind"]')?.value ?? "",
    },
    rejectClose: false,
  });
  return answer === "physical" || answer === "mental" ? answer : null;
}

/**
 * Rolls to inflict the perk's disadvantage on its owner. The tries of this
 * hour are kept on the actor; each attempt after the first is -1. Returns
 * whether it took, or null when nothing was rolled.
 */
export async function inflictControllableDisadvantage(actor: any, perk: any): Promise<boolean | null> {
  if (!actor || !perk || !(actor.isOwner || game.user?.isGM)) return null;
  const specialty = perkSpecialty({ name: String(perk.name ?? ""), specialty: String(perk.system?.specialty ?? "") });
  const disadvantage = controllableName(specialty);
  if (!disadvantage) {
    ui.notifications?.warn(L("InflictNothing"));
    return null;
  }
  const kind = controllableKind(specialty) ?? await askKind(disadvantage);
  if (!kind) return null;

  const key = disadvantage.toLowerCase();
  const tries = triesOf(actor);
  const now = Number(game.time?.worldTime) || 0;
  const { attempt, tries: updated } = nextControllableTry(tries[key], now);
  tries[key] = updated;
  await actor.setFlag(SYSTEM_ID, CONTROLLABLE_FLAG, tries);

  const score = kind === "physical" ? healthRollScore(actor) : Number(actor.system?.derived?.will) || attributeOf(actor, "IQ");
  const target = controllableTarget({ score, physical: kind === "physical", attemptsThisHour: attempt });
  const result = await rollSuccess({
    actor,
    base: score,
    label: F("InflictLabel", { disadvantage, attribute: kind === "physical" ? "HT" : "Will" }),
    kind: "attribute",
    modifiers: attempt > 1 ? [{ label: F("InflictAttempt", { attempt }), value: target - score }] : [],
    tags: [kind === "physical" ? "HT" : "Will"],
  });
  return result ? result.success === true : null;
}
