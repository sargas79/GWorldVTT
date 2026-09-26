/**
 * What a card in the chat says about a trait, a skill or a piece of gear a
 * player shows the table: the figures that matter at a glance, beside its
 * name. The description follows them, folded, for whoever wants to read it.
 *
 * Kept apart from the posting so it can be tested without Foundry.
 */

import { traitDisplayName } from "../rules/traits.js";
import { summarise } from "./item-summary.js";

/** One figure on the card: a label to localize and the value beside it. */
export interface ItemCardFact {
  label: string;
  value: string;
}

export interface ItemCardData {
  name: string;
  /** Localization keys for what the item is: its type, and a trait's category. */
  kinds: string[];
  facts: ItemCardFact[];
}

const signed = (value: number) => (value > 0 ? `+${value}` : String(value));

const TRAIT_CATEGORIES = ["advantage", "perk", "disadvantage", "quirk"];
const PHYSICAL = ["equipment", "armor", "shield"];

/** The card for an item, from its type, name and system data. */
export function itemCardData(item: { type: string; name?: unknown; system?: any }): ItemCardData {
  const system = item.system ?? {};
  const name = String(item.name ?? "");
  const kinds = [`TYPES.Item.${item.type}`];
  const facts: ItemCardFact[] = [];

  if (item.type === "trait") {
    const category = TRAIT_CATEGORIES.includes(system.category) ? system.category : "advantage";
    kinds.push(`GWORLD.SheetV2.Category.${category}`);
    const levels = Number(system.levels ?? 0) || 0;
    if (levels > 0 && (system.pointsPerLevel || system.costTable?.length)) {
      facts.push({ label: "GWORLD.ItemCard.Levels", value: String(levels) });
    }
    const reaction = Number(system.reactionModifier ?? 0) || 0;
    if (reaction) facts.push({ label: "GWORLD.ItemCard.Reaction", value: signed(reaction) });
    if (system.selfControl) facts.push({ label: "GWORLD.ItemCard.SelfControl", value: String(system.selfControl) });
    facts.push({ label: "GWORLD.ItemCard.Points", value: `${Number(system.totalPoints ?? system.points ?? 0) || 0} CP` });
    return { name: traitDisplayName(name, String(system.specialty ?? "")), kinds, facts };
  }

  if (PHYSICAL.includes(item.type)) {
    if (item.type === "armor") facts.push({ label: "GWORLD.ItemCard.Dr", value: String(system.dr ?? 0) });
    if (item.type === "shield") facts.push({ label: "GWORLD.ItemCard.Db", value: String(system.db ?? 0) });
    const quantity = Number(system.quantity ?? 1) || 0;
    if (quantity > 1) facts.push({ label: "GWORLD.ItemCard.Quantity", value: String(quantity) });
    const weight = Number(system.weight ?? 0) || 0;
    if (weight) facts.push({ label: "GWORLD.ItemCard.Weight", value: `${weight} lb` });
    const cost = Number(system.cost ?? 0) || 0;
    if (cost) facts.push({ label: "GWORLD.ItemCard.Cost", value: `$${cost}` });
    return { name, kinds, facts };
  }

  const summary = summarise(item.type, system);
  if (summary) facts.push({ label: "", value: summary });
  if (item.type === "skill" || item.type === "technique" || item.type === "spell") {
    const points = Number(system.points ?? 0) || 0;
    if (points) facts.push({ label: "GWORLD.ItemCard.Points", value: `${points} CP` });
  }
  return { name, kinds, facts };
}
