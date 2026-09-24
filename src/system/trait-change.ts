/**
 * Changing a character's traits from a module (since API 1.112.0).
 *
 * A level up or down -- Charisma bought up, Wealth lost -- or a swap between
 * related traits, such as one level of Appearance for another (Characters
 * p. 21), which the book writes as separate traits. The edit is the sheet's:
 * the trait item's `levels`, kept within what the trait can hold, or the item
 * replaced by another trait. It is the GM's to make, since it rewrites a
 * character's build.
 */

import { clampedLevels } from "./advancement.js";
import { normalizeSkillName } from "../rules/skills.js";

/** What `changeTrait` changed: the trait before and after, by the item that holds it now. */
export interface TraitChanged {
  itemId: string;
  from: { name: string; levels: number };
  to: { name: string; levels: number };
  replaced: boolean;
}

/** The trait items' levels, as the sheet reads them. */
function levelsOf(item: any): number {
  return Number(item?.system?.levels ?? 0) || 0;
}

/** The actor's trait by id, else by name (case, spacing and "/TL" aside). */
function traitOn(actor: any, options: { id?: string; name?: string }): any {
  const items = [...(actor?.items ?? [])].filter((item: any) => item?.type === "trait");
  if (options.id) return items.find((item: any) => item.id === options.id) ?? null;
  const wanted = normalizeSkillName(String(options.name ?? ""));
  if (!wanted) return null;
  return items.find((item: any) => normalizeSkillName(String(item.name ?? "")) === wanted) ?? null;
}

/** A trait named so in any Item compendium, as data to create, or null. */
async function traitFromPacks(name: string): Promise<Record<string, any> | null> {
  const wanted = normalizeSkillName(name);
  for (const pack of game.packs ?? []) {
    if (pack.metadata?.type !== "Item") continue;
    const index = await pack.getIndex({ fields: ["type"] });
    const entry = [...index].find((e: any) => e.type === "trait" && normalizeSkillName(String(e.name ?? "")) === wanted);
    if (!entry) continue;
    const doc = await pack.getDocument(entry._id);
    if (doc) return doc.toObject();
  }
  return null;
}

/**
 * Changes one of a character's traits. `name` or `id` finds it. `level`
 * sets its levels, brought within its cap and cost table as a typed level
 * is. `replaceWith` swaps it for another trait: a name looked up in the
 * Item compendia, or the trait's item data; given with `level`, the new
 * trait takes that level. Null for a user who isn't a GM, a trait the
 * character hasn't got, or a replacement that can't be found.
 */
export async function changeTrait(actor: any, options: {
  id?: string;
  name?: string;
  level?: number;
  replaceWith?: string | Record<string, any>;
}): Promise<TraitChanged | null> {
  if (!game.user?.isGM) {
    ui.notifications?.warn(game.i18n.localize("GWORLD.Trait.GmOnly"));
    return null;
  }
  const item = traitOn(actor, options ?? {});
  if (!item) return null;
  const from = { name: String(item.name ?? ""), levels: levelsOf(item) };

  if (options.replaceWith !== undefined && options.replaceWith !== null) {
    const source = typeof options.replaceWith === "string"
      ? await traitFromPacks(options.replaceWith)
      : (options.replaceWith.type === "trait" ? foundry.utils.deepClone(options.replaceWith) : null);
    if (!source) return null;
    delete source._id;
    const system = { ...(source.system ?? {}) };
    if (typeof options.level === "number") system.levels = clampedLevels({ system }, options.level);
    const [created] = await actor.createEmbeddedDocuments("Item", [{ ...source, system }]);
    if (!created) return null;
    await actor.deleteEmbeddedDocuments("Item", [item.id]);
    return { itemId: String(created.id), from, to: { name: String(created.name ?? ""), levels: levelsOf(created) }, replaced: true };
  }

  if (typeof options.level === "number") {
    const levels = clampedLevels(item, options.level);
    if (levels !== from.levels) await item.update({ "system.levels": levels });
    return { itemId: String(item.id), from, to: { name: from.name, levels }, replaced: false };
  }
  return { itemId: String(item.id), from, to: { ...from }, replaced: false };
}
