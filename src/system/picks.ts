/**
 * A weapon stuck in a foe (GURPS Basic Set: Campaigns p. 405; since API
 * 1.105.0).
 *
 * A pick's blow that penetrates DR and does damage leaves the weapon in the
 * victim. The item keeps that as a flag until it comes out: the sheet shows
 * the weapon as stuck, its rows neither attack nor parry nor ready, and its
 * buttons offer the book's two choices -- a Ready maneuver and a ST roll to
 * pull it free, or letting go of it, which is free. A critical failure on the
 * roll leaves it stuck for good; a weapon let go of stays in the foe until
 * somebody retrieves it.
 *
 * Which blows are a pick's is the row's `pick`, from the mode's own field or a
 * module's `gworld.weaponAttacks` listener; `gworld.weaponStuck` has the last
 * word on each blow.
 */

import { SYSTEM_ID } from "./constants.js";
import { COMBAT_HOOKS, callCombatHook } from "./combat-extensions.js";
import { attributeOf } from "./attributes.js";
import { isRuleOn } from "./optional-rules.js";
import { freeingResult, getsStuck, type FreeingResult } from "../rules/picks.js";

/** Where an item keeps the foe it is stuck in. */
export const STUCK_FLAG = "stuck";

/** A weapon stuck in a foe, as its flag keeps it. */
export interface StuckWeapon {
  /** The victim's UUID, and their name when it stuck. */
  uuid: string;
  name: string;
  /** Stuck for good after a critical failure: only letting go is left. */
  forGood: boolean;
  /** False once the wielder has let go of it and it stays in the foe. */
  held: boolean;
  /** The melee mode whose blow stuck it. */
  modeIndex: number;
}

const localize = (key: string, data?: Record<string, unknown>): string => {
  const i18n = (globalThis as any).game?.i18n;
  if (!i18n) return key;
  return data ? i18n.format(`GWORLD.Pick.${key}`, data) : i18n.localize(`GWORLD.Pick.${key}`);
};

/** The foe a weapon is stuck in, or null for a weapon in hand. */
export function stuckWeaponOf(item: any): StuckWeapon | null {
  const flag = item?.getFlag?.(SYSTEM_ID, STUCK_FLAG) ?? item?.flags?.[SYSTEM_ID]?.[STUCK_FLAG];
  if (!flag || typeof flag !== "object") return null;
  return {
    uuid: typeof flag.uuid === "string" ? flag.uuid : "",
    name: typeof flag.name === "string" ? flag.name : "",
    forGood: flag.forGood === true,
    held: flag.held !== false,
    modeIndex: Number.isInteger(flag.modeIndex) ? flag.modeIndex : 0,
  };
}

/**
 * Leaves a weapon stuck, or frees it with null, with no roll and no card.
 * False where the user doesn't own the item.
 */
export async function setStuckWeapon(item: any, stuck: Partial<StuckWeapon> | null): Promise<boolean> {
  if (!item?.isOwner) return false;
  if (stuck === null) {
    if (stuckWeaponOf(item)) await item.unsetFlag(SYSTEM_ID, STUCK_FLAG);
    return true;
  }
  await item.setFlag(SYSTEM_ID, STUCK_FLAG, {
    uuid: typeof stuck.uuid === "string" ? stuck.uuid : "",
    name: typeof stuck.name === "string" ? stuck.name : "",
    forGood: stuck.forGood === true,
    held: stuck.held !== false,
    modeIndex: Number.isInteger(stuck.modeIndex) ? stuck.modeIndex : 0,
  });
  return true;
}

/** What `gworld.weaponStuck` hands its listeners. */
export interface WeaponStuckContext {
  attacker: any;
  item: any;
  mode: { index: number; ranged: boolean; derived?: string } | null;
  target: any;
  /** What the blow did, as the damage card applied it. */
  result: { injury: number; penetrating: number; hitLocation: string };
  /** Whether the row was a pick's. */
  pick: boolean;
  /** Whether the weapon sticks: the book's answer, which a listener may change. */
  stuck: boolean;
}

/**
 * After a blow is applied: leaves the weapon in its victim where the rule
 * says so and `gworld.weaponStuck` agrees, and says so on a card. True where
 * it stuck.
 */
