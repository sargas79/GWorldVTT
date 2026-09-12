/**
 * Putting a template on a character, and taking it off again
 * (GURPS Basic Set: Characters pp. 258-263).
 *
 * Applying one is four separate things at once: it creates items, it moves
 * attributes, it grants secondary levels, and it bills points. Taking it off
 * has to undo exactly those and nothing else -- which is why what it did is
 * written down on the actor rather than worked out again afterwards from a
 * sheet that has since been played with.
 *
 * The rule that shapes the whole module is the racial one: "there is no added
 * point cost for any of this! You paid for these bonuses or penalties when you
 * paid your racial cost." So a racial template's modifiers are granted rather
 * than bought, and the cost it states for them is billed once.
 */

import { SYSTEM_ID } from "./constants.js";
import {
  applyTemplate,
  requiredEntries,
  type Template,
  type TemplateEntry,
} from "../rules/templates.js";

/** What a character has been built from. */
export interface AppliedTemplate {
  name: string;
  kind: "character" | "racial" | "lens" | "metaTrait";
  uuid: string;
  attributeCost: number;
  granted: Record<string, number>;
  itemIds: string[];
}

/** The templates already on an actor. */
export function appliedTemplates(actor: any): AppliedTemplate[] {
  const list = actor?.system?.templates;
  return Array.isArray(list) ? (list as AppliedTemplate[]) : [];
}

/**
 * The item data one entry becomes.
 *
 * An entry naming a compendium document copies that document, so the trait
 * arrives with its cost table, its modifiers and its page reference rather than
 * as a name and a number. One that names nothing becomes a plain item, which is
 * what a GM writing a template off the top of their head will produce.
 */
async function itemDataFor(entry: TemplateEntry): Promise<object | null> {
  if (entry.uuid) {
    const document = await fromUuid(entry.uuid);
    if (document) {
      const data = document.toObject();
      delete data._id;
      // The template's own numbers win: a template may take a trait at a level
      // or a skill at a number of points the compendium entry knows nothing of.
      if (entry.points !== 0) data.system = { ...data.system, points: entry.points };
      if (entry.levels) data.system = { ...data.system, levels: entry.levels };
      return data;
    }
    // A uuid that resolves to nothing is a compendium that moved. Falling back
    // to the name is better than dropping the entry silently.
  }

  return {
    name: entry.name,
    type: entry.itemType,
    system: {
      points: entry.points,
      ...(entry.levels ? { levels: entry.levels } : {}),
      ...(entry.note ? { reference: entry.note } : {}),
    },
  };
}

/**
 * Puts a template on a character (pp. 258, 261).
 *
 * `picks` are the entries chosen from the template's choice groups; everything
 * ungrouped is taken as well, because "racial traits are rarely optional" and a
 * character template's required entries are what makes it a template.
 */
export async function applyTemplateToActor(options: {
  actor: any;
  template: Template;
  /** The compendium item the template came from, for the record. */
  uuid?: string;
  picks: TemplateEntry[];
}): Promise<AppliedTemplate | null> {
  const { actor, template } = options;

  if (!actor?.isOwner) {
    ui.notifications?.warn(
      game.i18n.format("GWORLD.Chat.CannotApply", { names: String(actor?.name ?? "") }),
    );
    return null;
  }

  const applied = applyTemplate({
    template,
    bought: actor.system?.attributes ?? { ST: 10, DX: 10, IQ: 10, HT: 10 },
  });

  // ── the items ─────────────────────────────────────────────────────────
  const entries = [...requiredEntries(template), ...options.picks];
  const documents = (await Promise.all(entries.map(itemDataFor))).filter(
    (data): data is object => data !== null,
  );
  const created = documents.length
    ? await actor.createEmbeddedDocuments("Item", documents)
    : [];

  // ── the numbers ───────────────────────────────────────────────────────
  const changes: Record<string, unknown> = {};
  const granted: Record<string, number> = {};

  // A character template states scores to buy; a racial one states modifiers
  // to whatever was bought, which are granted rather than billed.
  for (const [key, value] of Object.entries(applied.attributes)) {
    changes[`system.attributes.${key}`] = value;
  }
  for (const [key, value] of Object.entries(applied.racial)) {
    const current = Number(actor.system?.racial?.[key]) || 0;
    changes[`system.racial.${key}`] = current + value;
    granted[key] = value;
  }
  // Bought levels are billed by the sheet, so they are simply written; granted
  // ones are recorded as well, since taking the template off has to give back
  // exactly what it gave.
  for (const [key, value] of Object.entries(applied.purchased)) {
    const current = Number(actor.system?.purchased?.[key]) || 0;
    changes[`system.purchased.${key}`] = current + value;
  }
  for (const [key, value] of Object.entries(applied.bonuses)) {
    const current = Number(actor.system?.bonuses?.[key]) || 0;
    changes[`system.bonuses.${key}`] = current + value;
    granted[key] = value;
  }
  if (applied.sizeModifier !== null) changes["system.sm"] = applied.sizeModifier;

  const record: AppliedTemplate = {
    name: template.name,
    kind: template.kind,
    uuid: options.uuid ?? "",
    attributeCost: applied.attributeCost,
    granted,
    itemIds: created.map((item: { id: string }) => item.id),
  };

  changes["system.templates"] = [...appliedTemplates(actor), record];
  await actor.update(changes);

  ui.notifications?.info(
    game.i18n.format("GWORLD.Template.Applied", {
      name: template.name,
      count: created.length,
    }),
  );

  return record;
}

