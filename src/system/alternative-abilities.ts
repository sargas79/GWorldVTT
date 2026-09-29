/**
 * Alternative Abilities and Character Point-Powered Abilities on the sheet
 * (Basic Set Revised pp. 324-325).
 *
 * The rules are in `rules/alternative-abilities.ts`; this reads them off a
 * character's traits, decides which are inert, and carries out the two things
 * a player does: Ready an ability into a slot, and spend points to use a
 * point-powered one.
 */

import { pointPoweredCeiling, swapAlternative } from "../rules/alternative-abilities.js";
import { memberOf } from "./alternative-analysis.js";
import { spendPoints, sourcesFor } from "./bonus-points.js";

const L = (key: string) => game.i18n.localize(`GWORLD.Alternative.${key}`);
const F = (key: string, data: Record<string, unknown>) => game.i18n.format(`GWORLD.Alternative.${key}`, data);

async function say(actor: any, content: string): Promise<void> {
  await ChatMessage.implementation.create({ speaker: ChatMessage.implementation.getSpeaker({ actor }), content: `<p>${foundry.utils.escapeHTML(content)}</p>` });
}

/**
 * Readies an ability into its set (p. 324). It takes a slot that is free or
 * the one an ability not still running holds, and says whether that is a Ready
 * maneuver or, from one attack to another, free. Refused with a warning for a
 * disabled set or one whose every slot is frozen.
 */
export async function readyAlternative(actor: any, item: any): Promise<boolean> {
  if (!actor || !item || !(actor.isOwner || game.user?.isGM)) return false;
  const traits = [...actor.items].filter((i: any) => i.type === "trait");
  const members = traits.map(memberOf);
  const result = swapAlternative(members, String(item.id));
  if (!result.ok) {
    ui.notifications?.warn(L(result.reason === "disabled" ? "Disabled" : result.reason === "frozen" ? "Frozen" : "Already"));
    return false;
  }
  if (result.action === "none") return false;
  const updates: Array<Record<string, unknown>> = [{ _id: item.id, "system.alternativeActive": true }];
  let out: any = null;
  if (result.replaces) {
    out = actor.items.get(result.replaces);
    updates.push({ _id: result.replaces, "system.alternativeActive": false });
  }
  await actor.updateEmbeddedDocuments("Item", updates);
  await say(actor, F(result.action === "free" ? "SwappedFree" : "SwappedReady", { actor: actor.name, ability: item.name, previous: out?.name ?? "" }));
  return true;
}

/** Marks an ability burned out or neutralized, or recovered: the whole set goes with it (p. 324). */
export async function setAlternativeDisabled(actor: any, item: any, disabled: boolean): Promise<void> {
  if (!actor || !item || !(actor.isOwner || game.user?.isGM)) return;
  await item.update({ "system.alternativeDisabled": disabled });
}

/**
 * Spends points to use a character point-powered ability (p. 325): Impulse
 * Points first, then unspent character points. `cost` is 1 to 3 and up to the
 * ability's own cost, as the GM rules the use fits the story. Nothing is
 * spent where there aren't the points.
 */
export async function usePointPowered(actor: any, item: any, cost: number): Promise<boolean> {
  if (!actor || !item || !(actor.isOwner || game.user?.isGM)) return false;
  const price = Math.floor(Number(cost));
  if (!Number.isFinite(price) || price < 1) return false;
  const sources = sourcesFor(actor, "buySuccess");
  const source = sources.find((s) => s.key === "impulse") ?? sources.find((s) => s.key === "unspent");
  const unspent = Number(actor.system?.derived?.points?.unspent ?? 0) || 0;
  const available = source?.available ?? Math.max(0, unspent);
  if (available < price) {
    ui.notifications?.warn(L("NoPoints"));
    return false;
  }
  const paid = await spendPoints(actor, source?.source ?? { kind: "unspent" }, price, F("SpendNote", { ability: item.name }));
  if (!paid) return false;
  await item.update({ "system.pointPoweredActive": true });
  await say(actor, F("PoweredUsed", { actor: actor.name, ability: item.name, points: price }));
  return true;
}

/** Asks how many points the use costs (1 to the ability's cost) and spends them. */
export async function promptPointPowered(actor: any, item: any): Promise<boolean> {
  const ceiling = pointPoweredCeiling(Number(item.system?.totalPoints ?? 0) || 0);
  const answer = await foundry.applications.api.DialogV2.prompt({
    window: { title: F("PromptTitle", { ability: item.name }) },
    content: `<div class="gworld"><p class="ihint">${foundry.utils.escapeHTML(L("PromptHint"))}</p>
      <label style="display:flex;gap:8px;justify-content:space-between;align-items:center"><span>${foundry.utils.escapeHTML(L("PromptPoints"))}</span>
      <input type="number" name="points" min="1" max="${ceiling}" value="1" step="1" style="width:5em"></label></div>`,
    ok: {
      label: L("Spend"),
      callback: (_event: Event, button: HTMLElement) => Number(button.closest<HTMLElement>(".application")?.querySelector<HTMLInputElement>('input[name="points"]')?.value ?? 0),
    },
    rejectClose: false,
  });
  if (typeof answer !== "number" || !Number.isFinite(answer)) return false;
  return usePointPowered(actor, item, Math.min(ceiling, Math.max(1, answer)));
}

/** Ends a point-powered ability's use: the scene or turn is over, and it is inert again. */
export async function endPointPowered(actor: any, item: any): Promise<void> {
  if (!actor || !item || !(actor.isOwner || game.user?.isGM)) return;
  await item.update({ "system.pointPoweredActive": false });
}
