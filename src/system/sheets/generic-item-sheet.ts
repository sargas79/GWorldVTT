/**
 * The sheet an add-on module's item type opens on when it brings none of its
 * own: the name and picture, a field for each thing its data model stores,
 * and the description.
 *
 * The system's own item sheet is written for the system's own types, and
 * Foundry's core sheet is switched off, so without this a module's item would
 * open on nothing at all.
 */

import { SYSTEM_ID } from "../constants.js";

const { ItemSheetV2 } = foundry.applications.sheets;
const { HandlebarsApplicationMixin } = foundry.applications.api;

/** One form row per field the type's data model declares, where Foundry can draw one. */
export function fieldRows(schema: any, source: Record<string, unknown>, editable: boolean): string[] {
  const rows: string[] = [];
  for (const [key, field] of Object.entries<any>(schema?.fields ?? {})) {
    // The description has its own editor below, and module data kept for
    // other modules isn't this sheet's to show.
    if (key === "description" || key === "extensions") continue;
    try {
      const group = field.toFormGroup?.({ label: field.label || key, localize: true }, {
        name: `system.${key}`,
        value: source?.[key],
        disabled: !editable,
      });
      if (group?.outerHTML) rows.push(group.outerHTML);
    } catch {
      // A field Foundry has no input for (a list of objects, say) is left to
      // the module's own sheet.
    }
  }
  return rows;
}

export class GWorldGenericItemSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
  static override DEFAULT_OPTIONS = {
    classes: ["gworld", "sheet", "item", "generic"],
    position: { width: 480, height: "auto" },
    window: { resizable: true },
    form: { submitOnChange: true, closeOnSubmit: false },
    actions: {
      editItemImage: GWorldGenericItemSheet.#onEditImage,
    },
  };

  static override PARTS = {
    body: { template: `systems/${SYSTEM_ID}/templates/item/generic-item-sheet.hbs`, scrollable: [""] },
  };

  override async _prepareContext(options: object): Promise<Record<string, unknown>> {
    const context = (await super._prepareContext(options)) as Record<string, unknown>;
    const item = this.item as any;
    const editable = this.isEditable;
    context.item = item;
    context.editable = editable;
    context.typeLabel = game.i18n.localize(`TYPES.Item.${item.type}`);
    context.fields = fieldRows(item.system?.schema, item._source?.system ?? {}, editable);
    const description = item.system?.description;
    context.hasDescription = typeof description === "string";
    context.description = typeof description === "string"
      ? await foundry.applications.ux.TextEditor.implementation.enrichHTML(description, { relativeTo: item, secrets: item.isOwner })
      : "";
    context.descriptionSource = typeof description === "string" ? description : "";
    return context;
  }

  static async #onEditImage(this: GWorldGenericItemSheet) {
    const item = this.item as any;
    const picker = new foundry.applications.apps.FilePicker.implementation({
      type: "image",
      current: item.img,
      callback: (path: string) => item.update({ img: path }),
    });
    await picker.browse();
  }
}
