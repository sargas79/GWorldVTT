/**
 * The picture an item gets when nobody has chosen one for it.
 *
 * Foundry gives every new item the same bag, and a sheet where a skill, a
 * disadvantage and a sword all wear the same badge is a sheet that has to be
 * read rather than scanned. Each kind gets its own default instead, drawn
 * from the icons Foundry itself ships so nothing has to be bundled or
 * served: a book for a skill, an arrow up or down for an advantage or a
 * disadvantage, a sword for a weapon.
 *
 * An image somebody chose always wins. Only the bag -- or nothing at all --
 * is treated as "no choice made", so a compendium entry or a GM's own art
 * comes through untouched.
 *
 * Kept apart from the document class so it can be tested without Foundry.
 */

import { gearGroupOf } from "./gear-groups.js";

/** What Foundry gives every item, and what this module replaces. */
export const GENERIC_ITEM_ICON = "icons/svg/item-bag.svg";

const TRAIT_ICONS: Record<string, string> = {
  advantage: "icons/svg/upgrade.svg",
  disadvantage: "icons/svg/downgrade.svg",
  perk: "icons/svg/up.svg",
  quirk: "icons/svg/daze.svg",
};

/** Equipment by the group the Gear tab files it under. */
const GEAR_ICONS: Record<string, string> = {
  weapon: "icons/svg/sword.svg",
  tool: "icons/svg/clockwork.svg",
  consumable: "icons/svg/tankard.svg",
  misc: "icons/svg/chest.svg",
};

const TYPE_ICONS: Record<string, string> = {
  skill: "icons/svg/book.svg",
  technique: "icons/svg/target.svg",
  equipment: "icons/svg/chest.svg",
  armor: "icons/svg/statue.svg",
  shield: "icons/svg/shield.svg",
  language: "icons/svg/sound.svg",
  template: "icons/svg/levels.svg",
  spell: "icons/svg/aura.svg",
  modifier: "icons/svg/lever.svg",
};

/**
 * The default for an item of this type.
 *
 * A trait's picture follows its category, since an advantage and a quirk are
 * the same data model and nothing else tells them apart; a piece of
 * equipment's follows the group the Gear tab would file it under, so a sword
 * filed as a tool is still drawn as a sword.
 */
export function defaultItemIcon(type: string, system?: any): string {
  if (type === "trait") {
    return TRAIT_ICONS[String(system?.category ?? "")] ?? TRAIT_ICONS.advantage ?? GENERIC_ITEM_ICON;
  }
  if (type === "equipment") {
    return GEAR_ICONS[gearGroupOf({ type, system: system ?? {} })] ?? GENERIC_ITEM_ICON;
  }
  return TYPE_ICONS[type] ?? GENERIC_ITEM_ICON;
}

/** Whether an image is Foundry's bag, or no image at all: no choice made. */
export function isGenericIcon(img: unknown): boolean {
  const path = String(img ?? "").trim();
  return path === "" || path === GENERIC_ITEM_ICON;
}

/**
 * The image to show for an item: what was chosen for it, else the default
 * for its kind, else the bag.
 */
export function itemIcon(img: unknown, type: string, system?: any): string {
  return isGenericIcon(img) ? defaultItemIcon(type, system) : String(img);
}
