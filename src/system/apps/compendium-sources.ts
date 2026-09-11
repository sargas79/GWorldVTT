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
  chosenSources,
  defaultSources,
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

  #packs(): PackSummary[] {
    return availablePacks();
  }

  #state(): Set<string> {
    if (this.#pending) return this.#pending;
    return new Set(
      chosenSources(this.#packs(), game.settings.get(SYSTEM_ID, COMPENDIUM_SOURCES_KEY), SYSTEM_ID),
    );
  }

  override async _prepareContext(): Promise<Record<string, unknown>> {
    const chosen = this.#state();
    const packs = this.#packs();

    return {
      groups: GROUPS.map((group) => ({
        label: group.label,
        packs: packs
          .filter((pack) => pack.packageType === group.type)
          .map((pack) => ({
            collection: pack.collection,
            label: pack.label,
            packageName: pack.packageName,
            enabled: chosen.has(pack.collection),
          })),
      })).filter((group) => group.packs.length > 0),
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
    this.#pending = new Set(defaultSources(this.#packs(), SYSTEM_ID));
    await this.render();
  }
}
