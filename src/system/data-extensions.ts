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

import { registerPoison } from "./poison-registry.js";
import { offeredExplosives, registerExplosive } from "./explosive-registry.js";
import { TAB_NAMES, type TabName } from "./sheet-tabs.js";


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
  /** Once every skill's level is known: `{ actor, skills, levelOf, attributes }`; set an entry's `level`, `fromDefault` and `note` (`attributes` since 1.58.0). */
  skillLevels: "gworld.skillLevels",
  /** Once Move is worked out (since 1.42.0): `{ actor, move, lines }`; push `{ label, multiplier?, value? }`. */
  moveModifiers: "gworld.moveModifiers",
  /** While a character's trait effects are gathered (since 1.47.0): `{ actor, effects, sources }`, both mutable. */
  traitEffects: "gworld.traitEffects",
  /** While a character's carried weight is added up (since 1.58.0): `{ actor, lines }`, each line's `weight`, `counts` and `reason` mutable. */
  carriedWeight: "gworld.carriedWeight",
  /** When a character's traits are gathered (since 1.61.0): `{ actor, traits }`, each entry's `inPlay` and `reason` mutable. */
  traitsInPlay: "gworld.traitsInPlay",
  /** Wherever a weapon's or shield's DR, HP and HT as an object are read (since 1.90.0): `{ item, actor, kind, dr, hp, ht, notes }`, `dr`, `hp`, `ht` and `notes` mutable. */
  objectStats: "gworld.objectStats",
  /** Wherever an item's Legality Class is read (since 1.95.0): `{ item, actor, lc }`, `lc` (0-4 or null) mutable. */
  legalityClass: "gworld.legalityClass",
});

/** A trait as `gworld.traitsInPlay` hands it to a listener. */
export interface TraitInPlay {
  item: any;
  name: string;
  inPlay: boolean;
  /** Why a listener took it out of play, for the sheet. */
  reason?: string;
  /**
   * Disadvantages the character suffers again while this trait is out of play
   * (since 1.63.0): a mitigated disadvantage returning, a lost sense an implant
   * made up for. Each is read into the trait effects as if the character had it.
   */
  restores?: RestoredTrait[];
}

/** A trait a listener puts back while another is out of play (since 1.63.0). */
export interface RestoredTrait {
  name: string;
  /** For the sheet: what it would cost. */
  points?: number;
  levels?: number;
}

/**
 * Asks the modules which of a character's traits are in play (since 1.61.0).
 *
 * A trait out of play is one the character has, and has paid for, whose
 * effects don't count right now. Returns the trait items still in play, and
 * the ones taken out with their reasons. A listener that throws changes
 * nothing: every trait stays in play.
 */
export function moduleTraitsInPlay(actor: any, items: readonly any[]): {
  inPlay: any[];
  outOfPlay: Array<{ name: string; reason: string; restores?: RestoredTrait[] }>;
  restored: RestoredTrait[];
} {
  const traits: TraitInPlay[] = items.map((item) => ({ item, name: String(item?.name ?? ""), inPlay: true }));
  const hooks = (globalThis as { Hooks?: { callAll?: (event: string, ...args: unknown[]) => unknown } }).Hooks;
  try {
    hooks?.callAll?.(DATA_HOOKS.traitsInPlay, { actor, traits });
  } catch (error) {
    console.warn(`gworld | a ${DATA_HOOKS.traitsInPlay} listener failed`, error);
    return { inPlay: [...items], outOfPlay: [], restored: [] };
  }
  const inPlay: any[] = [];
  const outOfPlay: Array<{ name: string; reason: string; restores?: RestoredTrait[] }> = [];
  const restored: RestoredTrait[] = [];
  traits.forEach((entry, i) => {
    if (entry?.inPlay === false) {
      const restores = (Array.isArray(entry.restores) ? entry.restores : [])
        .filter((r) => r && typeof r.name === "string" && r.name.trim())
        .map((r) => ({ name: r.name.trim(), ...(Number.isFinite(r.points) ? { points: Number(r.points) } : {}), ...(Number.isFinite(r.levels) ? { levels: Number(r.levels) } : {}) }));
      outOfPlay.push({ name: String(items[i]?.name ?? ""), reason: String(entry.reason ?? ""), ...(restores.length ? { restores } : {}) });
      restored.push(...restores);
    } else inPlay.push(items[i]);
  });
  return { inPlay, outOfPlay, restored };
}

