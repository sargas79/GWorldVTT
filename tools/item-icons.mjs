/**
 * Which picture each kind of item wears.
 *
 * Foundry hands every item the same bag, and a sheet where a skill, a
 * disadvantage and a sword all wear the same badge has to be read rather than
 * scanned. Each kind gets its own instead, drawn from the icons Foundry itself
 * ships so nothing has to be bundled or served.
 *
 * This lives in `tools/` rather than in `src/` because both halves of the
 * system need it and only one of them is TypeScript. The compendium's pictures
 * are decided when the packs are built -- the sidebar reads a pack's index,
 * which carries whatever was stored and never runs a document class -- while a
 * character's own items are decided at run time. Two copies of this table
 * would be two tables that disagree the first time one of them changed.
 */

/** What Foundry gives every item, and what this module replaces. */
export const GENERIC_ITEM_ICON = "icons/svg/item-bag.svg";

/** A trait's picture follows its category: an advantage is not a quirk. */
const TRAIT_ICONS = {
  advantage: "icons/svg/upgrade.svg",
  disadvantage: "icons/svg/downgrade.svg",
  perk: "icons/svg/up.svg",
  quirk: "icons/svg/daze.svg",
};

/** Equipment by the group the Gear tab files it under. */
const GEAR_ICONS = {
  weapon: "icons/svg/sword.svg",
  tool: "icons/svg/clockwork.svg",
  consumable: "icons/svg/tankard.svg",
  vehicle: "icons/svg/wingfoot.svg",
  misc: "icons/svg/chest.svg",
};

const TYPE_ICONS = {
  skill: "icons/svg/book.svg",
  technique: "icons/svg/target.svg",
  equipment: "icons/svg/chest.svg",
  armor: "icons/svg/statue.svg",
  shield: "icons/svg/shield.svg",
  language: "icons/svg/sound.svg",
  template: "icons/svg/levels.svg",
  spell: "icons/svg/aura.svg",
  ritual: "icons/svg/circle.svg",
  modifier: "icons/svg/lever.svg",
};

/**
 * The group a piece of equipment is filed under, for the picture alone.
 *
 * The same decision the Gear tab makes, and made here as well because the
 * build tool has no TypeScript to call: a vehicle is a vehicle even with a gun
 * on it, anything else with an attack mode is a weapon whatever it was filed
 * as, and gear with no category at all is miscellaneous.
 *
 * @param {{category?: string, meleeModes?: readonly unknown[], rangedModes?: readonly unknown[]}} system
 * @returns {keyof GEAR_ICONS}
 */
function gearGroupForIcon(system) {
  if (system?.category === "vehicle") return "vehicle";
  const armed = (system?.meleeModes?.length ?? 0) > 0 || (system?.rangedModes?.length ?? 0) > 0;
  if (armed) return "weapon";
  const category = String(system?.category ?? "");
  return category in GEAR_ICONS ? /** @type {keyof GEAR_ICONS} */ (category) : "misc";
}

/**
 * The default picture for an item of this type.
 *
 * @param {string} type
 * @param {any} [system]
 * @returns {string}
 */
export function defaultItemIcon(type, system) {
  if (type === "trait") {
    const category = String(system?.category ?? "");
    return TRAIT_ICONS[category] ?? TRAIT_ICONS.advantage;
  }
  if (type === "equipment") return GEAR_ICONS[gearGroupForIcon(system ?? {})];
  return TYPE_ICONS[type] ?? GENERIC_ITEM_ICON;
}

/**
 * Whether an image is Foundry's bag, or no image at all: no choice made.
 *
 * @param {unknown} img
 * @returns {boolean}
 */
export function isGenericIcon(img) {
  const path = String(img ?? "").trim();
  return path === "" || path === GENERIC_ITEM_ICON;
}

/**
 * The image to show for an item: what was chosen for it, else the default for
 * its kind.
 *
 * @param {unknown} img
 * @param {string} type
 * @param {any} [system]
 * @returns {string}
 */
export function itemIcon(img, type, system) {
  return isGenericIcon(img) ? defaultItemIcon(type, system) : String(img);
}
