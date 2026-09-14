/**
 * Handing a rule set's world data from the system to the add-on module that
 * takes the rule set over.
 *
 * When rules move out of the system, worlds already hold their data in the
 * system's storage: items of a system Item type, fields in the system's data
 * models, stored switch states. Foundry won't load a document whose type is
 * no longer registered, and drops fields a data model no longer declares the
 * next time the document is saved. So the data is copied while the system
 * still defines it, by the module, from its own `ready`:
 *
 *   - `migrateItemType` turns items of one type into another, keeping their ids;
 *   - `moveFields` copies fields into `system.extensions.<module>`;
 *   - `moveRuleState` carries a stored switch over to the module's own key.
 *
 * Each step is recorded in the world, under the module, so it runs once and
 * can be run again after a failure. And at `ready`, before anything is saved,
 * the GM is warned about deprecated data the world still holds that no active
 * module has said it migrates.
 */

import { SYSTEM_ID } from "./constants.js";
import { OPTIONAL_RULES_KEY } from "./optional-rules.js";

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

/** The world setting that records the steps each module has run. */
export const MIGRATIONS_KEY = "migrations";

/** What a migration step did, or why it didn't. */
export interface MigrationResult {
  /** True when the step had already run in this world. */
  skipped: boolean;
  /** Documents changed. */
  changed: number;
  /** Documents that failed to change; the step isn't recorded while there are any. */
  failed: number;
}

export function registerMigrationSettings(): void {
  game.settings.register(SYSTEM_ID, MIGRATIONS_KEY, { scope: "world", config: false, type: Object, default: {} });
}

function records(): Record<string, Record<string, { at: number }>> {
  const stored = safeSetting(MIGRATIONS_KEY);
  return stored && typeof stored === "object" ? (stored as Record<string, Record<string, { at: number }>>) : {};
}

function safeSetting(key: string): unknown {
  try {
    return game.settings.get(SYSTEM_ID, key);
  } catch {
    return undefined;
  }
}

/** Whether a module's step has run in this world. */
export function hasMigrated(module: string, step: string): boolean {
  return Boolean(records()[module]?.[step]);
}

async function record(module: string, step: string): Promise<void> {
  const all = foundry.utils.deepClone(records());
  all[module] = { ...(all[module] ?? {}), [step]: { at: Date.now() } };
  await game.settings.set(SYSTEM_ID, MIGRATIONS_KEY, all);
}

/** Forgets that a module's step has run, so it runs again. */
export async function resetMigration(module: string, step: string): Promise<void> {
  if (!game.user?.isGM) return;
  const all = foundry.utils.deepClone(records());
  if (!all[module]?.[step]) return;
  delete all[module][step];
  await game.settings.set(SYSTEM_ID, MIGRATIONS_KEY, all);
}

function validStep(what: string, module: unknown, step: unknown): boolean {
  if (typeof module !== "string" || !IDENTIFIER.test(module) || typeof step !== "string" || !step.trim()) {
    console.warn(`gworld | ${what}: the module id or step name is missing or malformed`);
    return false;
  }
  if (!game.user?.isGM) {
    console.warn(`gworld | ${what}: only the GM migrates world data`);
    return false;
  }
  return true;
}

/** Tells the GM how far a long step has got. */
function progress(label: string, done: number, total: number): void {
  if (total < 50) return;
  if (done === total || done % 50 === 0) {
    ui.notifications?.info(game.i18n.format("GWORLD.Migration.Progress", { label, done, total }));
  }
}