/** One carried item's weight, as `gworld.carriedWeight` hands it to a listener. */
export interface CarriedWeightLine {
  item: any;
  label: string;
  /** Its effective weight times its quantity, in pounds. */
  weight: number;
  /** Whether it counts toward encumbrance at all. */
  counts: boolean;
  /** Why a listener left it out or lowered it, for the sheet. */
  reason?: string;
}

/** A line a listener left out or lowered: what it would have weighed, what counts, and why. */
export interface WeightNotCounted {
  label: string;
  weight: number;
  counted: number;
  reason: string;
}

/**
 * Asks the modules which carried weight counts toward encumbrance (since
 * 1.58.0), and adds up what does.
 *
 * A powered suit can carry its own weight, and a pack can hold its load
 * weightlessly; the items still weigh what they weigh, so the change is made
 * here rather than to the item. A listener sets a line's `counts` to false or
 * lowers its `weight`, with a `reason`. One that throws changes nothing, and a
 * weight can't be raised or made negative here.
 */
export function moduleCarriedWeight(actor: any, lines: CarriedWeightLine[]): { total: number; notCounted: WeightNotCounted[] } {
  const before = lines.map((line) => ({ ...line }));
  const context = { actor, lines };
  const hooks = (globalThis as { Hooks?: { callAll?: (event: string, ...args: unknown[]) => unknown } }).Hooks;
  let read = lines;
  try {
    hooks?.callAll?.(DATA_HOOKS.carriedWeight, context);
  } catch (error) {
    console.warn(`gworld | a ${DATA_HOOKS.carriedWeight} listener failed`, error);
    read = before;
  }
  let total = 0;
  const notCounted: WeightNotCounted[] = [];
  read.forEach((line, i) => {
    const original = before[i]?.weight ?? 0;
    const weight = Number(line?.weight);
    const counted = line?.counts === false ? 0 : Number.isFinite(weight) ? Math.max(0, Math.min(original, weight)) : original;
    total += counted;
    if (counted < original) notCounted.push({ label: String(line.label ?? ""), weight: original, counted, reason: String(line.reason ?? "") });
  });
  return { total, notCounted };
}

/** One thing added to a character's trait effects, and what added it. */
export interface TraitEffectSource {
  /** The effect changed, as its path in the effects: "sealed", "acute.vision". */
  effect: string;
  /** What changed it, shown in the sheet's breakdown: "Vacc Suit (TL 9)". */
  label: string;
  /** What it contributed, where the effect is a number. */
  value?: number;
}

/**
 * Asks the modules for their additions to a character's trait effects
 * (since 1.47.0).
 *
 * Worn gear grants what the Basic Set describes in trait terms -- a sealed
 * suit, Lifting ST, a sense the wearer does not have -- and neither
 * `attributeBonuses`, which reaches the four attributes, nor `moveModifiers`,
 * which reaches Move, can say so. A listener changes `effects` in place and
 * says in `sources` what did it, so the sheet's breakdowns can show the piece
 * of gear rather than an unexplained figure.
 *
 * The effects are handed over after the character's own traits and the
 * system's own worn gear have been read, so a listener sees what is already
 * there. One that throws changes nothing: the effects go back as they were.
 */
export function moduleTraitEffects<T>(actor: any, effects: T): { effects: T; sources: TraitEffectSource[] } {
  const before = structuredClone(effects);
  const context = { actor, effects, sources: [] as TraitEffectSource[] };
  const hooks = (globalThis as { Hooks?: { callAll?: (event: string, ...args: unknown[]) => unknown } }).Hooks;
  try {
    hooks?.callAll?.(DATA_HOOKS.traitEffects, context);
  } catch (error) {
    console.warn(`gworld | a ${DATA_HOOKS.traitEffects} listener failed`, error);
    return { effects: before, sources: [] };
  }
  const sources = (Array.isArray(context.sources) ? context.sources : []).filter(
    (s) => typeof s?.effect === "string" && typeof s?.label === "string",
  );
  return { effects: context.effects, sources };
}

/** A module's change to Move: a fraction of it, yards added or taken off, or both. */
export interface MoveLine {
  label: string;
  multiplier?: number;
  value?: number;
}

