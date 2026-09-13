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
import {
  needsReview,
  planTemplateRemoval,
  type RemovalItem,
  type RemovalPlan,
} from "./template-removal.js";

/** What a character has been built from. */
export interface AppliedTemplate {
  name: string;
  kind: "character" | "racial" | "lens" | "metaTrait";
  uuid: string;
  attributeCost: number;
  granted: Record<string, number>;
  /**
   * What the sheet held before, for the numbers a template writes rather than
   * grants.
   *
   * A character template's attributes and secondary levels are bought, so
   * there is nothing to "give back" -- but removal deletes the items it added,
   * and leaving the attributes it set would be half a removal. What it
   * overwrote is kept so that taking it off means taking it off.
   */
  previous: Record<string, number>;
  /** What it wrote there, so a value changed since can be told apart. */
  written?: Record<string, number>;
  /** When it was applied; null on records made before this was kept. */
  at?: number | null;
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
  const previous: Record<string, number> = {};
  const written: Record<string, number> = {};

  // A character template states scores to buy; a racial one states modifiers
  // to whatever was bought, which are granted rather than billed.
  for (const [key, value] of Object.entries(applied.attributes)) {
    previous[`attributes.${key}`] = Number(actor.system?.attributes?.[key]) || 10;
    changes[`system.attributes.${key}`] = value;
    written[`attributes.${key}`] = value;
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
    previous[`purchased.${key}`] = current;
    changes[`system.purchased.${key}`] = current + value;
    written[`purchased.${key}`] = current + value;
  }
  for (const [key, value] of Object.entries(applied.bonuses)) {
    const current = Number(actor.system?.bonuses?.[key]) || 0;
    changes[`system.bonuses.${key}`] = current + value;
    granted[key] = value;
  }
  // Size adds rather than replaces, which is the stacking rule for two racial
  // templates -- "add traits that come in levels" -- and is also what lets
  // removal give back exactly what was granted.
  if (applied.sizeModifier) {
    const current = Number(actor.system?.sm) || 0;
    changes["system.sm"] = current + applied.sizeModifier;
    granted["sm"] = applied.sizeModifier;
  }

  const record: AppliedTemplate = {
    name: template.name,
    kind: template.kind,
    uuid: options.uuid ?? "",
    attributeCost: applied.attributeCost,
    granted,
    previous,
    written,
    // After the items were made, so nothing it created counts as edited.
    at: Date.now(),
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

/** A number on the actor by the path a template record keys it under. */
function valueAt(actor: any, path: string): number | undefined {
  const value = foundry.utils.getProperty(actor.system ?? {}, path);
  return typeof value === "number" ? value : undefined;
}

/**
 * A record's path-keyed numbers as flat paths.
 *
 * They are written as "attributes.ST", but an update expands a dotted key
 * into nesting on the way to the database, so what comes back off the actor
 * is `{attributes: {ST: 12}}`. Flattening reads either form.
 */
function flatPaths(value: unknown): Record<string, number> {
  const flat = foundry.utils.flattenObject((value ?? {}) as object) as Record<string, unknown>;
  const out: Record<string, number> = {};
  for (const [path, n] of Object.entries(flat)) if (typeof n === "number") out[path] = n;
  return out;
}

/** What removing this template would do, read off the actor as it is now. */
export function removalPlanFor(actor: any, record: AppliedTemplate): RemovalPlan {
  const items = new Map<string, RemovalItem>();
  for (const id of record.itemIds) {
    const item = actor.items?.get(id);
    if (!item) continue;
    items.set(id, {
      id,
      name: String(item.name ?? ""),
      modifiedTime: typeof item._stats?.modifiedTime === "number" ? item._stats.modifiedTime : null,
    });
  }
  const flat: AppliedTemplate = { ...record, previous: flatPaths(record.previous) };
  if (record.written) flat.written = flatPaths(record.written);
  return planTemplateRemoval(flat, items, (path) => valueAt(actor, path));
}

/**
 * Takes a template back off (p. 258).
 *
 * "You are free to alter anything that came with it" cuts both ways: a player
 * who has since deleted one of the template's traits should not have the
 * removal fail, so items that are already gone are passed over rather than
 * complained about; and a number they have raised by hand since is theirs,
 * so it is left where they put it rather than wound back.
 */
export async function removeTemplateFromActor(options: {
  actor: any;
  index: number;
  /** Leave the items where they are and only give the modifiers back. */
  keepItems?: boolean;
}): Promise<RemovalPlan | null> {
  const { actor } = options;
  if (!actor?.isOwner) return null;

  const templates = appliedTemplates(actor);
  const record = templates[options.index];
  if (!record) return null;

  const plan = removalPlanFor(actor, record);

  if (!options.keepItems && plan.present.length) {
    await actor.deleteEmbeddedDocuments("Item", plan.present.map((item) => item.id));
  }

  const changes: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record.granted ?? {})) {
    if (key === "sm") {
      changes["system.sm"] = (Number(actor.system?.sm) || 0) - value;
      continue;
    }
    const where = ["ST", "DX", "IQ", "HT"].includes(key) ? "racial" : "bonuses";
    const current = Number(actor.system?.[where]?.[key]) || 0;
    changes[`system.${where}.${key}`] = current - value;
  }

