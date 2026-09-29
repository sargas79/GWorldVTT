/**
 * Heroic Archer at the table (Basic Set Revised p. 327), the parts that are
 * not one number on a shot: readying the bow in no time, and the penalties
 * that a Heroic Archer halves.
 *
 * "Ready an arrow, then next turn roll Bow-3 to ready the bow at once, and
 * attack at -3 the same turn" (both -1 with Weapon Master (Bow)). The rule's
 * arithmetic is in `rules/heroic-archer.ts`; the shot's Acc, Aim and Bulk
 * lines are in `rangedModifiers`. What is here is the roll in the ready flow,
 * the penalty it leaves for the next attack, and the dialog fields for a
 * Fast-Draw (Arrow) or stunt penalty the GM sets.
 */

import { SYSTEM_ID } from "./constants.js";
import { isRuleOn } from "./optional-rules.js";
import { skillLevelOf } from "./skill-level.js";
import {
  heroicHalvedPenalty,
  isHeroicArcherSkill,
  quickReadyPenalty,
} from "../rules/heroic-archer.js";
import { inWeaponMasterClass, weaponMasteryFrom } from "../rules/weapon-master.js";

/** Where a quick-ready penalty waits for the attack it applies to. */
export const QUICK_READY_FLAG = "heroicQuickReady";

const L = (key: string, data?: Record<string, unknown>) =>
  data ? game.i18n.format(`GWORLD.HeroicArcher.${key}`, data) : game.i18n.localize(`GWORLD.HeroicArcher.${key}`);

/** Whether the character is a Heroic Archer and the cinematic switch is on. */
export function isHeroicArcher(actor: any): boolean {
  return isRuleOn("heroicArcher") && actor?.system?.derived?.traitEffects?.heroicArcher === true;
}

/** Whether the weapon mode is a Heroic Archer's bow. */
export function isHeroicBow(actor: any, mode: any): boolean {
  return isHeroicArcher(actor) && isHeroicArcherSkill(String(mode?.skill ?? ""));
}

/** Whether the bow is in the character's Weapon Master class. */
function weaponMasterBow(actor: any, item: any, mode: any): boolean {
  const traits = [...(actor?.items ?? [])]
    .filter((t: any) => t?.type === "trait")
    .map((t: any) => ({
      name: String(t.name ?? ""),
      levels: Number(t.system?.levels ?? 0) || 0,
      masteredWeapons: (t.system?.masteredWeapons ?? []) as string[],
    }));
  return inWeaponMasterClass(weaponMasteryFrom(traits), { name: String(item?.name ?? ""), skills: [String(mode?.skill ?? "")] });
}

/** The penalty on the quick ready and the attack after it for this bow: -3, or -1 for a Weapon Master (Bow). */
export function quickReadyFor(actor: any, item: any, mode: any): number {
  return quickReadyPenalty(weaponMasterBow(actor, item, mode));
}

/**
 * Offers the Heroic Archer's quick ready in the reload flow and rolls it: Bow
 * at -3 (-1 for a Weapon Master). A success readies the bow at once and holds
 * the same penalty for the next attack. Null where it wasn't tried -- not a
 * Heroic Archer's bow, no Bow skill, or the player declined.
 */
export async function rollQuickReady(actor: any, item: any, mode: any): Promise<{ success: boolean; penalty: number } | null> {
  if (!actor || !isHeroicBow(actor, mode)) return null;
  const level = skillLevelOf(actor, String(mode?.skill ?? "Bow")) ?? skillLevelOf(actor, "Bow");
  if (level === null) return null;
  const penalty = quickReadyFor(actor, item, mode);
  const wanted = await foundry.applications.api.DialogV2.confirm({
    window: { title: L("QuickReadyTitle") },
    content: `<p>${foundry.utils.escapeHTML(L("QuickReadyAsk", { name: String(item?.name ?? ""), penalty, level }))}</p>`,
    rejectClose: false,
  });
  if (!wanted) return null;
  // The roll module reaches this one, so it is loaded when the roll is made.
  const { rollSuccess } = await import("./roll.js");
  const result = await rollSuccess({
    actor,
    base: level,
    label: L("QuickReadyLabel"),
    skill: String(mode?.skill ?? "Bow"),
    modifiers: [{ label: L("QuickReadyLine"), value: penalty, key: "heroicArcher", heroicArcher: "quickReady" }],
  });
  if (!result) return null;
  if (result.success && actor.isOwner) await actor.setFlag(SYSTEM_ID, QUICK_READY_FLAG, penalty);
  return { success: result.success === true, penalty };
}

/** The penalty a quick ready left for the next attack, or 0. */
export function pendingQuickReady(actor: any): number {
  const held = Number(actor?.getFlag?.(SYSTEM_ID, QUICK_READY_FLAG));
  return Number.isFinite(held) && held < 0 ? held : 0;
}

/** Spends the held quick-ready penalty: it belongs to one attack. */
export async function consumeQuickReady(actor: any): Promise<void> {
  if (pendingQuickReady(actor) === 0 || !actor?.isOwner) return;
  await actor.unsetFlag(SYSTEM_ID, QUICK_READY_FLAG);
}

/**
 * A penalty the GM sets for a Fast-Draw (Arrow) or a stunt shot, as a
 * Heroic Archer meets it: halved in their favour, unchanged for anyone else.
 */
export function heroicPenalty(actor: any, penalty: number, skill = "Bow"): number {
  const asked = Math.min(0, Math.trunc(Number(penalty) || 0));
  return isHeroicBow(actor, { skill }) ? heroicHalvedPenalty(asked) : asked;
}
