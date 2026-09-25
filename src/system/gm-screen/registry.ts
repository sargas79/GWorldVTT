/**
 * What modules add to the GM Screen: their own tables, lists and tabs, and
 * the tables that fill the places the Basic Set leaves (awe and confusion,
 * posture and hit locations). Everything a module adds is marked with its
 * title, so nobody mistakes it for the Basic Set.
 */

import { GM_SCREEN_SLOTS, GM_SCREEN_TABS, SYSTEM_SECTIONS } from "./layout.js";
import type { GmItem, GmSectionDef, GmTabDef } from "./types.js";

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

function refuse(what: string, why: string): null {
  console.warn(`gworld | GM Screen ${what} not registered: ${why}`);
  return null;
}

/** Where a module's section goes: a tab and a place in it, or a slot the Basic Set leaves. */
interface Placement {
  module: string;
  key: string;
  /** A tab's id: a system tab or a registered one. Not needed with `slot`. */
  tab?: string;
  /** The id of the section it follows; the tab's end otherwise. */
  after?: string;
  /** One of the places kept for a table the Basic Set does not have. */
  slot?: string;
  title: string;
  cite?: string;
  notes?: string[];
  gmOnly?: boolean;
  /** Its prose: HTML, or a journal entry's uuid. */
  prose?: string;
}

export interface GmTableRegistration extends Placement {
  columns: string[];
  rows: string[][] | (() => string[][]);
  /** Rolling on it from the screen: the dice, anything asked first, and the index of the row a total lands on. */
  roll?: { formula: string; ask?: "margin" | "modifier"; rowFor: (total: number) => number };
}

export interface GmRuleBlockRegistration extends Placement {
  items: GmItem[] | (() => GmItem[]);
}

export interface GmTabRegistration {
  module: string;
  key: string;
  label: string;
  icon?: string;
}

export interface AddonSectionDef extends GmSectionDef {
  after?: string;
}

const tabs: GmTabDef[] = [];
const sections: AddonSectionDef[] = [];

function tabIds(): string[] {
  return [...GM_SCREEN_TABS.map((t) => t.id), ...tabs.map((t) => t.id)];
}

function takenIds(): Set<string> {
  return new Set([...SYSTEM_SECTIONS.map((s) => s.id), ...sections.map((s) => s.id)]);
}

/** Checks a placement, and returns the section's id and tab, or why not. */
function place(r: Placement, what: string): { id: string; tab: string } | string {
  if (typeof r.module !== "string" || !IDENTIFIER.test(r.module) || typeof r.key !== "string" || !IDENTIFIER.test(r.key)) {
    return "the module id or key is missing or malformed";
  }
  if (typeof r.title !== "string" || !r.title.trim()) return "it has no title";
  const id = `${r.module}.${r.key}`;
  if (takenIds().has(id)) return `${what} ${id} is already registered`;
  if (r.slot !== undefined) {
    if (!GM_SCREEN_SLOTS.includes(r.slot)) return `slot must be one of ${GM_SCREEN_SLOTS.join(", ")}`;
    return { id, tab: SYSTEM_SECTIONS.find((s) => s.id === r.slot)!.tab };
  }
  if (typeof r.tab !== "string" || !tabIds().includes(r.tab)) return `tab must be one of ${tabIds().join(", ")}`;
  return { id, tab: r.tab };
}

function common(r: Placement, id: string, tab: string): AddonSectionDef {
  return {
    id,
    tab,
    title: r.title.trim(),
    ...(typeof r.cite === "string" && r.cite.trim() ? { cite: r.cite.trim() } : {}),
    module: r.module,
    gmOnly: r.gmOnly === true,
    prose: typeof r.prose === "string" && r.prose.trim() ? r.prose : null,
    // A slot's filler goes where the slot is; `after` names it.
    ...(r.slot ? { after: r.slot } : typeof r.after === "string" ? { after: r.after } : {}),
  };
}

