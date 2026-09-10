/**
 * The item sheet, for every item type the system defines.
 *
 * Without one, Foundry falls back to its core item sheet, which knows nothing
 * about these data models and so shows a name and an image and nothing that can
 * actually be edited. That is what made skills and equipment uneditable.
 *
 * One sheet serves all seven types rather than seven near-identical classes: the
 * types share their description and reference fields, and the physical ones share
 * quantity, weight and cost. The body template switches on the type.
 */

import { SYSTEM_ID } from "../constants.js";

const { ItemSheetV2 } = foundry.applications.sheets;
const { HandlebarsApplicationMixin } = foundry.applications.api;

const TEMPLATE_ROOT = `systems/${SYSTEM_ID}/templates/item`;

/** Types that live in an inventory and so carry quantity, weight and cost. */
const PHYSICAL_TYPES = new Set(["equipment", "armor", "shield"]);

/** Types that can carry attack modes. */
const ARMED_TYPES = new Set(["equipment"]);

export class GWorldItemSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
  static override DEFAULT_OPTIONS = {
    classes: ["gworld", "sheet", "item"],
    position: { width: 520, height: "auto" },
    window: { resizable: true },
    form: { submitOnChange: true, closeOnSubmit: false },
    actions: {
      addMode: GWorldItemSheet.#onAddMode,
      deleteMode: GWorldItemSheet.#onDeleteMode,
      addDefault: GWorldItemSheet.#onAddDefault,
      deleteDefault: GWorldItemSheet.#onDeleteDefault,
    },
  };

  static override PARTS = {
    body: { template: `${TEMPLATE_ROOT}/item-sheet.hbs`, scrollable: [""] },
  };

  override async _prepareContext(options: object): Promise<Record<string, unknown>> {
    const context = (await super._prepareContext(options)) as Record<string, unknown>;
    const item = this.item;

    context.item = item;
    context.system = item.system;
    context.editable = this.isEditable;
    context.type = item.type;
    context.isPhysical = PHYSICAL_TYPES.has(item.type);
    context.isArmed = ARMED_TYPES.has(item.type);

    // One flag per type, so the template can branch without a comparison helper.
    for (const t of ["skill", "technique", "trait", "equipment", "armor", "shield", "language"]) {
      context[`is${t.charAt(0).toUpperCase()}${t.slice(1)}`] = item.type === t;
    }

    // The description is rich text, so it has to be enriched before display or
    // links and inline rolls arrive as raw markup.
    context.enrichedDescription = await foundry.applications.ux.TextEditor.implementation.enrichHTML(
      item.system.description ?? "",
      { relativeTo: item, secrets: item.isOwner },
    );

    // Every set a <select> draws from must be an object, not an array: given an
    // array, Foundry's selectOptions helper uses the array index as the option's
    // value, so choosing "DX" would save 1. Only hitLocations stays a list,
    // because it is rendered as checkboxes rather than a select.
    const byName = (values: string[]) => Object.fromEntries(values.map((v) => [v, v]));

    context.choices = {
      attributes: byName(["ST", "DX", "IQ", "HT", "Will", "Per"]),
      difficulties: { E: "Easy", A: "Average", H: "Hard", VH: "Very Hard" },
      techniqueDifficulties: { A: "Average", H: "Hard" },
      categories: {
        advantage: "Advantage",
        disadvantage: "Disadvantage",
        perk: "Perk",
        quirk: "Quirk",
      },
      damageBases: { thr: "Thrust", sw: "Swing", fixed: "Fixed" },
      damageTypes: byName([
        "burn", "cor", "cr", "cut", "fat", "imp", "pi-", "pi", "pi+", "pi++", "tox",
      ]),
      hitLocations: [
        "torso", "skull", "eye", "face", "neck", "vitals", "groin", "arm", "leg", "hand", "foot",
      ],
      comprehension: {
        none: "None",
        broken: "Broken",
        accented: "Accented",
        native: "Native",
      },
    };

    return context;
  }

  /** The array field a mode-editing action refers to, and its current contents. */
  #modeList(target: HTMLElement): { path: string; list: unknown[] } | null {
    const path = target.closest<HTMLElement>("[data-mode-path]")?.dataset.modePath;
    if (!path) return null;
    const list = foundry.utils.getProperty(this.item, `system.${path}`);
    return Array.isArray(list) ? { path, list: [...list] } : null;
  }

  static async #onAddMode(this: GWorldItemSheet, _event: Event, target: HTMLElement) {
    const found = this.#modeList(target);
    if (!found) return;
    // An empty object takes every field's declared initial value, so the new row
    // arrives valid rather than half-filled.
    await this.item.update({ [`system.${found.path}`]: [...found.list, {}] });
  }

  static async #onDeleteMode(this: GWorldItemSheet, _event: Event, target: HTMLElement) {
    const found = this.#modeList(target);
    const index = Number(target.closest<HTMLElement>("[data-index]")?.dataset.index);
    if (!found || !Number.isInteger(index)) return;
    found.list.splice(index, 1);
    await this.item.update({ [`system.${found.path}`]: found.list });
  }

  static async #onAddDefault(this: GWorldItemSheet) {
    const defaults = [...(this.item.system.defaults ?? [])];
    await this.item.update({
      "system.defaults": [...defaults, { from: "attribute", attribute: "DX", skill: "", modifier: 0 }],
    });
  }

  static async #onDeleteDefault(this: GWorldItemSheet, _event: Event, target: HTMLElement) {
    const index = Number(target.closest<HTMLElement>("[data-index]")?.dataset.index);
    if (!Number.isInteger(index)) return;
    const defaults = [...(this.item.system.defaults ?? [])];
    defaults.splice(index, 1);
    await this.item.update({ "system.defaults": defaults });
  }
}
