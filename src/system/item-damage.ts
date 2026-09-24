/**
 * Damage to a thing, from a module (GURPS Basic Set: Campaigns pp. 483-484).
 *
 * The system already damages gear in combat: a weapon struck at, a shield that
 * took a blow. What it had no way to do was hurt a thing that was dropped,
 * crushed or thrown on the fire, so a module could only ask the GM to mark it
 * by hand. This is that blow, on any item that keeps hit points: DR off, the
 * rest turned into injury by what kind of thing it is, and the HT rolls the
 * book calls for once it is driven far enough below zero.
 */

import { SYSTEM_ID } from "./constants.js";
import { computeInjury } from "../rules/damage.js";
import { noInjuryTolerance } from "../rules/injury-tolerance.js";
import {
  OBJECT_DESTROYED_MULTIPLE,
  objectState,
  objectSurvivalChecks,
  type ObjectKind,
  type ObjectState,
} from "../rules/objects.js";
import { resolveSuccess } from "../rules/success.js";
import { DAMAGE_TYPES, type DamageType } from "../rules/types.js";
import { objectStats } from "./object-stats.js";

const CARD_TEMPLATE = `systems/${SYSTEM_ID}/templates/chat/item-damage.hbs`;

const L = (key: string, data?: Record<string, unknown>) =>
  data ? game.i18n.format(`GWORLD.ItemDamage.${key}`, data) : game.i18n.localize(`GWORLD.ItemDamage.${key}`);

/** One HT roll a blow called for, at a multiple of -HP. */
export interface ItemSurvivalRoll {
  /** The multiple of -HP the thing reached: 1 for -1xHP, up to 4. */
  multiple: number;
  target: number;
  roll: number;
  success: boolean;
}

/** What `items.applyDamage` resolves to. */
export interface ItemDamaged {
  itemId: string;
  name: string;
  label: string;
  /** The thing's figures as an object, once `gworld.objectStats` listeners had their say. */
  kind: ObjectKind;
  dr: number;
  hp: number;
  ht: number;
  /** The blow as it was given. */
  damage: number;
  type: DamageType;
  armorDivisor: number;
  /** Its DR after the armor divisor. */
  effectiveDr: number;
  penetrating: number;
  woundingModifier: number;
  /** Hit points the blow took off. */
  injury: number;
  /** `hpLost` before and after, the latter raised to -5xHP where a HT roll failed. */
  from: number;
  to: number;
  state: ObjectState;
  rolls: ItemSurvivalRoll[];
  /** Whether this blow destroyed it: false for one already destroyed. */
  destroyed: boolean;
}

/** The d6 faces of an evaluated roll, for the card. */
function faces(roll: any): number[] {
  return (roll?.dice?.[0]?.results ?? []).map((r: { result: number }) => r.result);
}

/**
 * Puts a blow on a thing (Campaigns pp. 483-484), with its card.
 *
 * "Handle attacks on artifacts just like attacks on living beings": the
 * armor divisor divides its DR, what gets through is multiplied by the
 * wounding modifier its kind allows (a machine and a solid thing shrug off
 * piercing, a diffuse one takes a point or two at most), and any blow that
 * penetrates does at least 1 HP. At -1xHP and each multiple after it the
 * thing rolls HT or is destroyed; at -5xHP it is destroyed without a roll. A
 * failed roll puts it at -5xHP, which is how everything else that reads its
 * `hpLost` -- its condition, the repair rules -- knows it is gone.
 *
 * Null where the user doesn't own the item, the item keeps no hit points (or
 * has none, weighing nothing), the damage isn't a number of 0 or more, or the
 * type isn't one of the Basic Set's -- or is fatigue, which a thing has none of.
 */
export async function applyItemDamage(options: {
  item: any;
  damage: number;
  type: string;
  armorDivisor?: number;
  label?: string;
}): Promise<ItemDamaged | null> {
  const { item } = options;
  if (!item?.isOwner || item.system?.hpLost === undefined) return null;
  const type = options.type as DamageType;
  if (!(DAMAGE_TYPES as readonly string[]).includes(type) || type === "fat") return null;
  const damage = Number(options.damage);
  if (!Number.isFinite(damage) || damage < 0) return null;
  const basicDamage = Math.floor(damage);
  const divisor = Number(options.armorDivisor);
  const armorDivisor = Number.isFinite(divisor) && divisor > 0 ? divisor : 1;

  const stats = objectStats(item);
  const { kind, dr, hp, ht } = stats;
  if (hp <= 0) return null;

  const hit = computeInjury({
    basicDamage,
    dr,
    type,
    armorDivisor,
    tolerance: { ...noInjuryTolerance(), [kind]: true },
  });

  const from = Math.max(0, Number(item.system.hpLost) || 0);
  let to = from + hit.injury;
  const alreadyGone = objectState(hp - from, hp) === "destroyed";

  // Each multiple of -HP the blow reaches is a HT roll to stay in one piece;
  // the first failure ends it, and there is nothing left to roll for after.
  const rolls: ItemSurvivalRoll[] = [];
  const dice: any[] = [];
  let destroyed = !alreadyGone && objectState(hp - to, hp) === "destroyed";
  if (!alreadyGone) {
    for (const multiple of objectSurvivalChecks(hp - from, hp - to, hp)) {
      const roll = new Roll("3d6");
      await roll.evaluate();
      dice.push(roll);
      const outcome = resolveSuccess(roll.total, ht, faces(roll));
      rolls.push({ multiple, target: ht, roll: roll.total, success: outcome.success });
      if (!outcome.success) {
        destroyed = true;
        to = Math.max(to, (OBJECT_DESTROYED_MULTIPLE + 1) * hp);
        break;
      }
    }
  }

  if (to !== from) await item.update({ "system.hpLost": to });
  const state = objectState(hp - to, hp);
  const name = String(item.name ?? "");
  const label = typeof options.label === "string" && options.label.trim() ? options.label.trim() : L("Label", { name });

  const result: ItemDamaged = {
    itemId: String(item.id ?? ""),
    name,
    label,
    kind,
    dr,
    hp,
    ht,
    damage: basicDamage,
    type,
    armorDivisor,
    effectiveDr: hit.effectiveDr,
    penetrating: hit.penetrating,
    woundingModifier: hit.woundingModifier,
    injury: hit.injury,
    from,
    to,
    state,
    rolls,
    destroyed,
  };

  const content = await foundry.applications.handlebars.renderTemplate(CARD_TEMPLATE, {
    ...result,
    modifier: Math.round(hit.woundingModifier * 100) / 100,
    divided: armorDivisor !== 1,
    kindLabel: L(`Kind.${kind}`),
    stateLabel: L(`State.${state}`),
  });
  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor: item.actor ?? null }),
    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    content,
    rolls: dice,
  });

  return result;
}
