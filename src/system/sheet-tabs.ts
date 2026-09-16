/**
 * The character sheet tabs an add-on module can put things on, and where each
 * sheet shows them.
 *
 * Modules register sheet sections and item types against a tab name. The
 * classic sheet has eight tabs; the new sheet folds them into its own seven
 * and a Magic tab. A module written for either keeps working on both: every
 * name is accepted, and each sheet's part gathers every name that belongs on
 * it.
 *
 *   - `attributes` shows on the new sheet's Overview.
 *   - `body` shows on its Combat tab.
 *   - `gear` and `inventory` are one place, and so are `description` and
 *     `journal`.
 *   - `overview` and `progression`, which the classic sheet has no tab for,
 *     show on its Attributes tab, where the attributes and the points ledger
 *     are.
 *
 * Kept apart from the sheets so it can be tested without Foundry.
 */

/** The classic sheet's tabs, the names the API has always taken. */
export const CLASSIC_TABS = ["attributes", "skills", "magic", "traits", "combat", "body", "gear", "description"] as const;

/** The new sheet's tabs. */
export const NEW_SHEET_TABS = ["overview", "skills", "traits", "combat", "inventory", "progression", "journal", "magic"] as const;

/** Every name a module may register against. */
export const TAB_NAMES = [
  ...CLASSIC_TABS,
  ...NEW_SHEET_TABS.filter((tab) => !(CLASSIC_TABS as readonly string[]).includes(tab)),
] as unknown as readonly TabName[];

export type TabName = (typeof CLASSIC_TABS)[number] | (typeof NEW_SHEET_TABS)[number];

export type SheetKind = "classic" | "new";

const SHOWN_ON: Record<SheetKind, Record<string, readonly TabName[]>> = {
  classic: {
    attributes: ["attributes", "overview", "progression"],
    skills: ["skills"],
    magic: ["magic"],
    traits: ["traits"],
    combat: ["combat"],
    body: ["body"],
    gear: ["gear", "inventory"],
    description: ["description", "journal"],
  },
  new: {
    overview: ["attributes", "overview"],
    skills: ["skills"],
    traits: ["traits"],
    combat: ["combat", "body"],
    inventory: ["gear", "inventory"],
    progression: ["progression"],
    journal: ["description", "journal"],
    magic: ["magic"],
  },
};

/** Whether a name is one a module may register against. */
export function isTabName(value: unknown): value is TabName {
  return typeof value === "string" && (TAB_NAMES as readonly string[]).includes(value);
}

/**
 * The registration names a sheet's part shows, in the order their contents
 * are listed. Empty for a part that is not a tab, such as the header.
 */
export function registeredTabsShownOn(sheet: SheetKind, part: string): readonly TabName[] {
  return SHOWN_ON[sheet][part] ?? [];
}

/** The part of a sheet that shows what was registered against a name. */
export function partShowing(sheet: SheetKind, tab: TabName): string {
  const entry = Object.entries(SHOWN_ON[sheet]).find(([, names]) => names.includes(tab));
  return entry ? entry[0] : tab;
}
