/**
 * The GM Screen: the Basic Set's tables in eight tabs, the book's text beside
 * them where a content module gives it, and a roll button on the tables that
 * are rolled on.
 *
 * Everything shown is built by `gm-screen/assemble.ts` from the rules the
 * automation uses; this is only the window. All the tabs are drawn at once,
 * so switching tab and searching need no re-render, and a search can count
 * what it finds on the tabs not showing.
 *
 * Players open the same window read-only: the GM can keep tabs from them, or
 * the whole screen.
 */

import { SYSTEM_ID } from "../constants.js";
import { assembleScreen, proseTargets, type ScreenTab } from "../gm-screen/assemble.js";
import { moduleProseHtml, proseEntries, proseHtml } from "../gm-screen/prose.js";
import { ROLLED_HOOK, foundryContext, rollOnSection, type ScreenRoll } from "../gm-screen/roll.js";
import { K } from "../gm-screen/sections/shared.js";
import {
  GM_SCREEN_COLLAPSED,
  GM_SCREEN_TAB,
  collapsedSections,
  hiddenTabs,
  lastTab,
  mayOpen,
  remember,
} from "../gm-screen/settings.js";
import { screenView } from "../gm-screen/view.js";
import { normaliseQuery } from "../rule-search.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** How many journal entries are loaded at once. */
const PROSE_BATCH = 6;

/** Where to take the screen when it opens: a tab, a section on it, a row to mark. */
export interface ScreenFocus {
  tab?: string;
  section?: string;
  row?: string;
  total?: number;
}

export class GmScreen extends HandlebarsApplicationMixin(ApplicationV2) {
  static override DEFAULT_OPTIONS = {
    id: "gworld-gm-screen",
    classes: ["gworld", "gworld-gm-screen"],
    position: { width: 1100, height: 750 },
    window: { title: "GWORLD.GmScreen.Title", icon: "fa-solid fa-table-columns", resizable: true },
    actions: {
      tab: GmScreen.#onTab,
      collapse: GmScreen.#onCollapse,
      roll: GmScreen.#onRoll,
      clearSearch: GmScreen.#onClearSearch,
      toggleMenu: GmScreen.#onToggleMenu,
      toggleRows: GmScreen.#onToggleRows,
      goto: GmScreen.#onGoto,
      readMore: GmScreen.#onReadMore,
    },
  };

  static override PARTS = {
    screen: {
      template: `systems/${SYSTEM_ID}/templates/apps/gm-screen.hbs`,
      scrollable: [".gs-body"],
    },
  };

  /** The tab showing. */
  #tab = lastTab();

  /** What is typed in the search box, kept across a re-render. */
  #query = "";

  /** The sections folded, as this user left them. */
  #collapsed = collapsedSections();

  /** Tables showing every row although a search is on. */
  #allRows = new Set<string>();

  /** Prose already loaded, by section or part id: the HTML, or "" for none. */
  #prose = new Map<string, string>();

  /** The journal entry for each section id, found once for the window's life. */
  #sources: Map<string, string> | null = null;

  /** Whether prose is loading now. */
  #loading = false;

  /** The screen as last built. */
  #tabs: ScreenTab[] = [];

  /** Where to go once drawn. */
  #focus: ScreenFocus | null = null;

  /** The last roll on each section, for the chip beside its dice. */
  #last = new Map<string, { row: string; total: number }>();

  #rolledHook: number | null = null;

  /** Opens the screen, or brings forward the one already open, at a tab or a row if asked. */
  static async open(focus: ScreenFocus = {}): Promise<GmScreen | null> {
    if (!mayOpen()) {
      ui.notifications?.warn(game.i18n.localize(`${K}.Refused`));
      return null;
    }
    const open = (foundry.applications as any).instances?.get?.(GmScreen.DEFAULT_OPTIONS.id);
    const screen = open instanceof GmScreen ? open : new GmScreen();
    screen.#focus = focus;
    if (focus.tab) screen.#tab = focus.tab;
    await screen.render({ force: true });
    if (open instanceof GmScreen) (open as any).bringToFront?.();
    return screen;
  }

  /** A player's copy says in its title bar that it is read-only, as the mockups have it. */
  get title(): string {
    const title = game.i18n.localize(`${K}.Title`);
    return this.readOnly ? `${title} · ${game.i18n.localize(`${K}.ReadOnlyBadge`)}` : title;
  }

  /** Whether this is a player's read-only copy. */
  get readOnly(): boolean {
    return game.user?.isGM !== true;
  }

