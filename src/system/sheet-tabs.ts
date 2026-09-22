/**
 * The character sheet tabs an add-on module can put things on, and where the
 * sheet shows them.
 *
 * Modules register sheet sections and item types against a tab name. The
 * sheet has eight tabs, and it still takes the names of the classic sheet it
 * replaced, so a module written for that one keeps working: each tab gathers
 * every name that belongs on it.
 *
 *   - `attributes` shows on the Overview.
 *   - `body` shows on the Combat tab.
 *   - `gear` and `inventory` are one place, and so are `description` and
 *     `journal`.
 *
 * Kept apart from the sheet so it can be tested without Foundry.
 */

/** The character sheet's tabs. */
export const SHEET_TAB_IDS = ["overview", "skills", "traits", "combat", "inventory", "progression", "journal", "magic"] as const;

/** The classic sheet's tab names that are not the sheet's own, still taken from modules. */
export const FOLDED_TABS = ["attributes", "body", "gear", "description"] as const;

/** Every name a module may register against. */
export const TAB_NAMES: readonly TabName[] = [...SHEET_TAB_IDS, ...FOLDED_TABS];

export type TabName = (typeof SHEET_TAB_IDS)[number] | (typeof FOLDED_TABS)[number];

const SHOWN_ON: Record<string, readonly TabName[]> = {
  overview: ["attributes", "overview"],
  skills: ["skills"],
  traits: ["traits"],
  combat: ["combat", "body"],
  inventory: ["gear", "inventory"],
  progression: ["progression"],
  journal: ["description", "journal"],
  magic: ["magic"],
};

/** Whether a name is one a module may register against. */
export function isTabName(value: unknown): value is TabName {
  return typeof value === "string" && (TAB_NAMES as readonly string[]).includes(value);
}

/**
 * The registration names a sheet part shows, in the order their contents are
 * listed. Empty for a part that is not a tab, such as the header.
 */
export function registeredTabsShownOn(part: string): readonly TabName[] {
  return SHOWN_ON[part] ?? [];
}

/** The part of the sheet that shows what was registered against a name. */
export function partShowing(tab: TabName): string {
  const entry = Object.entries(SHOWN_ON).find(([, names]) => names.includes(tab));
  return entry ? entry[0] : tab;
}