/** Every place an Item can live that a GM can change: the world, actors, and unlocked compendia. */
async function itemsEverywhere(): Promise<Array<{ item: any; save: (changes: object[]) => Promise<unknown> }>> {
  const found: Array<{ item: any; save: (changes: object[]) => Promise<unknown> }> = [];
  for (const item of (game as any).items ?? []) {
    found.push({ item, save: (changes) => (Item as any).updateDocuments(changes) });
  }
  for (const actor of (game as any).actors ?? []) {
    for (const item of actor.items ?? []) found.push({ item, save: (changes) => actor.updateEmbeddedDocuments("Item", changes) });
  }
  for (const pack of (game as any).packs ?? []) {
    if (pack.locked) continue;
    if (pack.documentName === "Item") {
      for (const item of await pack.getDocuments()) found.push({ item, save: (changes) => (Item as any).updateDocuments(changes, { pack: pack.collection }) });
    } else if (pack.documentName === "Actor") {
      for (const actor of await pack.getDocuments()) {
        for (const item of actor.items ?? []) found.push({ item, save: (changes) => actor.updateEmbeddedDocuments("Item", changes) });
      }
    }
  }
  return found;
}

/** Every Actor a GM can change: the world's and unlocked compendia's. */
async function actorsEverywhere(): Promise<Array<{ actor: any; save: (changes: object[]) => Promise<unknown> }>> {
  const found: Array<{ actor: any; save: (changes: object[]) => Promise<unknown> }> = [];
  for (const actor of (game as any).actors ?? []) found.push({ actor, save: (changes) => (Actor as any).updateDocuments(changes) });
  for (const pack of (game as any).packs ?? []) {
    if (pack.locked || pack.documentName !== "Actor") continue;
    for (const actor of await pack.getDocuments()) found.push({ actor, save: (changes) => (Actor as any).updateDocuments(changes, { pack: pack.collection }) });
  }
  return found;
}

/** Saves changes one at a time, so one bad document doesn't lose the rest. */
async function saveEach(entries: Array<{ save: (changes: object[]) => Promise<unknown>; change: object }>, label: string): Promise<{ changed: number; failed: number }> {
  let changed = 0;
  let failed = 0;
  for (const [index, entry] of entries.entries()) {
    try {
      await entry.save([entry.change]);
      changed += 1;
    } catch (error) {
      failed += 1;
      console.error(`gworld | ${label}: a document could not be migrated`, error);
    }
    progress(label, index + 1, entries.length);
  }
  return { changed, failed };
}

/**
 * Turns every item of `fromType` into `toType`, keeping its id, name and
 * picture, with the system data `mapData` makes of the old item's.
 */
export async function migrateItemType(options: {
  module: string;
  /** The step's name, recorded once it has run. Defaults to `itemType:<from>`. */
  step?: string;
  fromType: string;
  toType: string;
  mapData: (source: Record<string, any>, item: any) => Record<string, unknown>;
}): Promise<MigrationResult> {
  const step = options?.step ?? `itemType:${options?.fromType}`;
  const none = { skipped: false, changed: 0, failed: 0 };
  if (!validStep("migrateItemType", options?.module, step)) return none;
  if (typeof options.mapData !== "function" || !options.fromType || !options.toType) {
    console.warn("gworld | migrateItemType: fromType, toType and mapData are required");
    return none;
  }
  if (hasMigrated(options.module, step)) return { ...none, skipped: true };
  const replace = (foundry.data as any).operators.ForcedReplacement.create;
  const entries: Array<{ save: (changes: object[]) => Promise<unknown>; change: object }> = [];
  for (const { item, save } of await itemsEverywhere()) {
    if (item.type !== options.fromType) continue;
    let system: Record<string, unknown>;
    try {
      system = options.mapData(foundry.utils.deepClone(item._source?.system ?? {}), item);
    } catch (error) {
      console.error(`gworld | migrateItemType: mapping ${item.uuid} failed`, error);
      entries.push({ save: () => Promise.reject(error), change: {} });
      continue;
    }
    entries.push({ save, change: { _id: item.id, type: options.toType, system: replace(system ?? {}) } });
  }
  const result = await saveEach(entries, game.i18n.format("GWORLD.Migration.ItemType", { from: options.fromType, to: options.toType }));
  if (result.failed === 0) await record(options.module, step);
  return { skipped: false, ...result };
}

