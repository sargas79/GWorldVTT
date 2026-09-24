/**
 * Changing a character's traits from a module (since API 1.112.0).
 *
 * A level up or down -- Charisma bought up, Wealth lost -- or a swap between
 * related traits, such as one level of Appearance for another (Characters
 * p. 21), which the book writes as separate traits. The edit is the sheet's:
 * the trait item's `levels`, kept within what the trait can hold, or the item
 * replaced by another trait. Since 1.124.0 it also gives a character a trait
 * they haven't got, or takes one away, as a lasting injury or an operation
 * can (Campaigns p. 422). It is the GM's to make, since it rewrites a
 * character's build.
 */

import { clampedLevels } from "./advancement.js";
import { normalizeSkillName } from "../rules/skills.js";

/**
 * What `changeTrait` changed: the trait before and after, by the item that
 * holds it now. A trait just added has no `from`, and one removed has no
 * `to`; its `itemId` is then the item that held it.
 */
export interface TraitChanged {
  itemId: string;
  from: { name: string; levels: number } | null;
  to: { name: string; levels: number } | null;
  replaced: boolean;
  added: boolean;
  removed: boolean;
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
 * A trait to create, from a name looked up in the Item compendia or from the
 * trait's item data, with its levels set when a `level` is given. Null when
 * the name can't be found or the data isn't a trait's.
 */
async function traitToCreate(wanted: string | Record<string, any>, level: number | undefined): Promise<Record<string, any> | null> {
  const source = typeof wanted === "string"
    ? await traitFromPacks(wanted)
    : (wanted?.type === "trait" ? foundry.utils.deepClone(wanted) : null);
  if (!source) return null;
  delete source._id;
  const system = { ...(source.system ?? {}) };
  if (typeof level === "number") system.levels = clampedLevels({ system }, level);
  return { ...source, system };
}

/**
 * Changes one of a character's traits. `name` or `id` finds it. `level`
 * sets its levels, brought within its cap and cost table as a typed level
 * is. `replaceWith` swaps it for another trait: a name looked up in the
 * Item compendia, or the trait's item data; given with `level`, the new
 * trait takes that level. `remove` takes the trait away. `add` gives the
 * character a trait instead, found the way `replaceWith` finds one, and
 * needs no `id` or `name`. Null for a user who isn't a GM, a trait the
 * character hasn't got (or, for `add`, already has), or a trait to add or
 * swap in that can't be found.
 */
export async function changeTrait(actor: any, options: {
  id?: string;
  name?: string;
  level?: number;
  replaceWith?: string | Record<string, any>;
  add?: string | Record<string, any>;
  remove?: boolean;
}): Promise<TraitChanged | null> {
  if (!game.user?.isGM) {
    ui.notifications?.warn(game.i18n.localize("GWORLD.Trait.GmOnly"));
    return null;
  }
  options = options ?? {};

  if (options.add !== undefined && options.add !== null) {
    const data = await traitToCreate(options.add, options.level);
    if (!data) return null;
    // A trait the character already has is changed, not bought twice: a
    // second copy would count its points twice and split its levels.
    if (traitOn(actor, { name: String(data.name ?? "") })) return null;
    const [created] = await actor.createEmbeddedDocuments("Item", [data]);
    if (!created) return null;
    return { itemId: String(created.id), from: null, to: { name: String(created.name ?? ""), levels: levelsOf(created) }, replaced: false, added: true, removed: false };
  }

  const item = traitOn(actor, options);
  if (!item) return null;
  const from = { name: String(item.name ?? ""), levels: levelsOf(item) };
  const unchanged = { replaced: false, added: false, removed: false };

  if (options.remove === true) {
    await actor.deleteEmbeddedDocuments("Item", [item.id]);
    return { itemId: String(item.id), from, to: null, ...unchanged, removed: true };
  }

  if (options.replaceWith !== undefined && options.replaceWith !== null) {
    const data = await traitToCreate(options.replaceWith, options.level);
    if (!data) return null;
    const [created] = await actor.createEmbeddedDocuments("Item", [data]);
    if (!created) return null;
    await actor.deleteEmbeddedDocuments("Item", [item.id]);
    return { itemId: String(created.id), from, to: { name: String(created.name ?? ""), levels: levelsOf(created) }, ...unchanged, replaced: true };
  }

  if (typeof options.level === "number") {
    const levels = clampedLevels(item, options.level);
    if (levels !== from.levels) await item.update({ "system.levels": levels });
    return { itemId: String(item.id), from, to: { name: from.name, levels }, ...unchanged };
  }
  return { itemId: String(item.id), from, to: { ...from }, ...unchanged };
}