function notesOf(r: Placement): string[] {
  return Array.isArray(r.notes) ? r.notes.filter((note): note is string => typeof note === "string") : [];
}

/** Registers a table. Returns its section id, `<module>.<key>`, or null. */
export function registerGmScreenTable(registration: GmTableRegistration): string | null {
  const r = registration ?? ({} as GmTableRegistration);
  const placed = place(r, "table");
  if (typeof placed === "string") return refuse(`table ${r?.module}.${r?.key}`, placed);
  if (!Array.isArray(r.columns) || r.columns.some((c) => typeof c !== "string")) return refuse(`table ${placed.id}`, "columns must be a list of strings");
  if (!Array.isArray(r.rows) && typeof r.rows !== "function") return refuse(`table ${placed.id}`, "rows must be a list or a function");
  if (r.roll && (typeof r.roll.formula !== "string" || typeof r.roll.rowFor !== "function")) return refuse(`table ${placed.id}`, "a roll needs a formula and a rowFor function");
  const rowsOf = r.rows;
  const roll = r.roll;
  sections.push({
    ...common(r, placed.id, placed.tab),
    build: () => {
      const rows = typeof rowsOf === "function" ? rowsOf() : rowsOf;
      return {
        parts: [{
          content: {
            kind: "table",
            columns: [...r.columns],
            rows: (Array.isArray(rows) ? rows : []).map((cells, index) => ({ key: String(index), cells: (Array.isArray(cells) ? cells : []).map(String) })),
          },
        }],
        notes: notesOf(r),
      };
    },
    ...(roll
      ? { roll: { formula: roll.formula, ...(roll.ask === "margin" || roll.ask === "modifier" ? { ask: roll.ask } : {}), rowFor: (total: number) => String(roll.rowFor(total)) } }
      : {}),
  });
  return placed.id;
}

/** Registers a list of terms and what each comes to. Returns its section id, or null. */
export function registerGmScreenRuleBlock(registration: GmRuleBlockRegistration): string | null {
  const r = registration ?? ({} as GmRuleBlockRegistration);
  const placed = place(r, "rule block");
  if (typeof placed === "string") return refuse(`rule block ${r?.module}.${r?.key}`, placed);
  if (!Array.isArray(r.items) && typeof r.items !== "function") return refuse(`rule block ${placed.id}`, "items must be a list or a function");
  const itemsOf = r.items;
  sections.push({
    ...common(r, placed.id, placed.tab),
    build: () => {
      const items = typeof itemsOf === "function" ? itemsOf() : itemsOf;
      return {
        parts: [{
          content: {
            kind: "rules",
            items: (Array.isArray(items) ? items : [])
              .filter((item) => typeof item?.term === "string" && typeof item?.text === "string")
              .map((item) => ({ term: item.term, text: item.text })),
          },
        }],
        notes: notesOf(r),
      };
    },
  });
  return placed.id;
}

/** Registers a tab of the module's own, after the system's. Returns its id, or null. */
export function registerGmScreenTab(registration: GmTabRegistration): string | null {
  const r = registration ?? ({} as GmTabRegistration);
  if (typeof r.module !== "string" || !IDENTIFIER.test(r.module) || typeof r.key !== "string" || !IDENTIFIER.test(r.key)) {
    return refuse(`tab ${r?.module}.${r?.key}`, "the module id or key is missing or malformed");
  }
  const id = `${r.module}.${r.key}`;
  if (typeof r.label !== "string" || !r.label.trim()) return refuse(`tab ${id}`, "it has no label");
  if (tabIds().includes(id)) return refuse(`tab ${id}`, "that key is already registered");
  tabs.push({ id, label: r.label.trim(), icon: typeof r.icon === "string" && r.icon ? r.icon : "fa-solid fa-puzzle-piece", module: r.module });
  return id;
}

export function registeredGmScreenTabs(): GmTabDef[] {
  return [...tabs];
}

export function registeredGmScreenSections(): AddonSectionDef[] {
  return [...sections];
}