/**
 * Copies fields of the system's data into `system.extensions.<module>`. The
 * system's copy is left as it is: it goes when the system stops declaring it.
 */
export async function moveFields(options: {
  module: string;
  /** Defaults to `fields:<documentName>`. */
  step?: string;
  documentName: "Actor" | "Item";
  /** The types whose documents have the fields, or "*". */
  types: string[] | "*";
  /** Source path under `system` to target path under `system.extensions.<module>`. */
  fields: Record<string, string>;
  /** Changes a value on its way; return undefined to leave it out. */
  map?: (value: unknown, path: string, document: any) => unknown;
}): Promise<MigrationResult> {
  const step = options?.step ?? `fields:${options?.documentName}`;
  const none = { skipped: false, changed: 0, failed: 0 };
  if (!validStep("moveFields", options?.module, step)) return none;
  if ((options.documentName !== "Actor" && options.documentName !== "Item") || !options.fields || typeof options.fields !== "object") {
    console.warn("gworld | moveFields: documentName must be Actor or Item, and fields a map of paths");
    return none;
  }
  if (hasMigrated(options.module, step)) return { ...none, skipped: true };
  const documents = options.documentName === "Item"
    ? (await itemsEverywhere()).map((e) => ({ document: e.item, save: e.save }))
    : (await actorsEverywhere()).map((e) => ({ document: e.actor, save: e.save }));
  const entries: Array<{ save: (changes: object[]) => Promise<unknown>; change: object }> = [];
  for (const { document, save } of documents) {
    if (options.types !== "*" && !options.types.includes(document.type)) continue;
    const change: Record<string, unknown> = { _id: document.id };
    for (const [from, to] of Object.entries(options.fields)) {
      let value = foundry.utils.getProperty(document._source?.system ?? {}, from);
      if (value === undefined) continue;
      if (options.map) value = options.map(foundry.utils.deepClone(value), from, document);
      if (value === undefined) continue;
      change[`system.extensions.${options.module}.${to}`] = value;
    }
    if (Object.keys(change).length > 1) entries.push({ save, change });
  }
  const result = await saveEach(entries, game.i18n.format("GWORLD.Migration.Fields", { document: options.documentName }));
  if (result.failed === 0) await record(options.module, step);
  return { skipped: false, ...result };
}

/** Carries a stored switch over to a module's own namespaced key, where the module has none stored yet. */
export async function moveRuleState(options: { module: string; step?: string; fromKey: string; toKey: string; turnOff?: boolean }): Promise<MigrationResult> {
  const step = options?.step ?? `rule:${options?.fromKey}`;
  const none = { skipped: false, changed: 0, failed: 0 };
  if (!validStep("moveRuleState", options?.module, step)) return none;
  if (typeof options.toKey !== "string" || !options.toKey.startsWith(`${options.module}.`)) {
    console.warn(`gworld | moveRuleState: the new key must be "${options.module}.<key>"`);
    return none;
  }
  if (hasMigrated(options.module, step)) return { ...none, skipped: true };
  const stored = foundry.utils.deepClone((safeSetting(OPTIONAL_RULES_KEY) ?? {}) as Record<string, boolean>);
  let changed = 0;
  if (options.fromKey in stored && !(options.toKey in stored)) {
    stored[options.toKey] = stored[options.fromKey]!;
    changed = 1;
  }
  // The old switch off too, so the rule isn't in play twice (since 1.11.0).
  if (options.turnOff && stored[options.fromKey] !== false) {
    stored[options.fromKey] = false;
    changed = 1;
  }
  if (changed) await game.settings.set(SYSTEM_ID, OPTIONAL_RULES_KEY, stored);
  await record(options.module, step);
  return { skipped: false, changed, failed: 0 };
}

// ── coverage ───────────────────────────────────────────────────────────────