/** Move once the lines are applied: the multipliers' product times Move, rounded down, plus the values, never below 0. */
export function applyMoveLines(move: number, lines: readonly MoveLine[]): number {
  const factor = lines.reduce((product, line) => product * (Number.isFinite(line.multiplier) && Number(line.multiplier) >= 0 ? Number(line.multiplier) : 1), 1);
  const added = lines.reduce((sum, line) => sum + (Number.isFinite(line.value) ? Number(line.value) : 0), 0);
  return Math.max(0, Math.floor(Math.max(0, move) * factor + 1e-9) + added);
}

/** Asks the modules for their changes to a character's Move (since 1.42.0). A listener that throws changes nothing. */
export function moduleMove(actor: any, move: number): { move: number; lines: MoveLine[] } {
  const context = { actor, move, lines: [] as MoveLine[] };
  const hooks = (globalThis as { Hooks?: { callAll?: (event: string, ...args: unknown[]) => unknown } }).Hooks;
  try {
    hooks?.callAll?.(DATA_HOOKS.moveModifiers, context);
  } catch (error) {
    console.warn(`gworld | a ${DATA_HOOKS.moveModifiers} listener failed`, error);
    return { move, lines: [] };
  }
  const lines = (Array.isArray(context.lines) ? context.lines : []).filter((l) => typeof l?.label === "string" && (Number.isFinite(l.multiplier) || Number.isFinite(l.value)));
  return { move: lines.length ? applyMoveLines(move, lines) : move, lines };
}

/** A skill as `gworld.skillLevels` hands it to a listener. */
export interface SkillLevelEntry {
  item: any;
  name: string;
  level: number | null;
  fromDefault: boolean;
  /** Why a listener changed the level, shown with it. */
  note?: string;
  /** The module that changed it. */
  source?: string;
}

/**
 * Lets modules change skill levels once all of them are known: hold one to a
 * ceiling another skill sets, or give it the level it has at default. What a
 * listener changed is written to the skill's derived data, with its note as a
 * line in the level's breakdown. A listener that throws changes nothing.
 */
export function adjustSkillLevels(
  actor: any,
  items: any[],
  levelOf: (name: string) => number | null,
  /** The scores the skills were worked out from (since 1.58.0): the character's derived data isn't written yet. */
  attributes: Readonly<Record<string, number>> = {},
): void {
  const skills: SkillLevelEntry[] = items.map((item) => ({
    item,
    name: String(item?.name ?? ""),
    level: typeof item?.system?.derived?.level === "number" ? item.system.derived.level : null,
    fromDefault: Boolean(item?.system?.derived?.fromDefault),
  }));
  const before = skills.map((s) => ({ level: s.level, fromDefault: s.fromDefault }));
  const hooks = (globalThis as { Hooks?: { callAll?: (event: string, ...args: unknown[]) => unknown } }).Hooks;
  try {
    hooks?.callAll?.(DATA_HOOKS.skillLevels, { actor, skills, levelOf, attributes: { ...attributes } });
  } catch (error) {
    console.warn(`gworld | a ${DATA_HOOKS.skillLevels} listener failed`, error);
    return;
  }
  skills.forEach((entry, index) => {
    const was = before[index]!;
    const level = entry.level === null ? null : Number.isFinite(entry.level) ? Math.floor(entry.level) : was.level;
    const fromDefault = Boolean(entry.fromDefault);
    if (level === was.level && fromDefault === was.fromDefault) return;
    const derived = entry.item?.system?.derived;
    if (!derived) return;
    derived.level = level;
    derived.fromDefault = fromDefault;
    if (typeof entry.note === "string" && entry.note.trim()) {
      derived.bonusLines = [
        ...(Array.isArray(derived.bonusLines) ? derived.bonusLines : []),
        { label: entry.note.trim(), value: (level ?? 0) - (was.level ?? 0), source: String(entry.source ?? "module") },
      ];
    }
  });
}