  // What a character template overwrote goes back exactly as it was, where
  // it still reads what the template wrote.
  for (const [path, value] of Object.entries(plan.restore)) {
    changes[`system.${path}`] = value;
  }

  changes["system.templates"] = templates.filter((_, index) => index !== options.index);
  await actor.update(changes);

  ui.notifications?.info(
    plan.kept.length
      ? game.i18n.format("GWORLD.Template.RemovedKept", { name: record.name, count: plan.kept.length })
      : game.i18n.format("GWORLD.Template.Removed", { name: record.name }),
  );
  return plan;
}

/** A path a template record keys a number under, as the sheet labels it. */
function pathLabel(path: string): string {
  const [where, key = ""] = path.split(".");
  if (where === "attributes") return game.i18n.localize(`GWORLD.Attribute.${key}`);
  if (where === "purchased") {
    const known: Record<string, string> = {
      hp: "HP", will: "Will", per: "Per", fp: "FP", basicSpeed: "BasicSpeed", basicMove: "BasicMove",
    };
    const label = known[key];
    if (label) return game.i18n.localize(`GWORLD.Secondary.${label}`);
  }
  return path;
}

/**
 * Asks before taking a template off, and then does it.
 *
 * What to do with the items is a real question rather than a confirmation:
 * a character who has played a few sessions has made those traits their
 * own, and deleting them is not always what "remove the template" means.
 * Where anything has been changed since -- an item edited, a number raised
 * by hand -- the dialog says so, so what will go and what will stay is
 * agreed to rather than discovered.
 *
 * Shared by the sheet and the guided build, which offer the same removal.
 */
export async function confirmAndRemoveTemplate(actor: any, index: number): Promise<boolean> {
  const record = appliedTemplates(actor)[index];
  if (!record || !actor?.isOwner) return false;

  const plan = removalPlanFor(actor, record);
  const escape = (text: string) => foundry.utils.escapeHTML(text);
  const list = (lines: string[]) => `<ul>${lines.map((line) => `<li>${line}</li>`).join("")}</ul>`;

  const parts = [
    `<p>${game.i18n.format("GWORLD.Template.RemoveAsk", {
      name: escape(record.name),
      count: plan.present.length,
    })}</p>`,
  ];
  if (plan.missing > 0) {
    parts.push(`<p>${game.i18n.format("GWORLD.Template.RemoveMissing", { count: plan.missing })}</p>`);
  }
  if (needsReview(plan)) {
    parts.push(`<p class="gworld-warning">${game.i18n.localize("GWORLD.Template.RemoveReview")}</p>`);
    if (plan.edited.length) {
      parts.push(
        `<p>${game.i18n.localize("GWORLD.Template.RemoveEdited")}</p>`,
        list(plan.edited.map((item) => escape(item.name))),
      );
    }
    if (plan.kept.length) {
      parts.push(
        `<p>${game.i18n.localize("GWORLD.Template.RemoveKept")}</p>`,
        list(plan.kept.map((k) => `${escape(pathLabel(k.path))} ${k.value}`)),
      );
    }
  }

  const buttons = [
    ...(plan.present.length
      ? [{ action: "items", label: game.i18n.localize("GWORLD.Template.RemoveItems") }]
      : []),
    { action: "keep", label: game.i18n.localize(plan.present.length ? "GWORLD.Template.KeepItems" : "GWORLD.Template.Remove") },
    { action: "cancel", label: game.i18n.localize("GWORLD.Chat.Cancel") },
  ];

  const answer = await foundry.applications.api.DialogV2.wait({
    window: { title: game.i18n.localize("GWORLD.Template.Remove") },
    content: parts.join(""),
    buttons,
    rejectClose: false,
  });
  if (answer === "cancel" || answer === null) return false;

  await removeTemplateFromActor({ actor, index, keepItems: answer === "keep" });
  return true;
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
