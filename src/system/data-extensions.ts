/**
 * Where an add-on module plugs into the system's data.
 *
 *   - **Its own Item types**, declared in its manifest (`<module>.<type>`),
 *     shown on the character sheet in the tab it names, with the columns and
 *     row actions it gives, and opened on a generic item sheet unless it
 *     registers a sheet of its own.
 *   - **Its own fields on the system's documents**, under
 *     `system.extensions.<module>`: validated against the schema it registers,
 *     filled with their initial values, and kept untouched while the module
 *     is not running.
 *   - **Price and weight modifiers**, which the system applies on top of an
 *     item's stored price when it totals what a character carries and owns.
 *   - **Technique kinds**, for techniques worked out from more than a skill and
 *     a penalty.
 *   - **Hooks** after the system prepares an actor or item, and where skill
 *     levels, attributes and defenses are totalled -- each carrying the lines
 *     the system added, so a module can add its own or change one with a reason.
 */


const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

function refuse(what: string, why: string): null {
  console.warn(`gworld | ${what} not registered: ${why}`);
  return null;
}

/** The hooks this module fires, by name. */
export const DATA_HOOKS = Object.freeze({
  /** After the system prepares an actor or an item: `(document)`. */
  prepareDerivedData: "gworld.prepareDerivedData",
  /** While a skill's level is worked out: `{ actor, item, name, difficulty, lines }`, the lines mutable. */
  skillBonuses: "gworld.skillBonuses",
  /** After the attributes are totalled: `{ actor, attributes, lines }`; push `{ attribute, label, value }`. */
  attributeBonuses: "gworld.attributeBonuses",
  /** After the defenses are worked out: `{ actor, defenses, lines }`; push `{ defense, label, value }`. */
  defenseBonuses: "gworld.defenseBonuses",
});

/** A bonus line: what it is, what it is worth, and why it was changed if it was. */
export interface BonusLine {
  /** For the system's own lines, what the line is: `bonus`, `magic`, `talent`, `tools`. */
  key?: string;
  label: string;
  value: number;
  /** Where the line came from: `system` for the system's own, or a module id. */
  source: string;
  /** Set by whoever changed or cancelled a line, and shown with it. */
  reason?: string;
}

/**
 * Runs a bonus hook and totals the lines. A listener may push lines, change a
 * line's value, or set it to zero with a reason; one that throws is logged
 * and the lines stand as they were.
 */
export function totalBonusLines<T extends { lines: BonusLine[] }>(hook: string, context: T): { total: number; lines: BonusLine[] } {
  const hooks = (globalThis as { Hooks?: { callAll?: (event: string, ...args: unknown[]) => unknown } }).Hooks;
  const before = context.lines.map((line) => ({ ...line }));
  try {
    hooks?.callAll?.(hook, context);
  } catch (error) {
    console.warn(`gworld | a ${hook} listener failed`, error);
    context.lines = before;
  }
  const lines = context.lines.filter((l) => typeof l?.label === "string" && typeof l?.value === "number" && Number.isFinite(l.value));
  return { total: lines.reduce((sum, line) => sum + line.value, 0), lines };
}

// ── fields on the system's documents ───────────────────────────────────────

export type ExtendedDocument = "Actor" | "Item";

export interface DataExtensionRegistration {
  module: string;
  documentName: ExtendedDocument;
  /** The types it applies to, or "*" for every type of that document. */
  types: string[] | "*";
  /** The fields, as for a `SchemaField`: `{ capacity: new NumberField(...) }`. */
  schema: Record<string, unknown>;
}

interface DataExtension {
  module: string;
  documentName: ExtendedDocument;
  types: string[] | "*";
  field: any;
}

const extensions: DataExtension[] = [];

/** Registers a module's fields under `system.extensions.<module>`. Returns the module id, or null. */
export function registerDataExtension(registration: DataExtensionRegistration): string | null {
  const r = registration ?? ({} as DataExtensionRegistration);
  const what = `data extension for ${r.module}`;
  if (typeof r.module !== "string" || !IDENTIFIER.test(r.module)) return refuse(what, "the module id is missing or malformed");
  if (r.documentName !== "Actor" && r.documentName !== "Item") return refuse(what, "documentName must be Actor or Item");
  if (r.types !== "*" && (!Array.isArray(r.types) || r.types.length === 0 || r.types.some((t) => typeof t !== "string"))) {
    return refuse(what, 'types must be "*" or a list of type names');
  }
  if (!r.schema || typeof r.schema !== "object") return refuse(what, "it has no schema");
  const overlapping = extensions.some((e) =>
    e.module === r.module && e.documentName === r.documentName
    && (e.types === "*" || r.types === "*" || e.types.some((t) => (r.types as string[]).includes(t))));
  if (overlapping) return refuse(what, "the module already extends one of those types");
  let field: any;
  try {
    field = new foundry.data.fields.SchemaField(r.schema as any);
  } catch (error) {
    return refuse(what, `its schema could not be built (${String((error as Error)?.message ?? error)})`);
  }
  extensions.push({ module: r.module, documentName: r.documentName, types: r.types === "*" ? "*" : [...r.types], field });
  return r.module;
}

