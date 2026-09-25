/**
 * The GM Screen as its template draws it: the assembled tabs, with what this
 * user left folded, the tab showing, the last roll on each table, and each
 * table's cells knowing whether they are pinned or centred. Pure, so the
 * window only has to hand it to Handlebars.
 */

import type { ScreenSection, ScreenTab } from "./assemble.js";
import { K } from "./sections/shared.js";
import type { GmContent, GmTable, Translate } from "./types.js";

/** A table as the template draws it: each cell knowing whether it is pinned or centred. */
export function tableView(table: GmTable) {
  const pinned = Math.max(0, Math.min(2, table.pinned ?? 0));
  const centered = new Set(table.centered ?? []);
  const cellClass = (index: number) =>
    [index < pinned ? `gs-pin gs-pin-${index}` : "", centered.has(index) ? "gs-c" : ""]
      .filter(Boolean)
      .join(" ");
  const badgeAt = pinned ? pinned - 1 : 0;
  return {
    ...table,
    scrolls: pinned > 0,
    head: table.columns.map((label, index) => ({ label, cls: cellClass(index) })),
    groups:
      table.groups?.map((group, index) => ({
        ...group,
        cls: index === 0 && pinned ? "gs-pin gs-pin-group" : "",
      })) ?? null,
    body: table.rows.map((row) => ({
      key: row.key ?? "",
      depth: row.depth ?? 0,
      search: row.cells.join(" ").toLowerCase(),
      cells: row.cells.map((text, index) => ({
        text,
        cls: cellClass(index),
        badge: index === badgeAt ? (row.source ?? null) : null,
        sub: index === badgeAt && row.depth === 1,
      })),
    })),
  };
}

function contentView(content: GmContent) {
  if (content.kind === "table") return { table: tableView(content) };
  if (content.kind === "rules") return { rules: content.items };
  return { diagram: content };
}

/** The label on a section's dice button: what gets rolled. */
function diceLabel(section: ScreenSection, t: Translate): string {
  return t(`${K}.Dice.${section.roll?.ask ?? "plain"}`);
}

export interface ViewOptions {
  t: Translate;
  active: string;
  readOnly: boolean;
  query: string;
  collapsed: Record<string, boolean>;
  last: Map<string, { row: string; total: number }>;
}

/** The template's context. */
export function screenView(
  tabs: readonly ScreenTab[],
  options: ViewOptions,
): Record<string, unknown> {
  const { t } = options;
  const active = tabs.findIndex((tab) => tab.id === options.active);
  return {
    isGM: !options.readOnly,
    readOnly: options.readOnly,
    query: options.query,
    active: options.active,
    activeLabel: tabs[active]?.label ?? "",
    activePosition: t(`${K}.TabPosition`, { index: active + 1, count: tabs.length }),
    tabs: tabs.map((tab) => ({
      ...tab,
      active: tab.id === options.active,
      sections: tab.sections.map((section) => ({
        ...section,
        collapsed: options.collapsed[section.id] === true,
        diceLabel: section.roll ? diceLabel(section, t) : "",
        last: options.last.get(section.id)?.total ?? null,
        slotText: section.placeholder ? t(`${K}.Slot.${section.id}`) : "",
        parts: section.parts.map((part) => ({ ...part, ...contentView(part.content) })),
      })),
    })),
  };
}
