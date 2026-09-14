/**
 * Powerstones on a character (GURPS Magic pp. 69-70).
 *
 * The stones are equipment with a Powerstone section. Recharging reads how
 * much world time has passed and the mana where the character is; drawing on
 * one is offered when a spell is cast, where the Powerstones rule is in play.
 */

import { isRuleOn } from "./optional-rules.js";
import {
  rechargeStones,
  stoneCanPay,
  type PowerstoneKind,
  type StoneState,
} from "../rules/powerstones.js";
import type { ManaLevel } from "../rules/casting.js";

/** A stone as the casting dialog offers it. */
export interface StoneOffer {
  id: string;
  name: string;
  kind: PowerstoneKind;
  charge: number;
  capacity: number;
}

/** Whether an item is a Powerstone. */
export function isPowerstone(item: any): boolean {
  return item?.type === "equipment" && item.system?.powerstone?.isStone === true;
}

/** The stones a character has, carried or stored. */
export function stonesOf(actor: any): any[] {
  return [...(actor?.items ?? [])].filter(isPowerstone);
}

/**
 * The carried stones that may pay for a spell (p. 69): "Any wizard touching a
 * Powerstone may take any or all of the energy it contains" -- so a stored one
 * is not to hand -- and only a stone with charge left, and of a kind that pays
 * for this spell.
 */
export function stonesForSpell(actor: any, spell: any, castThrough: string | null): StoneOffer[] {
  if (!isRuleOn("powerstones")) return [];
  return stonesOf(actor)
    .filter((stone) => stone.system?.carried !== false)
    .filter((stone) => Number(stone.system.powerstone.charge) > 0)
    .filter((stone) => stoneCanPay({
      kind: stone.system.powerstone.kind,
      college: String(stone.system.powerstone.college ?? ""),
      itemName: String(stone.system.powerstone.dedicatedTo ?? ""),
      spellColleges: spell?.system?.colleges ?? [],
      castThrough,
    }))
    .map((stone) => ({
      id: String(stone.id),
      name: String(stone.name ?? ""),
      kind: stone.system.powerstone.kind,
      charge: Number(stone.system.powerstone.charge) || 0,
      capacity: Number(stone.system.powerstone.capacity) || 0,
    }));
}

/**
 * Recharges a character's stones for the world time passed since each was
 * last recharged, at the mana where the character is (p. 69). The carried
 * stones are kept together, within six feet of one another, so only the
 * largest of them recharge; a stored one is taken to be kept apart. A stone
 * never recharged before starts its clock now.
 *
 * Returns how many points came back in all.
 */
export async function rechargeStonesOf(actor: any, mana: ManaLevel): Promise<number> {
  if (!actor?.isOwner) return 0;
  const now = Number((game as any).time?.worldTime ?? 0) || 0;
  const stones = stonesOf(actor);
  const states: StoneState[] = stones.map((stone) => ({
    capacity: Number(stone.system.powerstone.capacity) || 0,
    charge: Number(stone.system.powerstone.charge) || 0,
    kind: stone.system.powerstone.kind,
    together: stone.system?.carried !== false,
  }));
  let gained = 0;
  const updates: object[] = [];
  stones.forEach((stone, index) => {
    const last = stone.system.powerstone.lastRecharged;
    if (last === null || last === undefined) {
      updates.push({ _id: stone.id, "system.powerstone.lastRecharged": now });
      return;
    }
    const charge = rechargeStones(states, mana, now - Number(last))[index]!;
    gained += charge - states[index]!.charge;
    updates.push({ _id: stone.id, "system.powerstone.charge": charge, "system.powerstone.lastRecharged": now });
  });
  if (updates.length) await actor.updateEmbeddedDocuments("Item", updates);
  return gained;
}

/** Spends points of a stone's charge. */
export async function spendStone(actor: any, stoneId: string, points: number): Promise<void> {
  const stone = actor?.items?.get(stoneId);
  if (!stone || points <= 0) return;
  const charge = Math.max(0, (Number(stone.system.powerstone.charge) || 0) - points);
  await stone.update({ "system.powerstone.charge": charge });
}
