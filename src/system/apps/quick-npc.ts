/**
 * An NPC in a hurry, for the GM (GURPS Basic Set: Campaigns p. 502).
 *
 * "You do not need complete character sheets for these characters; all you
 * need are notes on their important statistics." This window is those notes,
 * laid out the way the NPC Record Card (p. 569) is: a name and a line of
 * appearance, the four attributes, the traits that matter, the skills written
 * as levels, and whatever the NPC carries. Pressing Create makes the NPC
 * actor from them, priced by the sheet's own rules, so it can be edited on
 * the ordinary sheet afterwards.
 *
 * It starts from a template when one fits -- the system's generic NPCs, the
 * book's own character templates, or any a module ships -- and takes the
 * book's two shortcuts for the trivial NPC: a skill nobody wrote down is
 * "roll 3d and use the result", and the attributes themselves can be rolled
 * on the spot (Revised p. 502).
 *
 * The sketch lives in the window until Create. Nothing exists in the world
 * before then, so closing the window costs nothing but the sketch.
 */

import { SYSTEM_ID } from "../constants.js";
import { collectEntries, type PickerEntry } from "./compendium-picker.js";
import { sourceCollections } from "../compendium-sources.js";
import { templateFromItem } from "../character-templates.js";
import { addQuickNpcButton, createQuickNpc, setQuickNpcOpener } from "../quick-npc.js";
import { rememberFocus, restoreFocus, type RememberedFocus } from "../focus-memory.js";
import {
  emptySketch,
  levelOnSheet,
  rolledAttributes,
  sketchAttributeScore,
  sketchAttributes,
  sketchPoints,
  sketchSecondary,
  skillItemData,
  trivialSkillLevel,
  type NpcSketch,
  type SketchAttributeKey,
  type SketchGear,
  type SketchTrait,
} from "../../rules/quick-npc.js";
import { relativeLevelForPoints } from "../../rules/skills.js";
import { entriesInGroup, requiredEntries, type Template, type TemplateEntry } from "../../rules/templates.js";
import type { Difficulty } from "../../rules/types.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const K = "GWORLD.QuickNpc";
const L = (key: string, data?: Record<string, unknown>) =>
  data ? game.i18n.format(`${K}.${key}`, data) : game.i18n.localize(`${K}.${key}`);

const ATTRIBUTES = ["ST", "DX", "IQ", "HT"] as const;
const SECONDARY = ["hp", "will", "per", "fp", "basicSpeed", "basicMove"] as const;
const SKILL_ATTRIBUTES: ReadonlySet<string> = new Set(["ST", "DX", "IQ", "HT", "Will", "Per"]);
const DIFFICULTIES: ReadonlySet<string> = new Set(["E", "A", "H", "VH", "W"]);
/** How many matches the add box shows: enough to pick from, few enough to scan. */
const SEARCH_LIMIT = 12;

/** A template on the shelf, enough to list it. */
interface TemplateChoice {
  uuid: string;
  name: string;
  kind: string;
  source: string;
}

/** What the window adds things from: the shelf, read once each. */
type Shelf = "skill" | "trait" | "gear";

/** The three dice of a 3d roll, from Foundry's dice so the roll is a real one. */
async function roll3d(): Promise<number[]> {
  const roll = new Roll("3d6");
  await roll.evaluate();
  const dice: number[] = (roll as any).dice?.[0]?.results?.map((r: { result: number }) => r.result) ?? [];
  return dice.length === 3 ? dice : [Number(roll.total) || 10];
}

export class QuickNpc extends HandlebarsApplicationMixin(ApplicationV2) {
  static override DEFAULT_OPTIONS = {
    id: "gworld-quick-npc",
    classes: ["gworld", "v2", "gworld-quick-npc"],
    position: { width: 720, height: 760 },
    window: { title: `${K}.Title`, resizable: true, icon: "fa-solid fa-user-clock" },
    actions: {
      applyTemplate: QuickNpc.#onApplyTemplate,
      rollAttributes: QuickNpc.#onRollAttributes,
      oneNumber: QuickNpc.#onOneNumber,
      rollOneNumber: QuickNpc.#onRollOneNumber,
      shelf: QuickNpc.#onShelf,
      add: QuickNpc.#onAdd,
      remove: QuickNpc.#onRemove,
      rollSkill: QuickNpc.#onRollSkill,
      clear: QuickNpc.#onClear,
      create: QuickNpc.#onCreate,
    },
  };