/**
 * Takes a template back off (p. 258).
 *
 * "You are free to alter anything that came with it" cuts both ways: a player
 * who has since deleted one of the template's traits should not have the
 * removal fail, so items that are already gone are passed over rather than
 * complained about.
 */
export async function removeTemplateFromActor(options: {
  actor: any;
  index: number;
  /** Leave the items where they are and only give the modifiers back. */
  keepItems?: boolean;
}): Promise<void> {
  const { actor } = options;
  if (!actor?.isOwner) return;

  const templates = appliedTemplates(actor);
  const record = templates[options.index];
  if (!record) return;

  if (!options.keepItems) {
    const present = record.itemIds.filter((id) => actor.items?.get(id));
    if (present.length) await actor.deleteEmbeddedDocuments("Item", present);
  }

  const changes: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record.granted ?? {})) {
    const where = ["ST", "DX", "IQ", "HT"].includes(key) ? "racial" : "bonuses";
    const current = Number(actor.system?.[where]?.[key]) || 0;
    changes[`system.${where}.${key}`] = current - value;
  }

  changes["system.templates"] = templates.filter((_, index) => index !== options.index);
  await actor.update(changes);

  // The Size Modifier is deliberately left where it is: a character template
  // does not set one, and a racial template's is the character's size now --
  // there is no earlier value to put back that would not be a guess.
  ui.notifications?.info(
    game.i18n.format("GWORLD.Template.Removed", { name: record.name }),
  );
}

/**
 * A template's own data, from an item.
 *
 * The item's name is the template's name, which is why this is not simply
 * `item.system.toTemplate()` at every call site: an item dropped from a
 * compendium may not have been prepared yet.
 */
export function templateFromItem(item: any): Template | null {
  if (item?.type !== "template") return null;

  const system = item.system;
  if (typeof system?.toTemplate === "function") return system.toTemplate();

  return {
    name: String(item.name ?? ""),
    kind: system?.kind ?? "character",
    statedCost: Number(system?.statedCost) || 0,
    attributes: system?.attributes ?? {},
    secondary: system?.secondary ?? {},
    sizeModifier: Number(system?.sizeModifier) || 0,
    attributeCost: Number(system?.attributeCost) || 0,
    entries: system?.entries ?? [],
    choices: system?.choices ?? [],
    features: system?.features ?? [],
    tabooTraits: system?.tabooTraits ?? [],
  };
}

/** Where a template dropped on a sheet is remembered while its dialog is open. */
export const PENDING_TEMPLATE_FLAG = "pendingTemplate";

/** Records a template drop, so the dialog can pick it up. */
export async function rememberDrop(actor: any, uuid: string): Promise<void> {
  if (!actor?.isOwner) return;
  await actor.setFlag(SYSTEM_ID, PENDING_TEMPLATE_FLAG, uuid);
}
