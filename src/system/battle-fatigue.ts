/**
 * What a fight costs in fatigue (GURPS Basic Set: Campaigns p. 426).
 *
 * "After any battle that lasts longer than 10 seconds, lose 1 FP." A round of
 * combat is a second, so the combat tracker knows how long the battle was,
 * and when it is closed everyone who was in it pays. Extra effort was paid
 * for as it was spent; this is the fight itself.
 */

import { SYSTEM_ID } from "./constants.js";
import { battleFatigueCost } from "../rules/fatigue.js";
import { isRuleOn } from "./optional-rules.js";

/** Registers the hook. Called once, at init. */
export function registerBattleFatigue(): void {
  Hooks.on("deleteCombat", (combat: any, _options: unknown, userId: string) => {
    if (userId !== game.user?.id) return;
    if (!isRuleOn("battleFatigue")) return;
    void chargeBattleFatigue(combat);
  });
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
    await actor.update({ "system.fp.value": current - cost });
    charged.push(String(actor.name ?? ""));
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