/**
 * Data the system still defines but is about to stop defining, so a world
 * that holds it needs a module to take it over first. A release that removes
 * something lists it here first.
 */
export interface DeprecatedData {
  /** What a module's manifest names in `flags.gworld.migrates` to say it takes this over. */
  id: string;
  /** What it is, for the warning. */
  label: string;
  /** What to install, for the warning. */
  install: string;
  itemType?: string;
  field?: { documentName: "Actor" | "Item"; types: string[]; path: string };
  rule?: string;
}

/** What the warning tells the GM to install for the data below. */
const INSTALL_RULE_SET = "the add-on module that now provides these rules";

/**
 * The data of the rule group 1.5.0 removed (sargas79/GWorldVTT#243), flagged
 * by 1.4.0 while the system still defined it. A module that takes a rule set
 * over names these ids in its manifest's `flags.gworld.migrates`. Now that the
 * data models no longer declare the fields, only the item type and the stored
 * switches can still be found; the list stays so a world that skipped 1.4.0 is
 * still told what to install.
 */
export const DEPRECATED_DATA: readonly DeprecatedData[] = [
  { id: "ritual-items", label: "ritual items", install: INSTALL_RULE_SET, itemType: "ritual" },
  { id: "ritual-path", label: "mana reserves and rituals in effect", install: INSTALL_RULE_SET, field: { documentName: "Actor", types: ["character", "npc"], path: "ritualPath" } },
  { id: "ritual-path", label: "charms", install: INSTALL_RULE_SET, field: { documentName: "Item", types: ["equipment"], path: "charm" } },
  { id: "ritual-path", label: "grimoires", install: INSTALL_RULE_SET, field: { documentName: "Item", types: ["equipment"], path: "grimoire" } },
  { id: "bonus-points", label: "destiny and wildcard point pools", install: INSTALL_RULE_SET, field: { documentName: "Actor", types: ["character", "npc"], path: "bonusPoints" } },
  { id: "holy-items", label: "holy items", install: INSTALL_RULE_SET, field: { documentName: "Item", types: ["equipment"], path: "holy" } },
  { id: "gear-options", label: "gear improvements", install: INSTALL_RULE_SET, field: { documentName: "Item", types: ["equipment", "armor"], path: "improvements" } },
  { id: "gear-options", label: "Holdout bonuses on gear", install: INSTALL_RULE_SET, field: { documentName: "Item", types: ["equipment", "armor"], path: "holdout" } },
  { id: "gear-options", label: "gear marked as Signature Gear", install: INSTALL_RULE_SET, field: { documentName: "Item", types: ["equipment", "armor"], path: "signature" } },
  { id: "gear-options", label: "weapon improvements", install: INSTALL_RULE_SET, field: { documentName: "Item", types: ["equipment"], path: "weaponImprovements" } },
  { id: "gear-options", label: "improvised weapon penalties", install: INSTALL_RULE_SET, field: { documentName: "Item", types: ["equipment"], path: "improvisedPenalty" } },
  ...["talentsSkipWildcards", "holyAttacks", "ritualPathMagic", "monsterHuntersGear", "bonusPointSpending"].map((rule) => ({
    id: "rule-switches", label: `the "${rule}" switch`, install: INSTALL_RULE_SET, rule,
  })),
];

/** The list the coverage check reads, from `CONFIG.GWORLD.deprecatedData`. */
function deprecatedData(): DeprecatedData[] {
  const configured = (globalThis as any).CONFIG?.GWORLD?.deprecatedData;
  return Array.isArray(configured) ? configured : [...DEPRECATED_DATA];
}

/** Puts the list where the coverage check reads it. Called at init. */
export function configureDeprecatedData(): void {
  const config = (globalThis as any).CONFIG;
  if (!config) return;
  config.GWORLD ??= {};
  config.GWORLD.deprecatedData ??= [...DEPRECATED_DATA];
}