export async function afterPickBlow(options: {
  item: any;
  mode: { index: number; ranged: boolean; derived?: string } | null;
  target: any;
  pick: boolean;
  result: { injury: number; penetrating: number; hitLocation: string };
}): Promise<boolean> {
  if (!isRuleOn("picks")) return false;
  const { item, target } = options;
  if (!item || item.type !== "equipment" || options.mode?.ranged === true) return false;
  const attacker = item.parent ?? null;
  const context = callCombatHook<WeaponStuckContext>(COMBAT_HOOKS.weaponStuck, {
    attacker,
    item,
    mode: options.mode,
    target,
    result: { ...options.result },
    pick: options.pick,
    stuck: getsStuck({ pick: options.pick, penetrating: options.result.penetrating, injury: options.result.injury }),
  });
  if (context.stuck !== true || !item.isOwner || stuckWeaponOf(item)) return false;
  const name = String(target?.name ?? "");
  await setStuckWeapon(item, { uuid: String(target?.uuid ?? ""), name, forGood: false, held: true, modeIndex: options.mode?.index ?? 0 });
  await card(attacker, localize("Title", { name: String(item.name ?? "") }), localize("Stuck", { name: String(item.name ?? ""), foe: name }));
  return true;
}

/**
 * Tries to pull a stuck weapon free (p. 405): a Ready maneuver and a ST roll.
 * On a success it comes free -- unready, for a weapon that must be readied
 * after an attack; on a failure it stays; on a critical failure it is stuck
 * for good. Null where nothing was tried.
 */
export async function freeStuckWeapon(actor: any, item: any): Promise<FreeingResult | null> {
  if (!item?.isOwner) return null;
  const stuck = stuckWeaponOf(item);
  if (!stuck) return null;
  if (!stuck.held || stuck.forGood) {
    ui.notifications?.warn(localize(stuck.forGood ? "ForGoodHint" : "LetGoHint", { name: String(item.name ?? "") }));
    return null;
  }
  // The roll module reaches this one, so it is loaded when the roll is made.
  const { rollSuccess } = await import("./roll.js");
  const outcome = await rollSuccess({
    actor,
    base: attributeOf(actor, "ST"),
    label: localize("FreeLabel", { name: String(item.name ?? ""), foe: stuck.name }),
    kind: "attribute",
    tags: ["ST", "stuckWeapon"],
    item,
  });
  if (!outcome) return null;
  const result = freeingResult(outcome);
  if (result === "freed") {
    await setStuckWeapon(item, null);
    // "If it is one that must be readied after an attack ... you can ready it
    // next turn": it comes out as a swing would have left it.
    const rows: any[] = actor?.system?.derived?.melee ?? [];
    const row = rows.find((r) => r?.itemId === item.id && r?.modeIndex === stuck.modeIndex && !r?.derivedMode);
    if (row?.readiesAfterAttack) await item.update({ "system.unready": true });
  } else if (result === "stuckForGood") {
    await setStuckWeapon(item, { ...stuck, forGood: true });
  }
  if (actor?.isOwner && actor.system?.maneuver !== undefined) await actor.update({ "system.maneuver": "ready" });
  await card(actor, localize("Title", { name: String(item.name ?? "") }), localize(`Result.${result}`, { name: String(item.name ?? ""), foe: stuck.name }));
  return result;
}

/**
 * Lets go of a stuck weapon (p. 405), a free action: it stays in the foe
 * until somebody retrieves it. False where nothing was let go of.
 */
export async function letGoOfStuckWeapon(actor: any, item: any): Promise<boolean> {
  const stuck = stuckWeaponOf(item);
  if (!stuck || !stuck.held || !item?.isOwner) return false;
  await setStuckWeapon(item, { ...stuck, held: false });
  await card(actor, localize("Title", { name: String(item.name ?? "") }), localize("LetGo", { name: String(item.name ?? ""), foe: stuck.name }));
  return true;
}

async function card(actor: any, title: string, text: string): Promise<void> {
  const esc = (value: string) => foundry.utils.escapeHTML(String(value ?? ""));
  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    content: `<div class="gworld gworld-chat"><div class="gc-head"><span class="gc-label">${esc(title)}</span></div>
      <div class="gc-result">${esc(text)}</div></div>`,
  });
}
