/**
 * A searchable list of everything in the chosen compendia, for adding to a
 * character without leaving the sheet.
 *
 * The compendia hold 1,764 entries between them. Foundry's own compendium
 * browser can find one, but it means leaving the sheet, opening the right pack,
 * scrolling, and dragging back — which is a lot of ceremony for "give this
 * character Acute Hearing".
 *
 * Both ways of building a character use this: the sheet's Add buttons open it
 * filtered to one type, and the guided builder opens it at each step.
 *
 * Each row asks how much to take before it is taken -- levels of a levelled
 * trait, points in a skill -- and says what that will cost. Taking something
 * the character already has raises what they have rather than adding a copy.
 */

import { SYSTEM_ID } from "../constants.js";
import { summarise } from "../item-summary.js";
import { sourceCollections } from "../compendium-sources.js";
import {
  amountKind,
  levelCeiling,
  planAddition,
  previewCost,
  type PlannedItem,
} from "../picker-merge.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** Index fields worth fetching, so a row can say what the entry actually is. */
const INDEX_FIELDS = [
  "system.attribute",
  "system.difficulty",
  "system.category",
  "system.points",
  "system.pointsPerLevel",
  "system.costTable",
  "system.maxLevels",
  "system.dr",
  "system.db",
  "system.weight",
  "system.cost",
  "system.prerequisite",
  "system.defaultModifier",
  "system.colleges",
  "system.classes",
  "system.energy",
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
  /** What the index knows of the entry, enough to price an amount before it is taken. */
  system: Record<string, any>;
  /**
   * The pack the entry came from. Shown only when more than one pack feeds
   * the list: a module's spells reprint the Basic Set's, and two rows called
   * Fireball need to say which book each is from.
   */
  source: string;
}

/**
 * Every entry across the chosen Item compendia, of the given types.
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
  const sources = sourceCollections();
  const entries: PickerEntry[] = [];

  for (const pack of (game as any).packs ?? []) {
    if (pack?.documentName !== "Item") continue;
    if (!sources.has(String(pack.collection))) continue;
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
        system: entry.system ?? {},
        source: String(pack.title ?? pack.metadata?.label ?? pack.collection ?? ""),
      });
    }
  }

  return entries.sort((a, b) => a.name.localeCompare(b.name));
}

export class CompendiumPicker extends HandlebarsApplicationMixin(ApplicationV2) {
  static override DEFAULT_OPTIONS = {
    classes: ["gworld", "gworld-picker"],
    position: { width: 520, height: 560 },
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
  #entries: PickerEntry[] | null = null;
  #loading: Promise<void> | null = null;
  #query = "";
  /** Names added during this session, so the list can show what has been taken. */
  #added = new Set<string>();
  /** The amount typed beside each row, kept across re-renders. */
  #amounts = new Map<string, number>();

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

  /**
   * Reads the compendia once, after the window is already open.
   *
   * The first render used to wait on this, which meant nothing at all
   * happened for a second or two after "Browse" was pressed. The window now
   * opens at once saying it is loading, and fills in when the index arrives.
   */
  #load(): void {
    if (this.#entries || this.#loading) return;
    this.#loading = collectEntries(this.#types, this.#categories)
      .then((entries) => {
        this.#entries = entries;
      })
      .catch((error) => {
        console.error(`${SYSTEM_ID} | Could not read the compendia`, error);
        this.#entries = [];
      })
      .finally(() => {
        this.#loading = null;
        void this.render();
      });
  }

  override async _prepareContext(): Promise<Record<string, unknown>> {
    this.#load();

    const query = this.#query.trim().toLowerCase();
    const all = this.#entries ?? [];
    const matching = query ? all.filter((entry) => entry.search.includes(query)) : all;

    // A list of 1,764 rows is slow to render and useless to read. The cap is
    // generous enough that a real search is never truncated, and the count
    // below says when it has been.
    const shown = matching.slice(0, 200);

    const points = this.#actor?.system?.derived?.points ?? {};
    const sources = new Set(all.map((entry) => entry.source));

    return {
      loading: this.#entries === null,
      query: this.#query,
      // Where an entry came from matters once two packs contribute: the
      // Basic Set's Fireball and a module's are two rows with one name.
      showSource: sources.size > 1,
      entries: shown.map((entry) => this.#row(entry)),
      total: matching.length,
      truncated: matching.length > shown.length,
      // The ledger rides along here too: what has been spent and what is left
      // is the whole question while choosing, and it should not take a trip
      // back to the sheet to answer.
      ledger: {
        spent: points.spent ?? 0,
        available: points.available ?? 0,
        unspent: points.unspent ?? points.remaining ?? 0,
        over: Boolean(points.overBudget),
      },
    };
  }

  /** One row, with the amount field it needs and what that amount costs. */
  #row(entry: PickerEntry) {
    const item: PlannedItem = { type: entry.type, name: entry.name, system: entry.system };
    const kind = amountKind(item);
    const amount = this.#amounts.get(entry.uuid) ?? 1;
    const ceiling = kind === "levels" ? levelCeiling(item) : null;
    const cost = kind ? previewCost(item, amount) : null;
    return {
      ...entry,
      added: this.#added.has(entry.uuid),
      amountKind: kind,
      amount,
      max: ceiling,
      unit: kind === "levels"
        ? game.i18n.localize("GWORLD.Trait.Levels")
        : game.i18n.localize("GWORLD.Picker.Points"),
      cost: cost === null ? null : game.i18n.format("GWORLD.Picker.Cost", { points: cost }),
    };
  }

  override async _onRender(context: object, options: object): Promise<void> {
    await super._onRender(context, options);

    for (const input of this.element.querySelectorAll<HTMLInputElement>("input[data-amount-for]")) {
      input.addEventListener("input", () => {
        const uuid = input.dataset.amountFor;
        if (!uuid) return;
        const value = Math.max(1, Math.floor(Number(input.value) || 1));
        this.#amounts.set(uuid, value);
        // Re-price the row in place rather than re-rendering the list, which
        // would take the caret out of the field being typed into.
        const entry = this.#entries?.find((e) => e.uuid === uuid);
        const cost = entry
          ? previewCost({ type: entry.type, name: entry.name, system: entry.system }, value)
          : null;
        const label = input.closest(".gp-row")?.querySelector<HTMLElement>(".gp-cost");
        if (label && cost !== null) {
          label.textContent = game.i18n.format("GWORLD.Picker.Cost", { points: cost });
        }
      });
    }

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

    const amount = this.#amounts.get(uuid) ?? 1;
    const plan = planAddition({
      source: data,
      existing: [...(this.#actor.items ?? [])].map((item: any) => ({
        id: item.id,
        type: item.type,
        name: item.name,
        system: item.system,
      })),
      chosen: { levels: amount, points: amount },
    });

    if (plan.action === "update") {
      await this.#actor.items.get(plan.itemId)?.update(plan.changes);
      ui.notifications?.info(
        game.i18n.format(`GWORLD.Picker.Raised.${plan.moved.what}`, {
          name: data.name,
          from: plan.moved.from,
          to: plan.moved.to,
        }),
      );
    } else {
      await this.#actor.createEmbeddedDocuments("Item", [plan.data]);
      ui.notifications?.info(game.i18n.format("GWORLD.Picker.Added", { name: data.name }));
    }

    this.#added.add(uuid);
    await this.render();
  }
}
