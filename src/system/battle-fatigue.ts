/**
 * What a fight costs in fatigue (GURPS Basic Set: Campaigns p. 426).
 *
 * "After any battle that lasts longer than 10 seconds, lose 1 FP." A round of
 * combat is a second, so the combat tracker knows how long the battle was,
 * and when it is closed everyone who was in it pays. Extra effort was paid
 * for as it was spent; this is the fight itself. "If the day is hot, add 1
 * FP": with the heat rules in play, a fighter the day's temperature is hot
 * for pays a point more (since API 1.147.0).
 */

import { SYSTEM_ID } from "./constants.js";
import { battleFatigueCost, hotDayBattleFatigue } from "../rules/fatigue.js";
import { isRuleOn } from "./optional-rules.js";
import { applyFatigue } from "./fatigue.js";
import { dayWeather } from "./weather.js";
import type { FatigueCostPart } from "./procedure-extensions.js";

/** Registers the hook. Called once, at init. */
export function registerBattleFatigue(): void {
  Hooks.on("deleteCombat", (combat: any, _options: unknown, userId: string) => {
    if (userId !== game.user?.id) return;
    if (!isRuleOn("battleFatigue")) return;
    void chargeBattleFatigue(combat);
  });
}

/** Whether any weapon in hand needs more ST than its wielder has (Characters p. 270). */
function wieldsAboveStrength(actor: any): boolean {
  const rows: any[] = [...(actor?.system?.derived?.melee ?? []), ...(actor?.system?.derived?.ranged ?? [])];
  return rows.some((row) => Number(row?.minStPenalty ?? 0) < 0);
}

/** Charges everyone in a finished battle what it cost them, and says so. */
export async function chargeBattleFatigue(combat: any): Promise<void> {
  const rounds = Math.max(0, Math.floor(Number(combat?.round ?? 0)));
  const cost = battleFatigueCost(rounds);
  if (cost === 0) return;

  const charged: string[] = [];
  const seen = new Set<string>();
  for (const combatant of combat?.combatants ?? []) {
    const actor = combatant?.actor;
    if (!actor?.isOwner) continue;
    const key = String(actor.uuid ?? actor.id ?? "");
    if (!key || seen.has(key)) continue;
    seen.add(key);

    const current = Number(actor.system?.fp?.value);
    if (!Number.isFinite(current)) continue;
    // "If you try to use a weapon that requires more ST than you have, you
    // will be... lose one extra FP at the end of any fight that lasts long
    // enough to fatigue you" (Characters p. 270).
    const strained = isRuleOn("minimumSt") && wieldsAboveStrength(actor) ? 1 : 0;
    // The day's temperature as the GM set it, and whether it is hot for this
    // fighter (API 1.138.0). The heat is the weather's rule, so it is charged
    // only with the heat and the cold in play.
    const weather = dayWeather(actor);
    const hot = isRuleOn("exposure") ? hotDayBattleFatigue(rounds, weather.hot) : 0;
    // Through the fatigue chart like any other exertion, and past the
    // `gworld.fatigueCost` listeners (API 1.76.0), who see the cost in keyed
    // parts (API 1.147.0): armour that makes the heat dearer raises `hotDay`,
    // armour that keeps it out takes it away.
    const parts: FatigueCostPart[] = [{ key: "battle", label: game.i18n.localize("GWORLD.BattleFatigue.PartBattle"), fp: cost }];
    if (strained) parts.push({ key: "strained", label: game.i18n.localize("GWORLD.BattleFatigue.PartStrained"), fp: strained });
    if (hot) parts.push({ key: "hotDay", label: game.i18n.localize("GWORLD.BattleFatigue.PartHotDay"), fp: hot });
    const spent = await applyFatigue(actor, cost + strained + hot, {
      reason: "battle",
      details: { seconds: rounds, strained: strained > 0, temperatureF: weather.temperatureF, hot: weather.hot },
      parts,
    });
    // The card says what the fighter paid beyond the fight itself, as the
    // listeners left it.
    const extra = (key: string) => spent.parts.find((part) => part.key === key && part.fp > 0);
    let name = String(actor.name ?? "");
    if (extra("strained")) name = game.i18n.format("GWORLD.BattleFatigue.Strained", { name });
    const heat = extra("hotDay");
    if (heat) name = game.i18n.format("GWORLD.BattleFatigue.HotDay", { name, fp: heat.fp });
    charged.push(spent.sources.length > 0
      ? game.i18n.format("GWORLD.BattleFatigue.Changed", { name, fp: spent.fpLost, sources: spent.sources.join(", ") })
      : name);
  }

  if (charged.length === 0) return;
  await ChatMessage.implementation.create({
    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    content: `<div class="gworld gworld-chat"><div class="gc-head"><span class="gc-label">${
      game.i18n.localize("GWORLD.BattleFatigue.Title")
    }</span><span class="gc-target">${
      game.i18n.format("GWORLD.BattleFatigue.Seconds", { seconds: rounds })
    }</span></div><div class="gc-result">${
      game.i18n.format("GWORLD.BattleFatigue.Charged", { fp: cost, names: charged.join(", ") })
    }</div></div>`,
    flags: { [SYSTEM_ID]: { battleFatigue: { rounds, cost } } },
  });
}