  static override PARTS = {
    body: {
      template: `systems/${SYSTEM_ID}/templates/apps/quick-npc.hbs`,
      scrollable: [".qn-body"],
    },
  };

  #sketch: NpcSketch = emptySketch();
  /** The templates the sketch was built from, named on the actor's notes. */
  #from: string[] = [];
  #templateUuid = "";
  #templates: TemplateChoice[] | null = null;
  #shelves: Partial<Record<Shelf, PickerEntry[]>> = {};
  #loading: Partial<Record<Shelf | "templates", Promise<void>>> = {};
  #shelf: Shelf = "skill";
  #search = "";
  #folder = "";
  #placeToken = false;
  /** The one score a trivial NPC is written with, shown in its box. */
  #oneNumber = 10;
  #busy = false;
  #focusMemory: RememberedFocus | null = null;

  /** Opens the window for the GM; anyone else is told it is the GM's. */
  static async open(): Promise<QuickNpc | null> {
    if (!game.user?.isGM) {
      ui.notifications?.warn(L("GmOnly"));
      return null;
    }
    const existing = (foundry.applications as any).instances?.get?.(QuickNpc.DEFAULT_OPTIONS.id);
    if (existing instanceof QuickNpc) {
      await existing.render(true);
      (existing as any).bringToFront?.();
      return existing;
    }
    const app = new QuickNpc();
    await app.render(true);
    return app;
  }

  /** The sketch as it stands, for a module or a macro that wants to read it. */
  get sketch(): NpcSketch {
    return foundry.utils.deepClone(this.#sketch);
  }

  // ── reading the shelves ───────────────────────────────────────────────

  #loadTemplates(): void {
    if (this.#templates || this.#loading.templates) return;
    this.#loading.templates = readTemplates()
      .then((templates) => {
        this.#templates = templates;
      })
      .catch((error: unknown) => {
        console.warn("gworld | the templates could not be read", error);
        this.#templates = [];
      })
      .finally(() => {
        delete this.#loading.templates;
        void this.render();
      });
  }

  #loadShelf(shelf: Shelf): void {
    if (this.#shelves[shelf] || this.#loading[shelf]) return;
    const types = shelf === "skill" ? ["skill"] : shelf === "trait" ? ["trait"] : ["equipment", "armor", "shield"];
    this.#loading[shelf] = collectEntries(types)
      .then((entries) => {
        this.#shelves[shelf] = entries.sort((a, b) => a.name.localeCompare(b.name));
      })
      .catch((error: unknown) => {
        console.warn("gworld | the compendia could not be read", error);
        this.#shelves[shelf] = [];
      })
      .finally(() => {
        delete this.#loading[shelf];
        void this.render();
      });
  }

  #matches(): PickerEntry[] {
    const entries = this.#shelves[this.#shelf];
    if (!entries) return [];
    const text = this.#search.trim().toLowerCase();
    if (!text) return [];
    const starts = entries.filter((entry) => entry.search.startsWith(text));
    const within = entries.filter((entry) => !entry.search.startsWith(text) && entry.search.includes(text));
    return [...starts, ...within].slice(0, SEARCH_LIMIT);
  }

  // ── the window ────────────────────────────────────────────────────────