/** The registered extensions that apply to one document type. */
export function extensionsFor(documentName: ExtendedDocument, type: string): DataExtension[] {
  return extensions.filter((e) => e.documentName === documentName && (e.types === "*" || e.types.includes(type)));
}

let ExtensionsFieldClass: any = null;

/**
 * The `system.extensions` field of an Actor or Item data model.
 *
 * An object whose registered keys are cleaned and validated against their
 * module's schema -- filled in with initial values where the document has
 * none yet -- and whose other keys are left exactly as they are, so a module
 * that is switched off loses nothing it stored.
 *
 * The field is shared by every type's schema, so it finds its own type from
 * the data model class that holds it.
 */
export function extensionsField(documentName: ExtendedDocument): any {
  const fields = foundry.data.fields as any;
  if (!ExtensionsFieldClass) {
    ExtensionsFieldClass = class ExtensionsField extends fields.ObjectField {
      gworldDocument: ExtendedDocument = "Item";
      #type: string | null = null;

      get gworldType(): string {
        if (this.#type !== null) return this.#type;
        let node: any = this.parent;
        while (node && !node.model) node = node.parent;
        const models = (globalThis as any).CONFIG?.[this.gworldDocument]?.dataModels ?? {};
        const type = Object.entries(models).find(([, model]) => model === node?.model)?.[0];
        if (type) this.#type = type;
        return type ?? "";
      }

      _cleanType(data: any, options: any = {}, state: any = {}): any {
        const cleaned = super._cleanType(data, options, state);
        for (const extension of extensionsFor(this.gworldDocument, this.gworldType)) {
          const current = cleaned[extension.module];
          if (current === undefined && options.partial) continue;
          const value = current && typeof current === "object" ? current : {};
          cleaned[extension.module] = extension.field.clean(value, { ...options, partial: Boolean(options.partial) && current !== undefined });
        }
        return cleaned;
      }

      _validateType(data: any, options: any = {}): void {
        super._validateType?.(data, options);
        for (const extension of extensionsFor(this.gworldDocument, this.gworldType)) {
          if (!(extension.module in (data ?? {}))) continue;
          const failure = extension.field.validate(data[extension.module], { ...options });
          if (failure) throw failure;
        }
      }
    };
  }
  const field = new ExtensionsFieldClass({ required: true, nullable: false, initial: {} });
  field.gworldDocument = documentName;
  return field;
}

/**
 * A module's extension data on a document: what it stored, over the initial
 * values of the fields it registered for that document's type.
 */
export function getExtension(document: any, module: string): Record<string, unknown> {
  const documentName: ExtendedDocument | null = document?.documentName === "Actor" || document?.documentName === "Item" ? document.documentName : null;
  const extension = documentName ? extensionsFor(documentName, String(document?.type ?? "")).find((e) => e.module === module) : undefined;
  const initial = safely(() => (extension ? extension.field.getInitialValue({}) : {}), {});
  const data = document?.system?.extensions?.[module];
  return { ...initial, ...(data && typeof data === "object" ? data : {}) };
}

/** Updates a module's extension data on a document. */
export async function updateExtension(document: any, module: string, patch: Record<string, unknown>): Promise<void> {
  if (!document?.isOwner || !IDENTIFIER.test(module) || !patch || typeof patch !== "object") return;
  await document.update(Object.fromEntries(Object.entries(patch).map(([key, value]) => [`system.extensions.${module}.${key}`, value])));
}

// ── a module's item types ──────────────────────────────────────────────────

/** Where on the character sheet a module's item type is listed. */
export const SHEET_TABS = ["attributes", "skills", "magic", "traits", "combat", "body", "gear", "description"] as const;
export type SheetTab = (typeof SHEET_TABS)[number];

/** The guided-build steps a module's type can be offered in. */
export const BUILDER_STEPS = ["advantages", "disadvantages", "skills", "spells", "gear"] as const;

export interface ItemTypeRegistration {
  module: string;
  /** The type as the module's manifest declares it: `<module>.<type>`. */
  type: string;
  /** The heading of its list. */
  label: string;
  tab: SheetTab;
  /** Extra columns for each row. */
  columns?: (item: any, actor: any) => Array<{ label: string; value: string | number }>;
  /** Buttons on each row. */
  actions?: Array<{ key: string; label: string; icon?: string; visible?: (item: any, actor: any) => boolean; run: (item: any, actor: any) => unknown }>;
  /** The guided-build step that offers it, if any. */
  builderStep?: (typeof BUILDER_STEPS)[number];
  /** The `system.*` fields the compendium picker should read for its columns, which it can't otherwise see. */
  indexFields?: string[];
  /** Whether the list is shown on this actor; a list with items in it always is. Defaults to always. */
  available?: (actor: any) => boolean;
  /** False when the module registers its own item sheet. Defaults to the system's generic sheet. */
  genericSheet?: boolean;
}

export interface AddonItemType {
  module: string;
  type: string;
  label: string;
  tab: SheetTab;
  columns: (item: any, actor: any) => Array<{ label: string; value: string | number }>;
  actions: NonNullable<ItemTypeRegistration["actions"]>;
  builderStep: (typeof BUILDER_STEPS)[number] | null;
  genericSheet: boolean;
  available: (actor: any) => boolean;
  indexFields: string[];
}

const itemTypes = new Map<string, AddonItemType>();

/** Registers how a module's item type appears. Returns the type, or null. */
export function registerItemType(registration: ItemTypeRegistration): string | null {
  const r = registration ?? ({} as ItemTypeRegistration);
  const what = `item type ${r.type}`;
  if (typeof r.module !== "string" || !IDENTIFIER.test(r.module)) return refuse(what, "the module id is missing or malformed");
  if (typeof r.type !== "string" || !r.type.startsWith(`${r.module}.`) || !IDENTIFIER.test(r.type.slice(r.module.length + 1))) {
    return refuse(what, `the type must be "${r.module}.<type>", as the module's manifest declares it`);
  }
  if (typeof r.label !== "string" || !r.label.trim()) return refuse(what, "it has no label");
  if (!SHEET_TABS.includes(r.tab)) return refuse(what, `tab must be one of ${SHEET_TABS.join(", ")}`);
  if (r.builderStep !== undefined && !BUILDER_STEPS.includes(r.builderStep)) return refuse(what, `builderStep must be one of ${BUILDER_STEPS.join(", ")}`);
  if (itemTypes.has(r.type)) return refuse(what, "that type is already registered");
  itemTypes.set(r.type, {
    module: r.module,
    type: r.type,
    label: r.label.trim(),
    tab: r.tab,
    columns: typeof r.columns === "function" ? r.columns : () => [],
    actions: (r.actions ?? []).filter((a) => typeof a?.key === "string" && typeof a?.run === "function"),
    builderStep: r.builderStep ?? null,
    genericSheet: r.genericSheet !== false,
    available: typeof r.available === "function" ? r.available : () => true,
    indexFields: (r.indexFields ?? []).filter((f) => typeof f === "string" && f.startsWith("system.")),
  });
  // The system's own item sheet is registered for the system's types alone,
  // so a module's type would have none: the generic sheet stands in unless the
  // module brings its own.
  if (r.genericSheet !== false) registerGenericSheet(r.type);
  return r.type;
}

export function registeredItemType(type: string): AddonItemType | undefined {
  return itemTypes.get(type);
}

/** The module types a guided-build step offers. */
export function builderTypesFor(step: string): string[] {
  return [...itemTypes.values()].filter((t) => t.builderStep === step).map((t) => t.type);
}

/** The lists a tab shows for a module's item types on this actor. */
export function itemSectionsFor(actor: any, tab: SheetTab): Array<{
  type: string;
  label: string;
  rows: Array<{ id: string; name: string; img: string; columns: Array<{ label: string; value: string | number }>; actions: Array<{ key: string; label: string; icon: string }> }>;
}> {
  const owned = (type: string) => [...(actor?.items ?? [])].some((item: any) => item?.type === type);
  return [...itemTypes.values()]
    .filter((t) => t.tab === tab && (owned(t.type) || safely(() => t.available(actor) === true, false)))
    .map((t) => ({
      type: t.type,
      label: t.label,
      rows: [...(actor?.items ?? [])]
        .filter((item: any) => item?.type === t.type)
        .map((item: any) => ({
          id: String(item.id),
          name: String(item.name ?? ""),
          img: String(item.img ?? ""),
          columns: safely(() => t.columns(item, actor), [] as Array<{ label: string; value: string | number }>),
          actions: t.actions
            .filter((a) => safely(() => (a.visible ? a.visible(item, actor) === true : true), false))
            .map((a) => ({ key: a.key, label: a.label, icon: a.icon ?? "fa-solid fa-play" })),
        })),
    }));
}

function safely<T>(run: () => T, fallback: T): T {
  try {
    return run();
  } catch (error) {
    console.warn("gworld | a module's item type callback failed", error);
    return fallback;
  }
}

/** The index fields the compendium picker reads for the module types it lists. */
export function pickerIndexFields(types: readonly string[]): string[] {
  return types.flatMap((type) => itemTypes.get(type)?.indexFields ?? []);
}

/**
 * A module item's columns as one line, for the compendium picker, or null for
 * a type no module registered.
 */
export function addonItemSummary(item: { type: string; name?: string; system?: unknown }): string | null {
  const registered = itemTypes.get(item.type);
  if (!registered) return null;
  return safely(() => registered.columns(item, null), [] as Array<{ label: string; value: string | number }>)
    .map((c) => `${c.label} ${c.value}`)
    .join(" · ");
}

/** Whether any module's item type has a list to show on this tab for this actor. */
export function tabHasAddonSections(actor: any, tab: SheetTab): boolean {
  return itemSectionsFor(actor, tab).length > 0;
}

/** Runs a module's row action. */
export async function runItemTypeAction(actor: any, itemId: string, key: string): Promise<void> {
  const item = actor?.items?.get?.(itemId);
  const action = item ? itemTypes.get(item.type)?.actions.find((a) => a.key === key) : undefined;
  if (!action) return;
  try {
    await action.run(item, actor);
  } catch (error) {
    console.warn(`gworld | item action ${key} failed`, error);
  }
}

let genericSheetRegistrar: ((type: string) => void) | null = null;
const pendingGenericSheets = new Set<string>();

/** Installed by the system at init, once the sheet class can be registered. */
export function setGenericSheetRegistrar(registrar: (type: string) => void): void {
  genericSheetRegistrar = registrar;
  for (const type of pendingGenericSheets) registrar(type);
  pendingGenericSheets.clear();
}

function registerGenericSheet(type: string): void {
  if (genericSheetRegistrar) genericSheetRegistrar(type);
  else pendingGenericSheets.add(type);
}

// ── price and weight ───────────────────────────────────────────────────────

export interface PriceModifierRegistration {
  module: string;
  key: string;
  /** Item types it applies to; all when left out. */
  types?: string[];
  /** Given the price so far, the new cost and weight. Return null to leave them. */
  apply: (item: any, price: { cost: number; weight: number }) => { cost?: number; weight?: number; label?: string } | null;
}

const priceModifiers: Array<Required<Omit<PriceModifierRegistration, "types">> & { types: string[] | null }> = [];

/** Registers a price and weight modifier. Returns its `<module>.<key>`, or null. */
export function registerPriceModifier(registration: PriceModifierRegistration): string | null {
  const r = registration ?? ({} as PriceModifierRegistration);
  const what = `price modifier ${r.module}.${r.key}`;
  if (typeof r.module !== "string" || !IDENTIFIER.test(r.module)) return refuse(what, "the module id is missing or malformed");
  if (typeof r.key !== "string" || !IDENTIFIER.test(r.key)) return refuse(what, "the key is missing or malformed");
  if (typeof r.apply !== "function") return refuse(what, "it has no apply function");
  if (priceModifiers.some((m) => m.module === r.module && m.key === r.key)) return refuse(what, "that key is already registered");
  priceModifiers.push({ module: r.module, key: r.key, types: Array.isArray(r.types) ? [...r.types] : null, apply: r.apply });
  return `${r.module}.${r.key}`;
}

/**
 * What an item costs and weighs once the modules' modifiers are applied to its
 * stored figures, in registration order. The stored figures never change, so
 * a modifier is never applied twice.
 */
export function effectivePrice(item: any): { cost: number; weight: number; lines: Array<{ label: string; cost: number; weight: number }> } {
  let cost = Number(item?.system?.cost) || 0;
  let weight = Number(item?.system?.weight) || 0;
  const lines: Array<{ label: string; cost: number; weight: number }> = [];
  for (const modifier of priceModifiers) {
    if (modifier.types && !modifier.types.includes(String(item?.type ?? ""))) continue;
    const result = safely(() => modifier.apply(item, { cost, weight }), null);
    if (!result) continue;
    const nextCost = typeof result.cost === "number" && Number.isFinite(result.cost) ? result.cost : cost;
    const nextWeight = typeof result.weight === "number" && Number.isFinite(result.weight) ? result.weight : weight;
    if (nextCost !== cost || nextWeight !== weight) {
      lines.push({ label: String(result.label ?? `${modifier.module}.${modifier.key}`), cost: nextCost - cost, weight: nextWeight - weight });
    }
    cost = nextCost;
    weight = nextWeight;
  }
  return { cost, weight, lines };
}

/** The price the item's document worked out when it was prepared, or its stored figures. */
function preparedPrice(item: any): { cost: number; weight: number } {
  const prepared = item?.effectivePrice;
  if (prepared && typeof prepared.cost === "number" && typeof prepared.weight === "number") return prepared;
  return { cost: Number(item?.system?.cost) || 0, weight: Number(item?.system?.weight) || 0 };
}

/** What an item costs, once modules have had their say. */
export function effectiveCost(item: any): number {
  return priceModifiers.length ? preparedPrice(item).cost : Number(item?.system?.cost) || 0;
}

/** What an item weighs, once modules have had their say. */
export function effectiveWeight(item: any): number {
  return priceModifiers.length ? preparedPrice(item).weight : Number(item?.system?.weight) || 0;
}

// ── technique kinds ────────────────────────────────────────────────────────

export interface TechniqueKindRegistration {
  module: string;
  key: string;
  label: string;
  /**
   * The technique's level for this character. `levelOf(name)` reads a skill's
   * level, and `standard()` is what the system would work out for it.
   */
  derive: (
    technique: any,
    actor: any,
    helpers: { levelOf: (skill: string) => number | null; standard: () => { level: number | null; levels: number; cappedByPrerequisite: boolean } | null },
  ) => { level: number | null; levels?: number; cappedByPrerequisite?: boolean; notes?: string[] } | null;
  /** What it costs in character points, where that isn't its `points` field. */
  cost?: (technique: any) => number | null;
}

interface TechniqueKind {
  key: string;
  module: string;
  label: string;
  derive: TechniqueKindRegistration["derive"];
  cost: (technique: any) => number | null;
}

const techniqueKinds = new Map<string, TechniqueKind>();

/** Registers a technique kind, stored in a technique's `system.kind`. Returns its `<module>.<key>`, or null. */
export function registerTechniqueKind(registration: TechniqueKindRegistration): string | null {
  const r = registration ?? ({} as TechniqueKindRegistration);
  const what = `technique kind ${r.module}.${r.key}`;
  if (typeof r.module !== "string" || !IDENTIFIER.test(r.module)) return refuse(what, "the module id is missing or malformed");
  if (typeof r.key !== "string" || !IDENTIFIER.test(r.key)) return refuse(what, "the key is missing or malformed");
  if (typeof r.label !== "string" || !r.label.trim()) return refuse(what, "it has no label");
  if (typeof r.derive !== "function") return refuse(what, "it has no derive function");
  const key = `${r.module}.${r.key}`;
  if (techniqueKinds.has(key)) return refuse(what, "that key is already registered");
  techniqueKinds.set(key, { key, module: r.module, label: r.label.trim(), derive: r.derive, cost: typeof r.cost === "function" ? r.cost : () => null });
  return key;
}

export function registeredTechniqueKind(key: string): TechniqueKind | undefined {
  return key ? techniqueKinds.get(key) : undefined;
}

/** The registered technique kinds, for the technique sheet's choice. */
export function registeredTechniqueKinds(): Array<{ key: string; label: string }> {
  return [...techniqueKinds.values()].map((k) => ({ key: k.key, label: k.label }));
}

/** Fires the derived-data hook for a document. */
export function afterPrepare(document: any): void {
  const hooks = (globalThis as { Hooks?: { callAll?: (event: string, ...args: unknown[]) => unknown } }).Hooks;
  try {
    hooks?.callAll?.(DATA_HOOKS.prepareDerivedData, document);
  } catch (error) {
    console.warn(`gworld | a ${DATA_HOOKS.prepareDerivedData} listener failed`, error);
  }
}

/** What the API exposes. */
export const dataApi = Object.freeze({
  registerDataExtension,
  getExtension,
  updateExtension,
  registerItemType,
  registerPriceModifier,
  effectivePrice,
  registerTechniqueKind,
  hooks: DATA_HOOKS,
});