/** A bonus line: what it is, what it is worth, and why it was changed if it was. */
export interface BonusLine {
  /** For the system's own lines, what the line is: `bonus`, `magic`, `talent`, `trait`, `tools`, and `techLevel` for the tools' TL (since 1.75.0). */
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
        // A copy, at both levels: what came in may be an object other documents
        // hold too, and writing a module's data into it would give it to them.
        const cleaned = { ...super._cleanType(data, options, state) };
        for (const extension of extensionsFor(this.gworldDocument, this.gworldType)) {
          const current = cleaned[extension.module];
          if (current === undefined && options.partial) continue;
          const value = current && typeof current === "object" ? { ...current } : {};
          // The stored data goes down with it, as a SchemaField hands each of
          // its own fields: without a source, Foundry fills in every field a
          // partial change leaves out, resetting what the update never touched.
          cleaned[extension.module] = extension.field.clean(
            value,
            { ...options, partial: Boolean(options.partial) && current !== undefined },
            { ...state, source: state?.source?.[extension.module] },
          );
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
  // A new object for each document. A literal here would be one object shared by
  // every document created without extension data, so a change to one would
  // show on all of them.
  const field = new ExtensionsFieldClass({ required: true, nullable: false, initial: () => ({}) });
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

/**
 * Where on the character sheet a module's item type is listed: one of its
 * tabs, or a classic tab's name it folds in (see sheet-tabs.ts).
 */
export const SHEET_TABS = TAB_NAMES;
export type SheetTab = TabName;

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

/**
 * The lists a tab shows for a module's item types on this actor. A part that
 * gathers several registration names passes them all, and gets the lists in
 * that order.
 */
export function itemSectionsFor(actor: any, tab: SheetTab | readonly SheetTab[]): Array<{
  type: string;
  label: string;
  rows: Array<{ id: string; name: string; img: string; columns: Array<{ label: string; value: string | number }>; actions: Array<{ key: string; label: string; icon: string }> }>;
}> {
  const owned = (type: string) => [...(actor?.items ?? [])].some((item: any) => item?.type === type);
  const tabs: readonly SheetTab[] = typeof tab === "string" ? [tab] : tab;
  return tabs
    .flatMap((name) => [...itemTypes.values()].filter((t) => t.tab === name))
    .filter((t) => owned(t.type) || safely(() => t.available(actor) === true, false))
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
export function tabHasAddonSections(actor: any, tab: SheetTab | readonly SheetTab[]): boolean {
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
  /** Whether it is in play right now (since 1.26.0), e.g. "my switch is on". */
  available?: () => boolean;
}

interface TechniqueKind {
  key: string;
  module: string;
  label: string;
  derive: TechniqueKindRegistration["derive"];
  cost: (technique: any) => number | null;
  available: () => boolean;
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
  techniqueKinds.set(key, {
    key,
    module: r.module,
    label: r.label.trim(),
    derive: r.derive,
    cost: typeof r.cost === "function" ? r.cost : () => null,
    available: typeof r.available === "function" ? r.available : () => true,
  });
  return key;
}

/** Whether a registered kind is in play; a check that throws counts as not. */
function kindAvailable(kind: TechniqueKind): boolean {
  try {
    return kind.available() !== false;
  } catch (error) {
    console.warn(`gworld | technique kind ${kind.key} failed its availability check`, error);
    return false;
  }
}

/** A registered technique kind that is in play, or undefined. */
export function registeredTechniqueKind(key: string): TechniqueKind | undefined {
  const kind = key ? techniqueKinds.get(key) : undefined;
  return kind && kindAvailable(kind) ? kind : undefined;
}

/** A registered technique kind whose check says it is out of play right now (since 1.26.0), or undefined. */
export function unavailableTechniqueKind(key: string): TechniqueKind | undefined {
  const kind = key ? techniqueKinds.get(key) : undefined;
  return kind && !kindAvailable(kind) ? kind : undefined;
}

/** The technique kinds in play, for the technique sheet's choice. */
export function registeredTechniqueKinds(): Array<{ key: string; label: string }> {
  return [...techniqueKinds.values()].filter(kindAvailable).map((k) => ({ key: k.key, label: k.label }));
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
  registerPoison,
  // Explosives for the Relative Explosive Force Table, and the table as offered (since 1.74.0).
  registerExplosive,
  explosives: offeredExplosives,
  registerDataExtension,
  getExtension,
  updateExtension,
  registerItemType,
  registerPriceModifier,
  effectivePrice,
  registerTechniqueKind,
  hooks: DATA_HOOKS,
});