  override async _prepareContext(): Promise<object> {
    this.#loadTemplates();
    this.#loadShelf(this.#shelf);
    const sketch = this.#sketch;
    const derived = sketchSecondary(sketch);
    const totals = sketchAttributes(sketch);
    const sources = new Set((this.#templates ?? []).map((t) => t.source));
    const templates = (this.#templates ?? []).map((t) => ({
      ...t,
      label:
        (sources.size > 1 ? `${t.name} (${t.source})` : t.name) +
        (t.kind === "character" ? "" : ` \u2014 ${game.i18n.localize(`${K}.Kind.${t.kind}`)}`),
      selected: t.uuid === this.#templateUuid,
    }));
    const folders = ((game as any).folders ?? [])
      .filter((folder: any) => folder.type === "Actor")
      .map((folder: any) => ({ id: String(folder.id), name: String(folder.name), selected: String(folder.id) === this.#folder }))
      .sort((a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name));
    const shelfLoaded = Boolean(this.#shelves[this.#shelf]);
    return {
      sketch,
      from: this.#from.join(", "),
      attributes: ATTRIBUTES.map((key) => ({
        key,
        value: sketch.attributes[key],
        granted: sketch.racial[key],
        total: totals[key],
      })),
      secondary: SECONDARY.map((key) => ({
        key,
        label: `${K}.Secondary.${key}`,
        bought: sketch.secondary[key],
        granted: sketch.bonuses[key],
        total: key === "basicSpeed" ? derived.basicSpeed.toFixed(2) : String(derived[key]),
        step: key === "basicSpeed" ? 0.25 : 1,
      })),
      sm: sketch.sm,
      oneNumber: this.#oneNumber,
      dodge: Math.floor(derived.basicSpeed) + 3,
      points: sketchPoints(sketch),
      skills: sketch.skills.map((skill, index) => ({
        index,
        name: skill.name,
        basis: `${skill.attribute}/${skill.difficulty}`,
        level: skill.level,
        onSheet: levelOnSheet(skill, sketch),
        differs: levelOnSheet(skill, sketch) !== skill.level,
        points: skillItemData(skill, sketch).system.points,
      })),
      traits: sketch.traits.map((trait, index) => ({ index, name: trait.name, points: trait.points, levels: trait.levels ?? 0 })),
      gear: sketch.gear.map((item, index) => ({ index, name: item.name })),
      templates,
      templatesLoading: !this.#templates,
      hasTemplate: Boolean(this.#templateUuid),
      shelves: (["skill", "trait", "gear"] as const).map((shelf) => ({ shelf, label: `${K}.Shelf.${shelf}`, active: shelf === this.#shelf })),
      shelf: this.#shelf,
      search: this.#search,
      shelfLoading: !shelfLoaded,
      matches: this.#matches(),
      nothingFound: shelfLoaded && this.#search.trim() !== "" && this.#matches().length === 0,
      folders,
      canPlace: Boolean((globalThis as any).canvas?.scene),
      placeToken: this.#placeToken,
      busy: this.#busy,
      canCreate: !this.#busy && sketch.name.trim() !== "",
    };
  }

  override async _onRender(context: object, options: object): Promise<void> {
    await super._onRender(context, options);

    restoreFocus(this.element, this.#focusMemory, { active: document.activeElement, body: document.body });
    this.#focusMemory = null;

    for (const input of this.element.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-field]")) {
      input.addEventListener("change", () => this.#onField(input));
    }
    const search = this.element.querySelector<HTMLInputElement>("input[data-search]");
    search?.addEventListener("input", () => {
      this.#search = search.value;
      this.#redraw();
    });
    search?.addEventListener("keydown", (event) => {
      // Enter takes the first match, which is what typing a name and pressing
      // Enter means.
      if (event.key !== "Enter") return;
      event.preventDefault();
      const first = this.#matches()[0];
      if (first) void this.#add(first);
    });
  }

  /** Redraws, keeping the caret where it was in the field being typed in. */
  #redraw(): void {
    this.#focusMemory = rememberFocus(this.element, document.activeElement);
    void this.render();
  }

  #onField(input: HTMLInputElement | HTMLSelectElement): void {
    const field = input.dataset.field ?? "";
    const sketch = this.#sketch;
    const number = () => {
      const value = Number(input.value);
      return Number.isFinite(value) ? value : 0;
    };
    if (field === "name") sketch.name = input.value.trim();
    else if (field === "appearance") sketch.appearance = input.value.trim();
    else if (field === "tactics") sketch.tactics = input.value.trim();
    else if (field === "groupSize") sketch.groupSize = Math.max(1, Math.floor(number()) || 1);
    else if (field === "cannonFodder") sketch.cannonFodder = (input as HTMLInputElement).checked;
    else if (field === "folder") this.#folder = input.value;
    else if (field === "placeToken") this.#placeToken = (input as HTMLInputElement).checked;
    else if (field === "template") this.#templateUuid = input.value;
    else if (field === "sm") sketch.sm = Math.floor(number());
    else if (field.startsWith("attribute.")) {
      const key = field.slice("attribute.".length) as (typeof ATTRIBUTES)[number];
      if (ATTRIBUTES.includes(key)) sketch.attributes[key] = Math.max(1, Math.floor(number()) || 10);
    } else if (field.startsWith("secondary.")) {
      const key = field.slice("secondary.".length) as (typeof SECONDARY)[number];
      if (SECONDARY.includes(key)) sketch.secondary[key] = key === "basicSpeed" ? Math.round(number() * 4) / 4 : Math.floor(number());
    } else if (field.startsWith("skill.")) {
      const skill = sketch.skills[Number(field.slice("skill.".length))];
      if (skill) skill.level = Math.max(1, Math.floor(number()) || 1);
    } else if (field.startsWith("trait.")) {
      const trait = sketch.traits[Number(field.slice("trait.".length))];
      if (trait) trait.points = Math.round(number());
    } else return;
    this.#redraw();
  }

  // ── the actions ───────────────────────────────────────────────────────

  static async #onApplyTemplate(this: QuickNpc): Promise<void> {
    const uuid = this.#templateUuid;
    if (!uuid) return;
    let item: any = null;
    try {
      item = await fromUuid(uuid);
    } catch {
      item = null;
    }
    const template = templateFromItem(item);
    if (!template) {
      ui.notifications?.warn(L("TemplateGone"));
      return;
    }
    const added = await this.#applyTemplate(template, uuid);
    this.#from.push(template.name);
    ui.notifications?.info(L("TemplateApplied", { name: template.name, count: added.count, skipped: added.skipped }));
    this.#redraw();
  }

  /**
   * Writes a template onto the sketch. A character template's attributes are
   * scores, so they replace what is there; a lens's are modifiers to what was
   * bought, so they add; a racial template's are granted rather than bought
   * (Characters p. 261), so they go on the card as granted levels and a Size
   * Modifier, with the racial cost recorded against them. Its entries are
   * added either way, the choices made for it: the first of each count, and
   * the cheapest that meet a point requirement. The GM is about to look at
   * the list and can change any of it, which is quicker than being asked.
   */
  async #applyTemplate(template: Template, uuid: string): Promise<{ count: number; skipped: number }> {
    const sketch = this.#sketch;
    if (template.kind === "character") {
      for (const key of ATTRIBUTES) sketch.attributes[key] = Number(template.attributes[key] ?? sketch.attributes[key]) || 10;
      for (const key of SECONDARY) sketch.secondary[key] = Number(template.secondary[key] ?? 0) || 0;
    } else if (template.kind === "racial" || template.kind === "metaTrait") {
      const granted = { ST: 0, DX: 0, IQ: 0, HT: 0, hp: 0, will: 0, per: 0, fp: 0, basicSpeed: 0, basicMove: 0, sm: 0 };
      for (const key of ATTRIBUTES) {
        granted[key] = Number(template.attributes[key] ?? 0) || 0;
        sketch.racial[key] += granted[key];
      }
      for (const key of SECONDARY) {
        granted[key] = Number(template.secondary[key] ?? 0) || 0;
        sketch.bonuses[key] += granted[key];
      }
      granted.sm = Number(template.sizeModifier ?? 0) || 0;
      sketch.sm += granted.sm;
      sketch.racialTemplates.push({
        name: template.name,
        uuid,
        ...(template.reference ? { reference: template.reference } : {}),
        attributeCost: Number(template.attributeCost) || 0,
        granted,
      });
    } else {
      for (const key of ATTRIBUTES) sketch.attributes[key] += Number(template.attributes[key] ?? 0) || 0;
      for (const key of SECONDARY) sketch.secondary[key] += Number(template.secondary[key] ?? 0) || 0;
    }

    const entries = [...requiredEntries(template)];
    for (const group of template.choices) {
      const options = entriesInGroup(template, group.id);
      if (group.kind === "count") {
        entries.push(...options.slice(0, Math.max(0, group.required)));
      } else {
        let spent = 0;
        const sign = group.required < 0 ? -1 : 1;
        for (const option of [...options].sort((a, b) => sign * (a.points - b.points))) {
          if (sign * spent >= sign * group.required) break;
          entries.push(option);
          spent += option.points;
        }
      }
    }

    let count = 0;
    let skipped = 0;
    for (const entry of entries) {
      if (await this.#addEntry(entry)) count += 1;
      else skipped += 1;
    }
    return { count, skipped };
  }

  /** One template entry onto the sketch, by its compendium entry where it has one, else by name. */
  async #addEntry(entry: TemplateEntry): Promise<boolean> {
    if (entry.itemType === "skill") {
      const found = await this.#resolve(entry, "skill");
      const attribute = String(found?.system?.attribute ?? "");
      const difficulty = String(found?.system?.difficulty ?? "");
      if (!SKILL_ATTRIBUTES.has(attribute) || !DIFFICULTIES.has(difficulty)) return false;
      const score = sketchAttributeScore(this.#sketch, attribute as SketchAttributeKey);
      // The template says what the skill costs; the card wants the level that buys.
      const level = levelForPoints(entry.points, score, difficulty as Difficulty);
      this.#sketch.skills.push({
        name: entry.name,
        ...(found?.uuid ? { uuid: found.uuid } : {}),
        attribute: attribute as SketchAttributeKey,
        difficulty: difficulty as Difficulty,
        level,
      });
      return true;
    }
    if (entry.itemType === "trait") {
      const found = await this.#resolve(entry, "trait");
      this.#sketch.traits.push({
        name: entry.name,
        ...(found?.uuid ? { uuid: found.uuid } : {}),
        points: entry.points,
        ...(entry.levels ? { levels: entry.levels } : {}),
      });
      return true;
    }
    if (entry.itemType === "equipment") {
      const found = await this.#resolve(entry, "gear");
      if (!found?.uuid) return false;
      this.#sketch.gear.push({ name: found.name, uuid: found.uuid });
      return true;
    }
    // Techniques and languages want a sheet to live on; the card has no line for them.
    return false;
  }

  /** The shelf entry a template entry means: its uuid, or the first of that name. */
  async #resolve(entry: TemplateEntry, shelf: Shelf): Promise<{ uuid: string; name: string; system: Record<string, any> } | null> {
    if (entry.uuid) {
      try {
        const document: any = await fromUuid(entry.uuid);
        if (document) return { uuid: String(document.uuid), name: String(document.name), system: document.system ?? {} };
      } catch {
        // A uuid that resolves to nothing is a compendium that moved; the name may still find it.
      }
    }
    if (!this.#shelves[shelf]) {
      this.#loadShelf(shelf);
      await this.#loading[shelf];
    }
    const wanted = entry.name.toLowerCase();
    const bare = wanted.replace(/\s*\(.*\)\s*$/, "");
    const entries = this.#shelves[shelf] ?? [];
    const hit =
      entries.find((e) => e.search === wanted) ??
      entries.find((e) => e.search.replace(/\/tl/g, "") === wanted) ??
      entries.find((e) => e.search === bare) ??
      entries.find((e) => e.search.replace(/\/tl/g, "") === bare);
    return hit ? { uuid: hit.uuid, name: hit.name, system: hit.system } : null;
  }

  /**
   * "Some trivial characters require no planning at all" (p. 502): one score
   * for all four attributes, so every roll the NPC ever makes is against it
   * or defaults from it.
   */
  #writeOneNumber(score: number): void {
    const value = Math.max(1, Math.floor(score) || 10);
    this.#oneNumber = value;
    this.#sketch.attributes = { ST: value, DX: value, IQ: value, HT: value };
    this.#redraw();
  }

