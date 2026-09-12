/**
 * How the Gear tab sorts what a character carries.
 *
 * One inventory used to be one list: a hardsuit, a laser sight, a week of
 * rations and a horse in whatever order they were added. Each piece now has
 * a kind, and the tab shows them under it, with a filter for looking at one
 * kind alone and "all" for the whole list.
 *
 * Armour and shields are their own item types and need no field to say what
 * they are. Equipment carries a category: a weapon is anything with an attack
 * mode, whatever its category says, since a sword filed as a tool is still a
 * sword; everything else is what its category says it is.
 *
 * Kept apart from the sheet so it can be tested without Foundry.
 */

/** The categories a piece of equipment can be given. */
export const EQUIPMENT_CATEGORIES = ["weapon", "tool", "consumable", "vehicle", "misc"] as const;
export type EquipmentCategory = (typeof EQUIPMENT_CATEGORIES)[number];

/** The groups the tab shows, in the order it shows them. */
export const GEAR_GROUPS = ["armor", "shield", "weapon", "tool", "consumable", "vehicle", "misc"] as const;
export type GearGroup = (typeof GEAR_GROUPS)[number];

/** What the grouping needs to know about an item. */
export interface GroupableGear {
  type: string;
  system?: {
    category?: string;
    meleeModes?: readonly unknown[];
    rangedModes?: readonly unknown[];
  };
}

/** Whether a category is one the model knows. */
export function isEquipmentCategory(value: unknown): value is EquipmentCategory {
  return typeof value === "string" && (EQUIPMENT_CATEGORIES as readonly string[]).includes(value);
}

/**
 * The group an item belongs under.
 *
 * A piece of equipment with an attack mode is a weapon whatever it was filed
 * as; one without is filed as its category says, and as miscellaneous gear
 * when the category is missing or unknown.
 */
export function gearGroupOf(item: GroupableGear): GearGroup {
  if (item.type === "armor") return "armor";
  if (item.type === "shield") return "shield";

  const system = item.system ?? {};
  // A vehicle with a gun on it is still a vehicle (Campaigns p. 467).
  if (system.category === "vehicle") return "vehicle";
  const armed = (system.meleeModes?.length ?? 0) > 0 || (system.rangedModes?.length ?? 0) > 0;
  if (armed) return "weapon";
  return isEquipmentCategory(system.category) ? system.category : "misc";
}

/** Splits items into the tab's groups, in the tab's order, leaving out empty ones. */
export function groupGear<T extends GroupableGear>(
  items: readonly T[],
): Array<{ group: GearGroup; items: T[] }> {
  return GEAR_GROUPS.map((group) => ({
    group,
    items: items.filter((item) => gearGroupOf(item) === group),
  })).filter((entry) => entry.items.length > 0);
}
