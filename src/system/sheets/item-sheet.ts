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

import { parseCostTable, parseLevelNames } from "../../rules/traits.js";
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
      editItemImage: GWorldItemSheet.#onEditImage,
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

    // A trait's cost table and level names are arrays, which a form cannot
    // carry directly. The table is short and reads naturally as the book prints
    // it ("10/20/30/50/75"), so it is edited as text. Level names get a line
    // each rather than a separated list, because several contain commas of
    // their own -- "A large group (21-1,000 people)".
    if (item.type === "trait") {
      context.costTableText = item.system.costTable.join("/");
      context.levelNamesText = item.system.levelNames.join("\n");
      context.isTabled = item.system.costTable.length > 0;
      context.levelName = item.system.levelName;
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
    //
    // The values are localization keys, not English. The template asks
    // selectOptions to localize them, so another locale gets its own labels
    // rather than these ones.
    const keyed = (group: string, values: string[]) =>
      Object.fromEntries(values.map((v) => [v, `GWORLD.${group}.${v}`]));

    context.choices = {
      // Attributes are stored by their abbreviation, whose label is the same in
      // every locale, so the key carries the full name rather than "ST".
      attributes: keyed("Attribute", ["ST", "DX", "IQ", "HT", "Will", "Per"]),
      difficulties: keyed("Difficulty", ["E", "A", "H", "VH", "W"]),
      techniqueDifficulties: keyed("Difficulty", ["A", "H"]),
      categories: keyed("TraitCategory", ["advantage", "disadvantage", "perk", "quirk"]),
      damageBases: keyed("DamageBase", ["thr", "sw", "fixed"]),
      damageTypes: keyed("DamageType", [
        "burn", "cor", "cr", "cut", "fat", "imp", "pi-", "pi", "pi+", "pi++", "tox",
      ]),
      // A plain list, for the checkbox group that says which damage a split DR
      // applies to. The keyed map above is for selects, whose values must be keys.
      damageTypeList: [
        "burn", "cor", "cr", "cut", "fat", "imp", "pi-", "pi", "pi+", "pi++", "tox",
      ],
      hitLocations: [
        "torso", "skull", "eye", "face", "neck", "vitals", "groin", "arm", "leg", "hand", "foot",
      ],
      comprehension: keyed("Language", ["none", "broken", "accented", "native"]),
    };

    return context;
  }

  /**
   * Fields the sheet edits as a set of checkboxes sharing one name. A form
   * submits nothing at all for such a group when none of its boxes are ticked,
   * so without this, unticking the last one leaves the previous list in place:
   * whole-body coverage could never be reached again, and a split DR could never
   * be cleared. An empty array is supplied for each group the form actually
   * carries.
   */
  static readonly CHECKBOX_GROUPS = ["system.locations", "system.drSplitAppliesTo"];

  override _processFormData(event: Event | null, form: HTMLFormElement, formData: object): object {
    const data = super._processFormData(event, form, formData) as Record<string, any>;

    for (const path of GWorldItemSheet.CHECKBOX_GROUPS) {
      if (!form.querySelector(`input[type="checkbox"][name="${path}"]`)) continue;
      const key = path.slice("system.".length);
      if (data.system?.[key] === undefined) {
        data.system = { ...(data.system ?? {}), [key]: [] };
      }
    }

    // The two trait arrays are edited as text, so they arrive as strings and
    // have to be read back into arrays before the data model sees them. Both
    // readers live in the rules layer, where they are tested: an empty cost
    // table has to come back empty rather than as a single zero, which would
    // price the trait at nothing instead of restoring its per-level cost.
    if (this.item.type === "trait" && data.system) {
      if (typeof data.system.costTable === "string") {
        data.system.costTable = parseCostTable(data.system.costTable);
      }
      if (typeof data.system.levelNames === "string") {
        data.system.levelNames = parseLevelNames(data.system.levelNames);
      }
    }

    // A split DR is only valid as a pair, and the sheet submits on every change,
    // so a GM filling it in one field at a time would submit an invalid halfway
    // state and be refused before they could finish. The halves are completed
    // here instead: giving a second DR with nothing ticked means crushing, which
    // both armour tables agree on and is the only choice that is always right;
    // clearing the second DR clears what it applied to.
    if (this.item.type === "armor" && data.system) {
      // Whether the form carried a field at all, rather than what it carried.
      // An emptied number input submits null, and treating that as "absent" and
      // falling back to the stored value would make an existing split
      // impossible to remove.
      const submitted = (key: string) => Object.hasOwn(data.system, key);

      const split = submitted("drSplit")
        ? (data.system.drSplit ?? null)
        : (this.item.system.drSplit ?? null);
      const against = submitted("drSplitAppliesTo")
        ? (data.system.drSplitAppliesTo ?? [])
        : (this.item.system.drSplitAppliesTo ?? []);

      if (split !== null && against.length === 0) {
        data.system.drSplitAppliesTo = ["cr"];
      } else if (split === null && against.length > 0) {
        data.system.drSplit = null;
        data.system.drSplitAppliesTo = [];
      }
    }

    return data;
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

  /**
   * Picks a new image for the item.
   *
   * Foundry's own editImage action insists on an <img> element, and the image
   * here sits inside a button so it can be reached from the keyboard. The
   * chosen path is written straight to the item rather than dropped into the
   * form: the form has no image field to drop it into, and the one it used to
   * have was the cause of every "does not have a valid file extension" refusal
   * this sheet ever produced.
   */
  static async #onEditImage(this: GWorldItemSheet) {
    if (!this.isEditable) return;
    const item = this.item;
    const fp = new foundry.applications.apps.FilePicker.implementation({
      current: String(item._source?.img ?? item.img ?? ""),
      type: "image",
      callback: (path: string) => {
        void item.update({ img: path });
      },
    });
    await fp.browse();
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