  override async _prepareContext(): Promise<Record<string, unknown>> {
    const context = foundryContext();
    this.#tabs = assembleScreen(context, { isGM: !this.readOnly, hiddenTabs: hiddenTabs() });
    if (!this.#tabs.some((tab) => tab.id === this.#tab)) this.#tab = this.#tabs[0]?.id ?? "tables";
    return screenView(this.#tabs, {
      t: context.t,
      active: this.#tab,
      readOnly: this.readOnly,
      query: this.#query,
      collapsed: this.#collapsed,
      last: this.#last,
    });
  }

  override async _onRender(context: object, options: object): Promise<void> {
    await super._onRender(context, options);
    const search = this.element.querySelector<HTMLInputElement>('input[name="gm-screen-search"]');
    search?.addEventListener("input", () => {
      this.#query = search.value;
      this.#applySearch();
    });
    this.#rolledHook ??= Hooks.on(ROLLED_HOOK, (rolled: ScreenRoll) =>
      this.#markRoll(rolled.section, rolled.row, rolled.total),
    );
    for (const [section, last] of this.#last) this.#markRow(section, last.row);
    this.#fillProse();
    this.#applySearch();
    void this.#loadProse();
    if (this.#focus) {
      const focus = this.#focus;
      this.#focus = null;
      if (focus.section && focus.row) this.#markRoll(focus.section, focus.row, focus.total ?? null);
      else if (focus.section) this.#reveal(focus.section);
    }
  }

  override async _onClose(options: object): Promise<void> {
    if (this.#rolledHook !== null) Hooks.off(ROLLED_HOOK, this.#rolledHook);
    this.#rolledHook = null;
    await super._onClose(options);
  }

  // ── tabs ──────────────────────────────────────────────────────────────────

  /** Shows a tab, without re-rendering: every tab is drawn already. */
  #showTab(id: string): void {
    if (!this.#tabs.some((tab) => tab.id === id)) return;
    this.#tab = id;
    void remember(GM_SCREEN_TAB, id);
    for (const button of this.element.querySelectorAll<HTMLElement>("[data-tab-button]")) {
      const on = button.dataset.tabButton === id;
      button.classList.toggle("active", on);
      button.setAttribute(
        button.getAttribute("role") === "tab" ? "aria-selected" : "aria-checked",
        String(on),
      );
    }
    for (const panel of this.element.querySelectorAll<HTMLElement>(".gs-panel"))
      panel.classList.toggle("active", panel.dataset.tab === id);
    const index = this.#tabs.findIndex((tab) => tab.id === id);
    const label = this.element.querySelector<HTMLElement>(".gs-menu-label");
    if (label) label.textContent = this.#tabs[index]?.label ?? "";
    const position = this.element.querySelector<HTMLElement>(".gs-menu-pos");
    if (position)
      position.textContent = game.i18n.format(`${K}.TabPosition`, {
        index: index + 1,
        count: this.#tabs.length,
      });
    this.element.querySelector(".gs-menu-pop")?.setAttribute("hidden", "");
    this.element.querySelector(".gs-menu")?.setAttribute("aria-expanded", "false");
    this.element.querySelector(".gs-body")?.scrollTo?.({ top: 0 });
    this.#applySearch();
  }

  static #onTab(this: GmScreen, _event: Event, target: HTMLElement): void {
    this.#showTab(String(target.dataset.tabButton ?? ""));
  }

