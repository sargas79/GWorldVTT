/**
 * The page where the GM chooses which compendia the picker offers.
 *
 * Every Item pack the world can see is listed -- the system's own, the
 * world's, and any a module brings -- with a box beside each. A private pack
 * of expanded descriptions or campaign-specific gear can be offered to the
 * players in the same list as the book's, or instead of it.
 */

import { SYSTEM_ID } from "../constants.js";
import {
  COMPENDIUM_SOURCES_KEY,
  availablePacks,
  bookState,
  chosenSources,
  groupByBook,
  supersededPacks,
  type PackSummary,
} from "../compendium-sources.js";
import { loadSkillCatalog } from "../skill-catalog.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** The order the groups are shown in, and the label each carries. */
const GROUPS: ReadonlyArray<{ type: string; label: string }> = [
  { type: "system", label: "GWORLD.Sources.Group.system" },
  { type: "world", label: "GWORLD.Sources.Group.world" },
  { type: "module", label: "GWORLD.Sources.Group.module" },
];

export class CompendiumSourcesSettings extends HandlebarsApplicationMixin(ApplicationV2) {
  static override DEFAULT_OPTIONS = {
    id: "gworld-compendium-sources",
    classes: ["gworld", "gworld-rules"],
    position: { width: 520, height: 520 },
    window: { title: "GWORLD.Sources.Title", resizable: true },
    actions: {
      save: CompendiumSourcesSettings.#onSave,
      restore: CompendiumSourcesSettings.#onRestore,
    },
  };

  static override PARTS = {
    body: {
      template: `systems/${SYSTEM_ID}/templates/apps/compendium-sources.hbs`,
      scrollable: [".gr-body"],
    },
  };

  /** What the boxes read, which is not what is saved until Save is pressed. */
  #pending: Set<string> | null = null;

  /** Every Item pack, less the system's packs a module's copy of their book stands in for. */
  #packs(): PackSummary[] {
    const packs = availablePacks();
    const replaced = supersededPacks(packs, SYSTEM_ID);
    return packs.filter((pack) => !replaced.has(pack.collection));
  }

  #state(): Set<string> {
    if (this.#pending) return this.#pending;
    return new Set(
      chosenSources(availablePacks(), game.settings.get(SYSTEM_ID, COMPENDIUM_SOURCES_KEY), SYSTEM_ID),
    );
  }

  override async _prepareContext(): Promise<Record<string, unknown>> {
    const chosen = this.#state();
    const packs = this.#packs();

    return {
      // One row per book, each pack listed under it with a box of its own,
      // and one box for the book that ticks them all. A lone pack that names
      // no book is shown as it always was, with no row above it.
      groups: GROUPS.map((group) => ({
        label: group.label,
        books: groupByBook(packs.filter((pack) => pack.packageType === group.type)).map((row) => {
          const state = bookState(row, chosen);
          return {
            key: row.key,
            title: row.title,
            headed: row.flagged || row.packs.length > 1,
            all: state === "all",
            some: state === "some",
            packIds: row.packs.map((pack) => pack.collection).join(","),
            packs: row.packs.map((pack) => ({
              collection: pack.collection,
              label: pack.label,
              packageName: pack.packageName,
              enabled: chosen.has(pack.collection),
            })),
          };
        }),
      })).filter((group) => group.books.length > 0),
      dirty: this.#pending !== null,
      // Nothing ticked means the system's packs, and the page should say so
      // rather than let a GM think they have switched the picker off.
      none: chosen.size === 0,
    };
  }

  override async _onRender(context: object, options: object): Promise<void> {
    await super._onRender(context, options);

    for (const box of this.element.querySelectorAll<HTMLInputElement>("input[data-pack]")) {
      box.addEventListener("change", () => {
        const collection = box.dataset.pack;
        if (!collection) return;
        const next = new Set(this.#state());
        if (box.checked) next.add(collection);
        else next.delete(collection);
        this.#pending = next;
        void this.render();
      });
    }

    // The book's box ticks or clears every pack of the book. A book with only
    // some of its packs ticked shows the half-state, which no attribute can
    // set: it has to be written on the element.
    for (const box of this.element.querySelectorAll<HTMLInputElement>("input[data-book-packs]")) {
      box.indeterminate = box.dataset.some === "true";
      box.addEventListener("change", () => {
        const collections = (box.dataset.bookPacks ?? "").split(",").filter(Boolean);
        const next = new Set(this.#state());
        for (const collection of collections) {
          if (box.checked) next.add(collection);
          else next.delete(collection);
        }
        this.#pending = next;
        void this.render();
      });
    }
  }

  static async #onSave(this: CompendiumSourcesSettings): Promise<void> {
    await game.settings.set(SYSTEM_ID, COMPENDIUM_SOURCES_KEY, [...this.#state()]);
    this.#pending = null;
    ui.notifications?.info(game.i18n.localize("GWORLD.Sources.Saved"));
    await this.close();
    // The weapon defaults are read from these packs, so they are read again.
    await loadSkillCatalog();
  }

  static async #onRestore(this: CompendiumSourcesSettings): Promise<void> {
    this.#pending = new Set(chosenSources(availablePacks(), [], SYSTEM_ID));
    await this.render();
  }
}
