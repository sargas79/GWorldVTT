/**
 * The GM Screen put together: every tab, and on each the Basic Set's sections
 * with what modules added in their places, built and ready to show. Pure, so
 * the window only has to draw it.
 */

import { GM_SCREEN_TABS, SYSTEM_SECTIONS } from "./layout.js";
import {
  registeredGmScreenSections,
  registeredGmScreenTabs,
  type AddonSectionDef,
} from "./registry.js";
import type { BuildContext, GmPart, GmRollSpec, GmSectionDef } from "./types.js";

export interface ScreenSection {
  id: string;
  tab: string;
  title: string;
  cite: string;
  /** The system's own summary, shown where no content module gives the prose. */
  summary: string;
  parts: GmPart[];
  notes: string[];
  /** The module that added it, as its title, or null for the Basic Set. */
  source: string | null;
  gmOnly: boolean;
  /** How the roll button asks before rolling, or null for a table that is not rolled on. */
  roll: { formula: string; ask: "margin" | "modifier" | null } | null;
  /** A module's own prose: HTML or a journal entry's uuid. */
  prose: string | null;
  /** Takes the whole width of the screen. */
  wide: boolean;
  /**
   * An empty place kept for an add-on's table, shown to the GM as a dashed
   * outline saying what would go there, and to nobody else.
   */
  placeholder: boolean;
  /** Everything the section says, lowercased, for the search box. */
  search: string;
}

export interface ScreenTab {
  id: string;
  label: string;
  hint: string;
  icon: string;
  source: string | null;
  sections: ScreenSection[];
}

export interface ScreenOptions {
  isGM: boolean;
  /** Tabs the GM keeps from players. */
  hiddenTabs?: readonly string[];
}

/** The sections of one tab, in order: the system's, with each module's after the one it names. */
function orderedSections(tab: string, added: readonly AddonSectionDef[]): GmSectionDef[] {
  const own = SYSTEM_SECTIONS.filter((def) => def.tab === tab);
  const mine = added.filter((def) => def.tab === tab);
  const known = new Set([...own, ...mine].map((def) => def.id));
  const out: GmSectionDef[] = [];
  const placed = new Set<string>();
  const place = (def: GmSectionDef) => {
    if (placed.has(def.id)) return;
    placed.add(def.id);
    out.push(def);
    placeAfter(def.id);
  };
  const placeAfter = (id: string): void => {
    for (const def of mine.filter((d) => d.after === id)) place(def);
  };
  for (const def of own) place(def);
  // Anything that names no section here, or one that isn't, goes at the end,
  // and so does anything left over: sections that name each other in a ring.
  for (const def of mine.filter((d) => !d.after || !known.has(d.after))) place(def);
  for (const def of mine) place(def);
  // A slot is a place, not a section: once something fills it, the filler is what shows.
  const filled = new Set(mine.map((def) => def.after));
  return out.filter((def) => !def.slot || !filled.has(def.id));
}

/** Everything a section says, for the search box. */
function searchText(section: Omit<ScreenSection, "search">): string {
  const words: string[] = [
    section.title,
    section.cite,
    section.summary,
    section.source ?? "",
    ...section.notes,
  ];
  for (const part of section.parts) {
    words.push(part.heading ?? "", ...(part.notes ?? []));
    const content = part.content;
    if (content.kind === "table") {
      words.push(...content.columns);
      for (const row of content.rows) words.push(...row.cells);
    } else if (content.kind === "rules") {
      for (const item of content.items) words.push(item.term, item.text);
    } else {
      for (const item of content.legend) words.push(item.term, item.text);
    }
  }
  return words.filter(Boolean).join(" ").toLowerCase();
}

/** Builds one section, or null where its builder failed: one module's broken table should cost its own card, not the screen. */
export function buildSection(def: GmSectionDef, context: BuildContext): ScreenSection | null {
  let parts: GmPart[] = [];
  let notes: string[] = [];
  try {
    const built = def.build?.(context);
    parts = built?.parts ?? [];
    notes = built?.notes ?? [];
  } catch (error) {
    console.warn(`gworld | GM Screen section ${def.id} failed to build`, error);
    return null;
  }
  const { t } = context;
  const shown: Omit<ScreenSection, "search"> = {
    id: def.id,
    tab: def.tab,
    title: t(def.title),
    cite: def.cite ?? "",
    summary: def.summary ? t(def.summary) : "",
    parts,
    notes,
    source: def.module ? context.moduleTitle(def.module) : null,
    gmOnly: def.gmOnly === true,
    roll: def.roll ? { formula: def.roll.formula, ask: def.roll.ask ?? null } : null,
    prose: def.prose ?? null,
    wide: def.wide === true,
    placeholder: def.slot === true,
  };
  return { ...shown, search: searchText(shown) };
}

/** The whole screen, as this user may see it. */
export function assembleScreen(context: BuildContext, options: ScreenOptions): ScreenTab[] {
  const added = registeredGmScreenSections();
  const hidden = new Set(options.isGM ? [] : (options.hiddenTabs ?? []));
  const tabs = [...GM_SCREEN_TABS, ...registeredGmScreenTabs()].filter(
    (tab) => !hidden.has(tab.id),
  );
  return tabs.map((tab) => ({
    id: tab.id,
    label: context.t(tab.label),
    hint: tab.hint ? context.t(tab.hint) : "",
    icon: tab.icon,
    source: tab.module ? context.moduleTitle(tab.module) : null,
    sections: orderedSections(tab.id, added)
      // An empty slot is for the GM to know it is there; a player has nothing to see.
      .filter((def) => options.isGM || (!def.gmOnly && !def.slot))
      .map((def) => buildSection(def, context))
      .filter((section): section is ScreenSection => section !== null),
  }));
}

/** Every section there is, the system's and the modules', by id. */
export function sectionDef(id: string): GmSectionDef | undefined {
  return (
    SYSTEM_SECTIONS.find((def) => def.id === id) ??
    registeredGmScreenSections().find((def) => def.id === id)
  );
}

/** How a section is rolled on, or null where it is not. */
export function rollSpec(id: string): GmRollSpec | null {
  return sectionDef(id)?.roll ?? null;
}

/**
 * Every id a journal page can name to give its prose: each section's, and each
 * part's that has one of its own.
 */
export function proseTargets(tabs: readonly ScreenTab[]): string[] {
  const ids: string[] = [];
  for (const tab of tabs) {
    for (const section of tab.sections) {
      ids.push(section.id);
      for (const part of section.parts) if (part.id) ids.push(part.id);
    }
  }
  return ids;
}