  static #onOneNumber(this: QuickNpc): void {
    const input = this.element.querySelector<HTMLInputElement>("input[data-one-number]");
    this.#writeOneNumber(Number(input?.value));
  }

  /** The one score rolled, 3d (Revised p. 502). */
  static async #onRollOneNumber(this: QuickNpc): Promise<void> {
    this.#writeOneNumber(trivialSkillLevel(await roll3d()));
  }

  static async #onRollAttributes(this: QuickNpc): Promise<void> {
    const rolls: number[] = [];
    for (let i = 0; i < ATTRIBUTES.length; i += 1) rolls.push(trivialSkillLevel(await roll3d()));
    this.#sketch.attributes = rolledAttributes(() => rolls.shift() ?? 10);
    this.#redraw();
  }

  static #onShelf(this: QuickNpc, _event: Event, target: HTMLElement): void {
    const shelf = target.dataset.shelf as Shelf | undefined;
    if (!shelf || shelf === this.#shelf) return;
    this.#shelf = shelf;
    this.#search = "";
    void this.render();
  }

  static async #onAdd(this: QuickNpc, _event: Event, target: HTMLElement): Promise<void> {
    const entry = this.#matches().find((e) => e.uuid === target.dataset.uuid);
    if (entry) await this.#add(entry);
  }

  /** Puts a shelf entry on the card: a skill at its attribute, a trait at its listed cost, gear as it is. */
  async #add(entry: PickerEntry): Promise<void> {
    const sketch = this.#sketch;
    if (entry.type === "skill") {
      const attribute = String(entry.system?.attribute ?? "DX");
      const difficulty = String(entry.system?.difficulty ?? "A");
      if (!SKILL_ATTRIBUTES.has(attribute) || !DIFFICULTIES.has(difficulty)) return;
      const key = attribute as SketchAttributeKey;
      sketch.skills.push({ name: entry.name, uuid: entry.uuid, attribute: key, difficulty: difficulty as Difficulty, level: sketchAttributeScore(sketch, key) });
    } else if (entry.type === "trait") {
      const perLevel = Number(entry.system?.pointsPerLevel) || 0;
      const table: number[] = Array.isArray(entry.system?.costTable) ? entry.system.costTable : [];
      const points = Number(entry.system?.points) || (table.length ? Number(table[0]) || 0 : perLevel);
      const trait: SketchTrait = { name: entry.name, uuid: entry.uuid, points };
      if (perLevel || table.length) trait.levels = 1;
      sketch.traits.push(trait);
    } else {
      const item: SketchGear = { name: entry.name, uuid: entry.uuid };
      sketch.gear.push(item);
    }
    this.#search = "";
    this.#redraw();
  }

  static #onRemove(this: QuickNpc, _event: Event, target: HTMLElement): void {
    const list = target.dataset.list;
    const index = Number(target.dataset.index);
    const sketch = this.#sketch;
    if (list === "skill") sketch.skills.splice(index, 1);
    else if (list === "trait") sketch.traits.splice(index, 1);
    else if (list === "gear") sketch.gear.splice(index, 1);
    else return;
    this.#redraw();
  }

  /** "Just roll 3d and use the result" (p. 502), for one skill on the card. */
  static async #onRollSkill(this: QuickNpc, _event: Event, target: HTMLElement): Promise<void> {
    const skill = this.#sketch.skills[Number(target.dataset.index)];
    if (!skill) return;
    skill.level = trivialSkillLevel(await roll3d());
    this.#redraw();
  }

  static #onClear(this: QuickNpc): void {
    this.#sketch = emptySketch();
    this.#from = [];
    this.#search = "";
    void this.render();
  }

  static async #onCreate(this: QuickNpc): Promise<void> {
    if (this.#busy) return;
    const sketch = this.#sketch;
    if (!sketch.name.trim()) {
      ui.notifications?.warn(L("NeedsName"));
      return;
    }
    this.#busy = true;
    void this.render();
    try {
      const actor = await createQuickNpc(sketch, {
        folder: this.#folder || null,
        from: this.#from,
        placeToken: this.#placeToken,
      });
      if (!actor) return;
      ui.notifications?.info(L("Created", { name: String(actor.name) }));
      await this.close();
      await actor.sheet?.render(true);
    } catch (error) {
      console.error("gworld | the quick NPC could not be created", error);
      ui.notifications?.error(L("Failed"));
    } finally {
      this.#busy = false;
      if ((this as any).rendered) void this.render();
    }
  }
}

