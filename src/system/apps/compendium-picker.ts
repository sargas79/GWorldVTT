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

import { chooseTechniqueSkill, isOpenTechniqueData } from "../open-techniques.js";
import { SYSTEM_ID } from "../constants.js";
import { summarise } from "../item-summary.js";
import { addonItemSummary, pickerIndexFields } from "../data-extensions.js";
import { sourceCollections } from "../compendium-sources.js";
import {
  amountKind,
  customItemData,
  customKindKey,
  existingPoints,
  levelCeiling,
  planAddition,
  pointSteps,
  previewCost,
  snapAmount,
  steppedAmount,
  type PickerCustom,
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
    const index = await pack.getIndex({ fields: [...INDEX_FIELDS, ...pickerIndexFields(types)] });
    for (const entry of index) {
      if (!wanted.has(entry.type)) continue;
      if (allowed && !allowed.has(entry.system?.category)) continue;
      entries.push({
        uuid: `Compendium.${pack.collection}.Item.${entry._id}`,
        name: entry.name,
        type: entry.type,
        summary: addonItemSummary(entry) ?? summarise(entry.type, entry.system),
        search: String(entry.name).toLowerCase(),
        system: entry.system ?? {},
        source: String(pack.title ?? pack.metadata?.label ?? pack.collection ?? ""),
      });
    }
  }

  return entries.sort((a, b) => a.name.localeCompare(b.name));
}

/** The item types that are gear, whose picker shows weight and cash rather than points. */
const GEAR_TYPES = new Set(["equipment", "armor", "shield"]);