  static #onToggleMenu(this: GmScreen, _event: Event, target: HTMLElement): void {
    const pop = this.element.querySelector<HTMLElement>(".gs-menu-pop");
    if (!pop) return;
    const opening = pop.hasAttribute("hidden");
    pop.toggleAttribute("hidden", !opening);
    target.setAttribute("aria-expanded", String(opening));
  }

  // ── folding ───────────────────────────────────────────────────────────────

  static #onCollapse(this: GmScreen, _event: Event, target: HTMLElement): void {
    const card = target.closest<HTMLElement>(".gs-card");
    const id = card?.dataset.section;
    if (!card || !id) return;
    const folded = !card.classList.contains("collapsed");
    card.classList.toggle("collapsed", folded);
    target.setAttribute("aria-expanded", String(!folded));
    if (folded) this.#collapsed[id] = true;
    else delete this.#collapsed[id];
    void remember(GM_SCREEN_COLLAPSED, this.#collapsed);
  }

  static #onReadMore(this: GmScreen, _event: Event, target: HTMLElement): void {
    const prose = target.closest<HTMLElement>(".gs-prose");
    if (!prose) return;
    const open = prose.classList.toggle("open");
    target.textContent = game.i18n.localize(`${K}.${open ? "ReadLess" : "ReadMore"}`);
    target.setAttribute("aria-expanded", String(open));
  }

  // ── rolling ───────────────────────────────────────────────────────────────

  static async #onRoll(this: GmScreen, _event: Event, target: HTMLElement): Promise<void> {
    const id = target.closest<HTMLElement>(".gs-card")?.dataset.section;
    if (!id) return;
    target.setAttribute("disabled", "");
    try {
      await rollOnSection(id);
    } finally {
      target.removeAttribute("disabled");
    }
  }

  /** Marks the row a roll landed on, with the total beside the dice, and brings it into view. */
  #markRoll(section: string, row: string, total: number | null): void {
    if (total !== null) this.#last.set(section, { row, total });
    this.#markRow(section, row);
    const card = this.#card(section);
    const chip = card?.querySelector<HTMLElement>(".gs-last");
    if (chip && total !== null) {
      chip.removeAttribute("hidden");
      const value = chip.querySelector("b");
      if (value) value.textContent = String(total);
    }
    this.#reveal(section, row);
  }

  #markRow(section: string, row: string): void {
    const card = this.#card(section);
    if (!card) return;
    for (const hit of card.querySelectorAll(".gs-hit")) hit.classList.remove("gs-hit");
    card.querySelector(`tr[data-row="${CSS.escape(row)}"]`)?.classList.add("gs-hit");
  }

  #card(section: string): HTMLElement | null {
    return (
      this.element?.querySelector<HTMLElement>(`.gs-card[data-section="${CSS.escape(section)}"]`) ??
      null
    );
  }

  /** Shows a section: its tab, unfolded, scrolled to, and the row if one is named. */
  #reveal(section: string, row?: string): void {
    const tab = this.#tabs.find((t) => t.sections.some((s) => s.id === section));
    if (tab && tab.id !== this.#tab) this.#showTab(tab.id);
    const card = this.#card(section);
    if (!card) return;
    if (card.classList.contains("collapsed"))
      card.querySelector<HTMLElement>('[data-action="collapse"]')?.click();
    const into =
      (row ? card.querySelector<HTMLElement>(`tr[data-row="${CSS.escape(row)}"]`) : null) ?? card;
    into.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }

  static #onGoto(this: GmScreen, _event: Event, target: HTMLElement): void {
    const section = target.dataset.section;
    if (section) this.#reveal(section);
  }

  // ── search ────────────────────────────────────────────────────────────────

  static #onClearSearch(this: GmScreen): void {
    this.#query = "";
    const search = this.element.querySelector<HTMLInputElement>('input[name="gm-screen-search"]');
    if (search) {
      search.value = "";
      search.focus();
    }
    this.#applySearch();
  }

  static #onToggleRows(this: GmScreen, _event: Event, target: HTMLElement): void {
    const id = target.closest<HTMLElement>(".gs-card")?.dataset.section;
    if (!id) return;
    if (this.#allRows.has(id)) this.#allRows.delete(id);
    else this.#allRows.add(id);
    this.#applySearch();
  }

  /**
   * Filters the screen in place: cards that don't match are hidden, a table
   * matched only by some rows shows just those, the words found are marked,
   * and each tab says how many it has. Done without a re-render, which would
   * take the caret out of the box.
   */
  #applySearch(): void {
    const root = this.element;
    if (!root) return;
    const query = normaliseQuery(this.#query);
    unmark(root);
    const counts = new Map<string, number>();
    const found: Array<{ tab: string; section: string; title: string; snippet: string }> = [];

    for (const panel of root.querySelectorAll<HTMLElement>(".gs-panel")) {
      const tab = panel.dataset.tab ?? "";
      let count = 0;
      for (const card of panel.querySelectorAll<HTMLElement>(".gs-card[data-section], .gs-slot")) {
        const id = card.dataset.section ?? "";
        const words = `${card.dataset.search ?? ""} ${card.dataset.prose ?? ""}`;
        const hit = !query || words.includes(query);
        card.toggleAttribute("hidden", !hit);
        this.#filterRows(card, query, hit);
        if (!query || !hit) continue;
        count += 1;
        found.push({
          tab,
          section: id,
          title: card.querySelector("h2")?.textContent?.trim() ?? "",
          snippet: snippet(card, query),
        });
        mark(card, query);
      }
      counts.set(tab, count);
      panel.querySelector(".gs-empty")?.toggleAttribute("hidden", !query || count > 0);
    }

    // The count on each tab, and in the box.
    for (const button of root.querySelectorAll<HTMLElement>("[data-tab-button]")) {
      const count = counts.get(button.dataset.tabButton ?? "") ?? 0;
      const badge = button.querySelector<HTMLElement>(".gs-count");
      if (badge) {
        badge.textContent = String(count);
        badge.toggleAttribute("hidden", !query);
        badge.classList.toggle("zero", count === 0);
      }
      button.classList.toggle("dim", Boolean(query) && count === 0);
    }
    const tabsWith = [...counts.values()].filter((n) => n > 0).length;
    const total = [...counts.values()].reduce((a, b) => a + b, 0);
    const summary = root.querySelector<HTMLElement>(".gs-search-count");
    if (summary)
      summary.textContent = query
        ? game.i18n.format(`${K}.Matches`, { count: total, tabs: tabsWith })
        : "";
    root.querySelector(".gs-search-clear")?.toggleAttribute("hidden", !query);
    root.querySelector(".gs-search")?.classList.toggle("searching", Boolean(query));

    // On the tab showing, what the other tabs found.
    for (const other of root.querySelectorAll<HTMLElement>(".gs-other")) {
      const tab = other.closest<HTMLElement>(".gs-panel")?.dataset.tab;
      const elsewhere = found.filter((f) => f.tab !== tab);
      other.toggleAttribute("hidden", !query || elsewhere.length === 0);
      const list = other.querySelector<HTMLElement>(".gs-other-list");
      const meta = other.querySelector<HTMLElement>(".gs-meta");
      if (meta)
        meta.textContent = game.i18n.format(`${K}.OtherTabsCount`, { count: elsewhere.length });
      if (!list) continue;
      list.replaceChildren(
        ...elsewhere.map((f) => {
          const link = document.createElement("button");
          link.type = "button";
          link.className = "gs-other-link";
          link.dataset.action = "goto";
          link.dataset.section = f.section;
          const tabLabel = this.#tabs.find((t) => t.id === f.tab)?.label ?? f.tab;
          for (const [cls, text] of [
            ["gs-other-tab", tabLabel],
            ["gs-other-title", f.title],
            ["gs-other-snippet", f.snippet],
          ] as const) {
            const span = document.createElement("span");
            span.className = cls;
            span.textContent = text;
            link.append(span);
          }
          mark(link.querySelector(".gs-other-snippet")!, query);
          return link;
        }),
      );
    }
  }

  /**
   * In a card the search matched, a table whose own title and notes don't
   * match shows only the rows that do, saying how many, with a button for
   * the rest.
   */
  #filterRows(card: HTMLElement, query: string, hit: boolean): void {
    const id = card.dataset.section ?? "";
    const rows = [...card.querySelectorAll<HTMLElement>("tr[data-search]")];
    const toggle = card.querySelector<HTMLElement>(".gs-showall");
    const meta = card.querySelector<HTMLElement>(".gs-meta-rows");
    // The card's own title and page: not its buttons, whose labels ("3d + mod", the last total) aren't what it says.
    const head = [
      card.querySelector(".gs-card-head h2"),
      card.querySelector(".gs-card-head > .gs-meta"),
    ]
      .map((el) => el?.textContent ?? "")
      .join(" ")
      .toLowerCase();
    const matching = rows.filter((row) => row.dataset.search!.includes(query));
    const narrow =
      Boolean(query) &&
      hit &&
      rows.length > 0 &&
      matching.length > 0 &&
      matching.length < rows.length &&
      !head.includes(query);
    const showAll = this.#allRows.has(id);
    for (const row of rows)
      row.toggleAttribute("hidden", narrow && !showAll && !row.dataset.search!.includes(query));
    if (toggle) {
      toggle.toggleAttribute("hidden", !narrow);
      toggle.textContent = game.i18n.localize(`${K}.${showAll ? "ShowMatches" : "ShowAllRows"}`);
    }
    if (meta)
      meta.textContent = narrow
        ? ` · ${game.i18n.format(`${K}.RowsMatch`, { shown: matching.length, total: rows.length })}`
        : "";
  }

  // ── prose ─────────────────────────────────────────────────────────────────

  /** Puts the prose already loaded into its places. */
  #fillProse(): void {
    for (const slot of this.element.querySelectorAll<HTMLElement>(".gs-prose[data-prose-target]")) {
      const html = this.#prose.get(slot.dataset.proseTarget ?? "");
      if (html) this.#showProse(slot, html);
    }
  }

  #showProse(slot: HTMLElement, html: string): void {
    const text = slot.querySelector<HTMLElement>(".gs-prose-text");
    if (!text) return;
    text.innerHTML = html;
    slot.removeAttribute("hidden");
    const card = slot.closest<HTMLElement>(".gs-card");
    if (card) {
      card.dataset.prose = `${card.dataset.prose ?? ""} ${(text.textContent ?? "").toLowerCase()}`;
      // The section has the book's own words now, so the note offering them goes.
      if (slot.dataset.proseTarget === card.dataset.section)
        card.querySelector(".gs-foot")?.setAttribute("hidden", "");
    }
    // Long passages fold after a few lines, with a toggle for the rest.
    requestAnimationFrame(() =>
      slot.classList.toggle("long", text.scrollHeight > text.clientHeight + 4),
    );
  }

  /**
   * Loads the prose the content modules give, the tab showing first. Each
   * entry is loaded once; later renders put it back from the cache.
   */
  async #loadProse(): Promise<void> {
    // One load at a time: a render while one runs leaves it to finish, and
    // the next render picks up anything it didn't reach.
    if (this.#loading) return;
    this.#loading = true;
    try {
      await this.#loadMissingProse();
    } finally {
      this.#loading = false;
    }
  }

  async #loadMissingProse(): Promise<void> {
    // The packs are indexed once for the window's life, not on every render.
    try {
      this.#sources ??= await proseEntries();
    } catch (error) {
      console.warn("gworld | the GM Screen could not look for prose", error);
      return;
    }
    const sources = this.#sources;
    const order = [...this.#tabs].sort(
      (a, b) => Number(b.id === this.#tab) - Number(a.id === this.#tab),
    );
    const wanted: Array<{ id: string; load: () => Promise<string> }> = [];
    const seen = new Set<string>();
    const want = (id: string, load: () => Promise<string>) => {
      if (this.#prose.has(id) || seen.has(id)) return;
      seen.add(id);
      wanted.push({ id, load });
    };
    for (const tab of order) {
      for (const section of tab.sections) {
        if (section.prose) want(section.id, () => moduleProseHtml(section.prose!));
      }
      for (const id of proseTargets([tab])) {
        const uuid = sources.get(id);
        if (uuid) want(id, () => proseHtml(uuid));
      }
    }
    // A few at a time, the tab showing first: fast enough to fill the screen,
    // without asking for every compendium document at once.
    let changed = false;
    for (let at = 0; at < wanted.length; at += PROSE_BATCH) {
      const batch = wanted.slice(at, at + PROSE_BATCH);
      const loaded = await Promise.all(
        batch.map(({ id, load }) =>
          load().catch((error: unknown) => {
            console.warn(`gworld | GM Screen prose for ${id} failed`, error);
            return "";
          }),
        ),
      );
      batch.forEach(({ id }, index) => {
        const html = loaded[index] ?? "";
        this.#prose.set(id, html);
        if (!html || !this.element) return;
        const slot = this.element.querySelector<HTMLElement>(
          `.gs-prose[data-prose-target="${CSS.escape(id)}"]`,
        );
        if (slot) {
          this.#showProse(slot, html);
          changed = true;
        }
      });
    }
    if (changed && this.#query) this.#applySearch();
  }
}

/** Takes out the marks a search left. */
function unmark(root: HTMLElement): void {
  for (const found of root.querySelectorAll("mark.gs-mark")) {
    const parent = found.parentNode;
    if (!parent) continue;
    parent.replaceChild(document.createTextNode(found.textContent ?? ""), found);
    parent.normalize();
  }
}

/** Marks every place the query appears in an element's text, leaving drawings alone. */
function mark(root: Element, query: string): void {
  if (!query) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      node.parentElement?.closest("svg, button.gs-dice, .gs-tools")
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT,
  });
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  for (const node of nodes) {
    const text = node.textContent ?? "";
    const lower = text.toLowerCase();
    let at = lower.indexOf(query);
    if (at < 0) continue;
    const fragment = document.createDocumentFragment();
    let from = 0;
    while (at >= 0) {
      fragment.append(text.slice(from, at));
      const marked = document.createElement("mark");
      marked.className = "gs-mark";
      marked.textContent = text.slice(at, at + query.length);
      fragment.append(marked);
      from = at + query.length;
      at = lower.indexOf(query, from);
    }
    fragment.append(text.slice(from));
    node.replaceWith(fragment);
  }
}

/** A line of a card where the query appears, for the list of matches elsewhere. */
function snippet(card: HTMLElement, query: string): string {
  const lines = card.querySelectorAll<HTMLElement>(
    "tr, .gs-item, .gs-note, .gs-prose-text p, .gs-card-head h2",
  );
  for (const line of lines) {
    const text = (line.textContent ?? "").replace(/\s+/g, " ").trim();
    if (text.toLowerCase().includes(query))
      return text.length > 90 ? `${text.slice(0, 87)}…` : text;
  }
  return "";
}
