/**
 * A searchable list of everything in the system's compendia, for adding to a
 * character without leaving the sheet.
 *
 * The compendia hold 1,764 entries between them. Foundry's own compendium
 * browser can find one, but it means leaving the sheet, opening the right pack,
 * scrolling, and dragging back — which is a lot of ceremony for "give this
 * character Acute Hearing".
 *
 * Both ways of building a character use this: the sheet's Add buttons open it
 * filtered to one type, and the guided builder opens it at each step.
 */

import { SYSTEM_ID } from "../constants.js";
import { summarise } from "../item-summary.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** Index fields worth fetching, so a row can say what the entry actually is. */
const INDEX_FIELDS = [
  "system.attribute",
  "system.difficulty",
  "system.category",
  "system.points",
  "system.pointsPerLevel",
  "system.costTable",
  "system.dr",
  "system.db",
  "system.weight",
  "system.cost",
  "system.prerequisite",
  "system.defaultModifier",
];

/** One row in the list. */
export interface PickerEntry {
  uuid: string;
  name: string;
  type: string;
  /** A short line of statistics, which is what makes one entry tellable from another. */
  summary: string;
  /** Lowercased name, kept so filtering does not rebuild it on every keystroke. */
  search: string;
}

/**
 * Every entry across the system's Item compendia, of the given types.
 *
 * Reading the index rather than the documents is what keeps this quick: the
 * index is a summary the server already holds, and loading 1,764 documents to
 * show a list of names would not be.
 */
export async function collectEntries(
  types: readonly string[],
  categories?: readonly string[],
): Promise<PickerEntry[]> {
  const wanted = new Set(types);
  // Traits are one item type covering four categories, so a step that asks
  // for advantages must say so: offering a list with disadvantages mixed
  // through it means half of what you scroll past charges you nothing.
  const allowed = categories && categories.length > 0 ? new Set(categories) : null;
  const entries: PickerEntry[] = [];

  for (const pack of (game as any).packs ?? []) {
    if (pack?.documentName !== "Item") continue;
    const index = await pack.getIndex({ fields: INDEX_FIELDS });
    for (const entry of index) {
      if (!wanted.has(entry.type)) continue;
      if (allowed && !allowed.has(entry.system?.category)) continue;
      entries.push({
        uuid: `Compendium.${pack.collection}.Item.${entry._id}`,
        name: entry.name,
        type: entry.type,
        summary: summarise(entry.type, entry.system),
        search: String(entry.name).toLowerCase(),
      });
    }
  }

  return entries.sort((a, b) => a.name.localeCompare(b.name));
}

export class CompendiumPicker extends HandlebarsApplicationMixin(ApplicationV2) {
  static override DEFAULT_OPTIONS = {
    classes: ["gworld", "gworld-picker"],
    position: { width: 460, height: 560 },
    window: { title: "GWORLD.Picker.Title", resizable: true },
    actions: {
      add: CompendiumPicker.#onAdd,
    },
  };

  static override PARTS = {
    body: { template: `systems/${SYSTEM_ID}/templates/apps/compendium-picker.hbs`, scrollable: [".gp-list"] },
  };

  #actor: any;
  #types: string[];
  #categories: string[];
  #entries: PickerEntry[] = [];
  #query = "";
  /** Names added during this session, so the list can show what has been taken. */
  #added = new Set<string>();

  constructor(options: {
    actor: any;
    types: string[];
    /** Trait categories to offer, when the caller wants only some of them. */
    categories?: string[];
    title?: string;
  }) {
    super({ window: options.title ? { title: options.title } : {} });
    this.#actor = options.actor;
    this.#types = options.types;
    this.#categories = options.categories ?? [];
  }

  /** Opens a picker for one actor and set of types. */
  static async open(options: {
    actor: any;
    types: string[];
    categories?: string[];
    title?: string;
  }): Promise<CompendiumPicker> {
    const app = new CompendiumPicker(options);
    await app.render(true);
    return app;
  }

  override async _prepareContext(): Promise<Record<string, unknown>> {
    if (this.#entries.length === 0) {
      this.#entries = await collectEntries(this.#types, this.#categories);
    }

    const query = this.#query.trim().toLowerCase();
    const matching = query
      ? this.#entries.filter((entry) => entry.search.includes(query))
      : this.#entries;

    // A list of 1,764 rows is slow to render and useless to read. The cap is
    // generous enough that a real search is never truncated, and the count
    // below says when it has been.
    const shown = matching.slice(0, 200);

    return {
      query: this.#query,
      entries: shown.map((entry) => ({ ...entry, added: this.#added.has(entry.uuid) })),
      total: matching.length,
      truncated: matching.length > shown.length,
    };
  }

  override async _onRender(context: object, options: object): Promise<void> {
    await super._onRender(context, options);

    const search = this.element.querySelector<HTMLInputElement>('input[name="search"]');
    if (!search) return;

    search.addEventListener("input", () => {
      this.#query = search.value;
      void this.render();
    });

    // Re-rendering replaces the input, so the caret has to be put back or every
    // second keystroke would land at the start of the box.
    if (this.#query) {
      search.focus();
      search.setSelectionRange(search.value.length, search.value.length);
    }
  }

  static async #onAdd(this: CompendiumPicker, _event: Event, target: HTMLElement): Promise<void> {
    const uuid = target.dataset.uuid;
    if (!uuid) return;

    const source: any = await fromUuid(uuid).catch(() => null);
    if (!source) {
      ui.notifications?.warn(game.i18n.localize("GWORLD.Picker.NotFound"));
      return;
    }

    // toObject() gives the source data rather than the live document, and the
    // id is dropped so the actor's copy gets its own -- keeping the compendium
    // entry's id would collide the moment the same skill is added twice.
    const data = source.toObject();
    delete data._id;

    await this.#actor.createEmbeddedDocuments("Item", [data]);
    this.#added.add(uuid);
    ui.notifications?.info(game.i18n.format("GWORLD.Picker.Added", { name: data.name }));
    await this.render();
  }
}
