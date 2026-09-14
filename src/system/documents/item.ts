/**
 * The system's Item document.
 *
 * It exists for one thing: the picture. Foundry hands every new item the
 * same bag, and this class hands out one per kind instead -- at creation,
 * through `getDefaultArtwork`, and at read time for items that were made
 * before there was anything better to give them. What somebody chose for an
 * item is never touched; only the bag is read as "nothing chosen".
 */

import { afterPrepare, effectivePrice } from "../data-extensions.js";
import { defaultItemIcon, isGenericIcon } from "../item-icons.js";

export class GWorldItem extends Item {
  /** The picture a new item gets, by its kind rather than the same for all. */
  static override getDefaultArtwork(itemData: { type?: string; system?: unknown }): { img: string } {
    return { img: defaultItemIcon(String(itemData?.type ?? ""), itemData?.system) };
  }

  /**
   * An item stored with the bag shows its kind's picture instead.
   *
   * The stored value is left alone: an item that never chose an image should
   * keep following the default if the default changes, and an edit that
   * touches nothing else should not write an image field it did not mean to.
   */
  override prepareBaseData(): void {
    super.prepareBaseData();
    const source = this._source as { img?: unknown; system?: unknown } | undefined;
    if (isGenericIcon(source?.img)) this.img = defaultItemIcon(this.type, source?.system);
  }

  /**
   * What the item costs and weighs once add-on modules' price modifiers are
   * applied to its stored figures. Worked out afresh each time, never stored.
   * (Declared, not initialised: the constructor prepares the data before a
   * field initialiser would run, and would overwrite it.)
   */
  declare effectivePrice: { cost: number; weight: number; lines: Array<{ label: string; cost: number; weight: number }> };

  prepareDerivedData(): void {
    super.prepareDerivedData();
    this.effectivePrice = effectivePrice(this);
    afterPrepare(this);
  }
}
