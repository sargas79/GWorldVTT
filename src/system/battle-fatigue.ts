/**
 * What a fight costs in fatigue (GURPS Basic Set: Campaigns p. 426).
 *
 * "Any battle that lasts more than 10 seconds will cost FP": 1 FP with no
 * encumbrance, one more for each level of it, at the end of the battle. A
 * round of combat is a second, so the combat tracker knows how long the
 * battle was, and when it is closed everyone who fought in it pays -- by
 * their encumbrance then. Those who made no attack or defense roll are exempt
 * (since API 1.147.0). Extra effort was paid for as it was spent; this is the
 * fight itself. "If the day is hot, add 1 FP": with the heat rules in play, a
 * fighter the day's temperature is hot for pays a point more (since API
 * 1.147.0).
 */

import { SYSTEM_ID } from "./constants.js";
import { battleFatigueCost, hotDayBattleFatigue } from "../rules/fatigue.js";
import { isRuleOn } from "./optional-rules.js";
import { applyFatigue } from "./fatigue.js";
import { dayWeather } from "./weather.js";
import { combatsFoughtIn } from "./combat-participation.js";
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

/** Charges everyone who fought in a finished battle what it cost them, and says so. */
export async function chargeBattleFatigue(combat: any): Promise<void> {
  const rounds = Math.max(0, Math.floor(Number(combat?.round ?? 0)));
  if (battleFatigueCost(rounds) === 0) return;

  // Who fought, read before anything is awaited: the combat's end clears the
  // marks the attack and defense rolls left.
  const combatId = String(combat?.id ?? "");
  const everyone: any[] = [];
  const marked = new Set<any>();
  let anyMarked = false;
  const seen = new Set<string>();
  for (const combatant of combat?.combatants ?? []) {
    const actor = combatant?.actor;
    if (!actor) continue;
    // Anyone's mark counts, owned or not: it says the table's rolls reached
    // the system in this combat.
    const fought = combatsFoughtIn(actor).includes(combatId);
    anyMarked ||= fought;
    if (!actor.isOwner) continue;
    const key = String(actor.uuid ?? actor.id ?? "");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    if (!Number.isFinite(Number(actor.system?.fp?.value))) continue;
    everyone.push(actor);
    if (fought) marked.add(actor);
  }
  // "Those who make no attack or defense rolls during the fight are exempt
  // from this fatigue." Only where somebody's rolls were seen at all: a
  // combat fought with the table's own dice leaves no marks, and then
  // everyone pays, as they did before the exemption.
  const fighters = anyMarked ? everyone.filter((actor) => marked.has(actor)) : everyone;
  const idle = anyMarked ? everyone.filter((actor) => !marked.has(actor)).map((actor) => String(actor.name ?? "")) : [];

  const charged: string[] = [];
  // What each fighter paid, for whoever reads the card later.
  const paid: Array<{ uuid: string; fp: number }> = [];
  for (const actor of fighters) {
    // By the fighter's encumbrance at the end of the battle.
    const cost = battleFatigueCost(rounds, Number(actor.system?.derived?.encumbrance?.level) || 0);
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
    // The card says what the fighter paid, and what beyond the fight itself,
    // as the listeners left it.
    const extra = (key: string) => spent.parts.find((part) => part.key === key && part.fp > 0);
    let name = String(actor.name ?? "");
    if (extra("strained")) name = game.i18n.format("GWORLD.BattleFatigue.Strained", { name });
    const heat = extra("hotDay");
    if (heat) name = game.i18n.format("GWORLD.BattleFatigue.HotDay", { name, fp: heat.fp });
    paid.push({ uuid: String(actor.uuid ?? ""), fp: spent.fpLost });
    charged.push(spent.sources.length > 0
      ? game.i18n.format("GWORLD.BattleFatigue.Changed", { name, fp: spent.fpLost, sources: spent.sources.join(", ") })
      : game.i18n.format("GWORLD.BattleFatigue.Paid", { name, fp: spent.fpLost }));
  }

  if (charged.length === 0 && idle.length === 0) return;
  const lines = [
    ...(charged.length > 0 ? [game.i18n.format("GWORLD.BattleFatigue.Charged", { names: charged.join(", ") })] : []),
    ...(idle.length > 0 ? [game.i18n.format("GWORLD.BattleFatigue.Exempt", { names: idle.join(", ") })] : []),
  ];
  await ChatMessage.implementation.create({
    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    content: `<div class="gworld gworld-chat"><div class="gc-head"><span class="gc-label">${
      game.i18n.localize("GWORLD.BattleFatigue.Title")
    }</span><span class="gc-target">${
      game.i18n.format("GWORLD.BattleFatigue.Seconds", { seconds: rounds })
    }</span></div>${lines.map((line) => `<div class="gc-result">${line}</div>`).join("")}</div>`,
    flags: { [SYSTEM_ID]: { battleFatigue: { rounds, paid } } },
  });
}