/** Whether a value differs from what a new document would hold there. */
function holdsData(value: unknown, initial: unknown): boolean {
  if (value === undefined || value === null || value === "") return false;
  return JSON.stringify(value) !== JSON.stringify(initial);
}

/** Whether the world holds any of this deprecated data. Reads only; saves nothing. */
export function worldHolds(entry: DeprecatedData, world: { items: any[]; actors: any[]; storedRules: Record<string, unknown> }): boolean {
  const allItems = [...world.items, ...world.actors.flatMap((a) => withInvalid(a.items))];
  // An item whose type the system no longer registers is kept out of its
  // collection as invalid, so its type is read from what is stored.
  if (entry.itemType && allItems.some((item) => (item?._source?.type ?? item?.type) === entry.itemType)) return true;
  if (entry.field) {
    const { documentName, types, path } = entry.field;
    const documents = documentName === "Item" ? allItems : world.actors;
    for (const document of documents) {
      if (!types.includes(document?.type)) continue;
      const model = (globalThis as any).CONFIG?.[documentName]?.dataModels?.[document.type];
      const field = model?.schema?.getField?.(path);
      const initial = field?.getInitialValue ? field.getInitialValue({}) : undefined;
      if (holdsData(foundry.utils.getProperty(document._source?.system ?? {}, path), initial)) return true;
    }
  }
  if (entry.rule && entry.rule in world.storedRules && world.storedRules[entry.rule] === true) return true;
  return false;
}

/**
 * A collection's documents, with those Foundry keeps out of it as invalid: an
 * item of a type no longer registered is one.
 */
export function withInvalid(collection: any): any[] {
  const valid = [...(collection ?? [])];
  const ids = collection?.invalidDocumentIds;
  if (!ids || typeof collection.getInvalid !== "function") return valid;
  const invalid = [...ids].map((id) => {
    try {
      return collection.getInvalid(id, { strict: false });
    } catch {
      return null;
    }
  });
  return [...valid, ...invalid.filter(Boolean)];
}

/** The deprecated data this world holds that no active module says it migrates. */
export function uncoveredData(entries: DeprecatedData[], world: { items: any[]; actors: any[]; storedRules: Record<string, unknown> }, modules: any[]): DeprecatedData[] {
  const covered = new Set<string>();
  for (const module of modules) {
    if (!module?.active) continue;
    const migrates = module.flags?.gworld?.migrates;
    if (Array.isArray(migrates)) for (const id of migrates) covered.add(String(id));
  }
  return entries.filter((entry) => !covered.has(entry.id) && worldHolds(entry, world));
}

/**
 * Warns the GM, once per load and before anything is saved, about deprecated
 * data the world holds that no active module migrates.
 */
export function warnUncoveredData(): void {
  if (!game.user?.isGM) return;
  const entries = deprecatedData();
  if (entries.length === 0) return;
  const uncovered = uncoveredData(
    entries,
    {
      items: withInvalid((game as any).items),
      actors: withInvalid((game as any).actors),
      storedRules: (safeSetting(OPTIONAL_RULES_KEY) ?? {}) as Record<string, unknown>,
    },
    [...(((game as any).modules as Map<string, any> | undefined)?.values() ?? [])],
  );
  // One warning for everything the same module takes over: a world with a whole
  // rule set's data gets one notice, not one for each field.
  const byInstall = new Map<string, string[]>();
  for (const entry of uncovered) {
    const labels = byInstall.get(entry.install) ?? [];
    if (!labels.includes(entry.label)) labels.push(entry.label);
    byInstall.set(entry.install, labels);
  }
  for (const [install, labels] of byInstall) {
    ui.notifications?.warn(game.i18n.format("GWORLD.Migration.Uncovered", { label: labels.join(", "), install }), { permanent: true });
  }
}

/** What the API exposes. */
export const migrationApi = Object.freeze({ migrateItemType, moveFields, moveRuleState, hasMigrated, resetMigration });