/** The level a template's points buy, off the attribute: what the card writes for it. */
function levelForPoints(points: number, score: number, difficulty: Difficulty): number {
  const relative = relativeLevelForPoints(Math.max(1, points), difficulty);
  return score + (relative ?? 0);
}

/** Every character template, lens and racial template on the chosen shelves, by name. */
async function readTemplates(): Promise<TemplateChoice[]> {
  const sources = sourceCollections();
  const found: TemplateChoice[] = [];
  for (const pack of (game as any).packs ?? []) {
    if (pack?.documentName !== "Item") continue;
    if (!sources.has(String(pack.collection))) continue;
    const index = await pack.getIndex({ fields: ["system.kind"] });
    for (const entry of index) {
      if (entry.type !== "template") continue;
      const kind = String(entry.system?.kind ?? "");
      if (kind !== "character" && kind !== "lens" && kind !== "racial") continue;
      found.push({
        uuid: `Compendium.${pack.collection}.Item.${entry._id}`,
        name: String(entry.name),
        kind,
        source: String(pack.title ?? pack.metadata?.label ?? pack.collection ?? ""),
      });
    }
  }
  return found.sort((a, b) => a.source.localeCompare(b.source) || a.name.localeCompare(b.name));
}

export function registerQuickNpc(): void {
  setQuickNpcOpener(() => QuickNpc.open());
  Hooks.on("renderActorDirectory", (_app: unknown, html: HTMLElement) => addQuickNpcButton(html));
}
