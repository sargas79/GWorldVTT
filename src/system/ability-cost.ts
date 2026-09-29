/**
 * Paying what an ability costs to use (Basic Set Revised pp. 111, 326, 330).
 *
 * Costs Fatigue is "-5% per FP per use" and Costs Hit Points the same for HP;
 * the trait carries the percentage and `derived.abilityRolls` reads the price
 * back. Paying it is the point of this file: the FP go through
 * `spendFatigueFor` with the ability's origin, so an Energy Reserve of that
 * origin pays before FP does (p. 326), and the HP through `spendHitPointsFor`.
 */

import { spendFatigueFor, spendHitPointsFor } from "./fatigue.js";

const L = (key: string, data?: Record<string, unknown>) =>
  data ? game.i18n.format(`GWORLD.AbilityCost.${key}`, data) : game.i18n.localize(`GWORLD.AbilityCost.${key}`);

/** What a use of one ability costs, as `derived.abilityRolls` lists it. */
export interface AbilityCost {
  fp: number;
  hp: number;
  origin: string;
  /** True where either cost is per second of use (-10% per FP, doubled), so it is paid by the second. */
  perSecond: boolean;
  fpPerSecond: boolean;
  hpPerSecond: boolean;
}

/** The cost of a trait's use, or null where it has none. */
export function abilityCostOf(actor: any, itemId: string): AbilityCost | null {
  const rolls = actor?.system?.derived?.abilityRolls;
  const found = Array.isArray(rolls) ? rolls.find((r: any) => String(r?.id ?? "") === String(itemId)) : null;
  if (!found) return null;
  const fp = Math.max(0, Math.floor(Number(found.fpCost) || 0));
  const hp = Math.max(0, Math.floor(Number(found.hpCost) || 0));
  const fpPerSecond = fp > 0 && found.fpCostPerSecond === true;
  const hpPerSecond = hp > 0 && found.hpCostPerSecond === true;
  return fp > 0 || hp > 0
    ? { fp, hp, origin: String(found.origin ?? ""), perSecond: fpPerSecond || hpPerSecond, fpPerSecond, hpPerSecond }
    : null;
}

/** What paying a use came to. */
export interface AbilityPaid {
  fp: number;
  reserve: number;
  hp: number;
}

/**
 * Pays one use of an ability: the FP of Costs Fatigue, from an Energy Reserve
 * of the ability's origin first, and the HP of Costs Hit Points. Says so in
 * the log. Null where the ability costs nothing or this user may not change
 * the actor.
 *
 * A cost "per second" (Costs Fatigue or Costs Hit Points at the doubled price)
 * is charged for each of `seconds` of use, from the origin's reserve first
 * (since API 1.192.0); a cost per use ignores `seconds`.
 */
export async function payAbilityCost(actor: any, item: any, seconds = 1): Promise<AbilityPaid | null> {
  if (!actor?.isOwner || !item) return null;
  const cost = abilityCostOf(actor, String(item.id));
  if (!cost) return null;
  const time = Math.max(1, Math.floor(Number(seconds)) || 1);
  const fpDue = cost.fp * (cost.fpPerSecond ? time : 1);
  const hpDue = cost.hp * (cost.hpPerSecond ? time : 1);
  const paid: AbilityPaid = { fp: 0, reserve: 0, hp: 0 };
  if (fpDue > 0) {
    const applied = await spendFatigueFor(actor, fpDue, {
      reason: "abilityCost",
      exertion: false,
      details: { ability: String(item.name ?? "") },
      ...(cost.origin ? { origin: cost.origin } : {}),
    });
    if (applied) {
      paid.fp = applied.fpLost;
      paid.reserve = applied.reserveLost;
    }
  }
  if (hpDue > 0) {
    const lost = await spendHitPointsFor(actor, hpDue, { reason: "abilityCost" });
    if (lost) paid.hp = lost.hpLost;
  }
  const parts = [
    paid.reserve > 0 ? L("Reserve", { points: paid.reserve, origin: cost.origin }) : "",
    paid.fp > 0 ? L("Fp", { points: paid.fp }) : "",
    paid.hp > 0 ? L("Hp", { points: paid.hp }) : "",
  ].filter(Boolean);
  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    content: `<p>${foundry.utils.escapeHTML(
      cost.perSecond
        ? L("UsedSeconds", { ability: String(item.name ?? ""), seconds: time, paid: parts.join(", ") || "0" })
        : L("Used", { ability: String(item.name ?? ""), paid: parts.join(", ") || "0" }),
    )}</p>`,
  });
  return paid;
}