export class CompendiumPicker extends HandlebarsApplicationMixin(ApplicationV2) {
  static override DEFAULT_OPTIONS = {
    classes: ["gworld", "gworld-picker"],
    position: { width: 520, height: 560 },
    window: { title: "GWORLD.Picker.Title", resizable: true },
    actions: {
      add: CompendiumPicker.#onAdd,
      addCustom: CompendiumPicker.#onAddCustom,
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
  /** What a custom entry is made as, when the list doesn't have what is wanted. */
  #custom: PickerCustom | null;

  constructor(options: {
    actor: any;
    types: string[];
    /** Trait categories to offer, when the caller wants only some of them. */
    categories?: string[];
    title?: string;
    custom?: PickerCustom;
  }) {
    super({ window: options.title ? { title: options.title } : {} });
    this.#actor = options.actor;
    this.#types = options.types;
    this.#categories = options.categories ?? [];
    this.#custom = options.custom ?? null;
  }

  /** Opens a picker for one actor and set of types. */
  static async open(options: {
    actor: any;
    types: string[];
    categories?: string[];
    title?: string;
    custom?: PickerCustom;
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
      // Something the books don't list -- most quirks are the player's own
      // words -- is made from what was typed in the search box.
      custom: this.#custom
        ? {
            label: this.#query.trim()
              ? game.i18n.format("GWORLD.Picker.AddCustomNamed", { name: this.#query.trim(), kind: this.#customLabel() })
              : game.i18n.format("GWORLD.Picker.AddCustom", { kind: this.#customLabel() }),
            hint: this.#custom.category === "quirk" ? game.i18n.localize("GWORLD.Picker.CustomQuirkHint") : "",
          }
        : null,
      total: matching.length,
      truncated: matching.length > shown.length,
      // The ledger rides along here too: what has been spent and what is left
      // is the whole question while choosing, and it should not take a trip
      // back to the sheet to answer.
      // Gear is paid for in cash and carried, not bought with points: that
      // ledger is what matters while choosing it.
      gearLedger: this.#types.every((type) => GEAR_TYPES.has(type))
        ? {
            carried: Math.round((Number(this.#actor?.system?.derived?.encumbrance?.carriedWeight) || 0) * 100) / 100,
            basicLift: Number(this.#actor?.system?.derived?.basicLift) || 0,
            money: Number(this.#actor?.system?.money) || 0,
          }
        : null,
      ledger: {
        spent: points.spent ?? 0,
        available: points.available ?? 0,
        unspent: points.unspent ?? points.remaining ?? 0,
        over: Boolean(points.overBudget),
      },
    };
  }

  /** What a custom entry is called: "quirk", "skill". */
  #customLabel(): string {
    const custom = this.#custom;
    if (!custom) return "";
    return game.i18n.localize(customKindKey(custom)).toLowerCase();
  }

  /** Makes a custom entry from the search box: a quirk at -1 point and no levels, anything else blank. */
  static async #onAddCustom(this: CompendiumPicker): Promise<void> {
    const custom = this.#custom;
    if (!custom || !this.#actor?.isOwner) return;
    const typed = this.#query.trim();
    const kind = this.#customLabel();
    const name = typed || game.i18n.format("GWORLD.Picker.NewCustom", { kind });
    await this.#actor.createEmbeddedDocuments("Item", [customItemData(custom, name)]);
    ui.notifications?.info(game.i18n.format("GWORLD.Picker.Added", { name }));
    this.#query = "";
    await this.render();
  }

  /** One row, with the amount field it needs and what that amount costs. */
  #row(entry: PickerEntry) {
    const item: PlannedItem = { type: entry.type, name: entry.name, system: entry.system };
    const kind = amountKind(item);
    // Snapped here as well as on the field, so a total that never passed
    // through the field -- a remembered one, or a default -- is still a total
    // that buys something.
    const held = kind === "points" ? this.#heldFor(item) : 0;
    const amount = kind ? snapAmount(item, this.#amounts.get(entry.uuid) ?? 1, held) : 1;
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
      levelLabel: this.#levelLabel(item, held + amount),
    };
  }

  /**
   * What the chosen points reach, shown beside the cost so the player sees the
   * level before they take the entry rather than after.
   */
  #levelLabel(item: PlannedItem, amount: number): string | null {
    if (amountKind(item) !== "points") return null;
    const { relativeLevel } = pointSteps(item, amount);
    if (relativeLevel === null) return null;
    const key = item.type === "technique" ? "GWORLD.Picker.TechniqueLevel" : "GWORLD.Picker.SkillLevel";
    const signed = relativeLevel >= 0 ? `+${relativeLevel}` : String(relativeLevel);
    return game.i18n.format(key, { level: signed });
  }

  /** The entry behind a row, in the shape the pricing rules read. */
  #itemFor(uuid: string): PlannedItem | null {
    const entry = this.#entries?.find((e) => e.uuid === uuid);
    return entry ? { type: entry.type, name: entry.name, system: entry.system } : null;
  }

  /**
   * The points the character already has in an entry. The amount beside a row
   * is added to these, so it is their sum that has to land on a step.
   */
  #heldFor(item: PlannedItem): number {
    return existingPoints(item, this.#ownedItems());
  }

  /** The character's items, in the shape the merge rules read. */
  #ownedItems(): PlannedItem[] {
    return [...(this.#actor?.items ?? [])].map((item: any) => ({
      id: item.id,
      type: item.type,
      name: item.name,
      system: item.system,
    }));
  }

  /** Writes an amount back to its field and re-prices the row around it. */
  #setAmount(input: HTMLInputElement, amount: number): void {
    const uuid = input.dataset.amountFor;
    if (!uuid) return;
    this.#amounts.set(uuid, amount);
    input.value = String(amount);
    this.#repriceRow(input, amount);
  }

  /**
   * Re-prices one row in place. Re-rendering the list would do it too, but it
   * would also take the caret out of the field being typed into.
   */
  #repriceRow(input: HTMLInputElement, amount: number): void {
    const uuid = input.dataset.amountFor;
    const item = uuid ? this.#itemFor(uuid) : null;
    if (!item) return;
    const row = input.closest(".gp-row");

    const cost = previewCost(item, amount);
    const costLabel = row?.querySelector<HTMLElement>(".gp-cost");
    if (costLabel && cost !== null) {
      costLabel.textContent = game.i18n.format("GWORLD.Picker.Cost", { points: cost });
    }

    // The level those points reach, kept in step with the cost beside it. The
    // level is the one the character ends up at, so what they already hold
    // counts towards it.
    const levelLabel = row?.querySelector<HTMLElement>(".gp-level");
    if (levelLabel) {
      levelLabel.textContent = this.#levelLabel(item, this.#heldFor(item) + amount) ?? "";
    }
  }

  override async _onRender(context: object, options: object): Promise<void> {
    await super._onRender(context, options);

    for (const input of this.element.querySelectorAll<HTMLInputElement>("input[data-amount-for]")) {
      // While typing, price exactly what is typed: snapping mid-keystroke
      // would fight the player halfway through a number.
      input.addEventListener("input", () => {
        const uuid = input.dataset.amountFor;
        if (!uuid) return;
        const value = Math.max(1, Math.floor(Number(input.value) || 1));
        this.#amounts.set(uuid, value);
        this.#repriceRow(input, value);
      });

      // Once the number is finished with, put it on the table: a total off the
      // table buys no more than the step below it, so it becomes that step.
      input.addEventListener("change", () => {
        const uuid = input.dataset.amountFor;
        if (!uuid) return;
        const item = this.#itemFor(uuid)!;
        this.#setAmount(input, snapAmount(item, Number(input.value), this.#heldFor(item)));
      });
    }

    for (const button of this.element.querySelectorAll<HTMLElement>("button[data-step-for]")) {
      button.addEventListener("click", (event) => {
        event.preventDefault();
        const uuid = button.dataset.stepFor;
        const input = uuid
          ? this.element.querySelector<HTMLInputElement>(`input[data-amount-for="${CSS.escape(uuid)}"]`)
          : null;
        if (!uuid || !input) return;
        const direction = Number(button.dataset.step) < 0 ? -1 : 1;
        const item = this.#itemFor(uuid)!;
        // The step is the table's, not one: 4 points goes to 8, not to 5.
        const stepped = steppedAmount(item, Number(input.value), direction, this.#heldFor(item));
        const ceiling = amountKind(item) === "levels" ? levelCeiling(item) : null;
        this.#setAmount(input, ceiling === null ? stepped : Math.min(stepped, ceiling));
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
    let data = source.toObject();
    delete data._id;

    // A technique for a kind of skill asks which skill before anything is
    // made, since the name it is merged under depends on the answer.
    if (isOpenTechniqueData(data)) {
      const chosen = await chooseTechniqueSkill(this.#actor, data);
      if (!chosen) return;
      data = chosen;
    }

    // Snapped once more at the point of taking it: whatever route the number
    // arrived by, what is spent is a total that buys a level.
    const planned: PlannedItem = { type: data.type, name: data.name, system: data.system };
    const amount = snapAmount(planned, this.#amounts.get(uuid) ?? 1, existingPoints(planned, this.#ownedItems()));
    const plan = planAddition({
      source: data,
      existing: this.#ownedItems(),
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
