/**
 * A guided walk through building a character, for people who would rather be
 * asked than go looking.
 *
 * It is a second way in, not a replacement: everything it does can be done on
 * the sheet directly, and the sheet stays the thing you use afterwards. What it
 * adds is an order to do it in and the points ledger kept in view at every
 * step, which is the part that is easy to lose track of across six tabs.
 *
 * It edits the actor as it goes rather than staging changes and applying them
 * at the end. Going back a step therefore shows what is really there, and
 * closing half-way leaves a half-built character rather than losing the work.
 *
 * It also watches the actor: anything that changes them while it is open --
 * the picker adding a skill, the sheet stepping a trait -- redraws the step
 * and the ledger at once, so what it shows is never a screen behind.
 */

import { SYSTEM_ID } from "../constants.js";
import { partyOf } from "../party.js";
import { rememberFocus, restoreFocus, type RememberedFocus } from "../focus-memory.js";
import { CompendiumPicker } from "./compendium-picker.js";
import { clampedLevels, steppedLevels } from "../advancement.js";
import { builderTypesFor } from "../data-extensions.js";
import { customKindKey, levelCeiling, namePlaceholderKey, namedByPlayer, type PickerCustom } from "../picker-merge.js";
import { lacksSpecialty, traitLevelName } from "../../rules/traits.js";
import {
  applyTemplateToActor,
  confirmAndRemoveTemplate,
  templateFromItem,
} from "../character-templates.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** The attributes, in the order the book prices them. */
const ATTRIBUTES = ["ST", "DX", "IQ", "HT"] as const;

interface Step {
  id: string;
  /** Item types this step's Browse button offers, if it offers one. */
  types?: string[];
  /** What the picker makes when the list doesn't have what is wanted. */
  custom?: PickerCustom;
  /**
   * The trait categories this step lists and offers. Advantages and
   * disadvantages are the same item type, so a step that does not say which it
   * wants gets both, which is no use to anyone choosing.
   */
  categories?: string[];
}

/**
 * The order to build in: what you can afford, then what you are, then what you
 * have. Disadvantages come before skills because what they pay for is what
 * there is to spend, and a template comes before all of it because it is a
 * shortcut through the lot.
 */
const STEPS: readonly Step[] = [
  { id: "points" },
  // Templates come before attributes because that is the order they are used
  // in: "first, buy the template... do this instead of buying individual
  // attributes, secondary characteristics, advantages, disadvantages, skills"
  // (Characters p. 258). Skipping the step is the ordinary case.
  { id: "templates" },
  { id: "attributes" },
  // What the picker makes when the list doesn't have what is wanted: a perk
  // or a quirk in the player's own words, a skill or a piece of gear of the
  // player's own. The sheet's Add buttons offer the same.
  { id: "advantages", types: ["trait"], categories: ["advantage", "perk"], custom: { itemType: "trait", category: "perk" } },
  { id: "disadvantages", types: ["trait"], categories: ["disadvantage", "quirk"], custom: { itemType: "trait", category: "quirk" } },
  { id: "skills", types: ["skill", "technique"], custom: { itemType: "skill" } },
  { id: "spells", types: ["spell"] },
  { id: "gear", types: ["equipment", "armor", "shield"], custom: { itemType: "equipment" } },
  { id: "review" },
];

/**
 * The template chooser, shared with the character sheet.
 *
 * Imported where it is used rather than at the top of the file: the sheet
 * imports this application, so a static import back would be a cycle in the
 * source. The bundler inlines this one, so it costs nothing at runtime.
 */
async function chooseAndApply(actor: any): Promise<boolean> {
  const sheet = await import("../sheets/character-sheet.js");
  const chosen = await sheet.pickTemplateItem();
  if (!chosen) return false;

  const template = templateFromItem(chosen);
  if (!template) return false;

  const picks = await sheet.chooseTemplateOptions(template);
  if (picks === null) return false;

  await applyTemplateToActor({ actor, template, uuid: chosen.uuid ?? "", picks });
  return true;
}

/** The document hooks that mean this actor may have changed. */
const WATCHED_HOOKS = ["updateActor", "createItem", "updateItem", "deleteItem"] as const;

export class CharacterBuilder extends HandlebarsApplicationMixin(ApplicationV2) {
  static override DEFAULT_OPTIONS = {
    // "v2" gives it the character sheet's look: its tokens, panels and buttons.
    classes: ["gworld", "v2", "gworld-builder"],
    position: { width: 760, height: 720 },
    window: { title: "GWORLD.Builder.Title", resizable: true },
    actions: {
      back: CharacterBuilder.#onBack,
      goto: CharacterBuilder.#onGoto,
      next: CharacterBuilder.#onNext,
      browse: CharacterBuilder.#onBrowse,
      deleteItem: CharacterBuilder.#onDeleteItem,
      stepLevels: CharacterBuilder.#onStepLevels,
      finish: CharacterBuilder.#onFinish,
      applyTemplate: CharacterBuilder.#onApplyTemplate,
      removeTemplate: CharacterBuilder.#onRemoveTemplate,
      openParty: CharacterBuilder.#onOpenParty,
    },
  };

  static override PARTS = {
    body: {
      template: `systems/${SYSTEM_ID}/templates/apps/character-builder.hbs`,
      scrollable: [".gb-body"],
    },
  };

  #actor: any;
  #step = 0;
  /** The hook ids registered for this window, so they can be taken down with it. */
  #hooks: Array<[string, number]> = [];

  constructor(options: { actor: any }) {
    super({});
    this.#actor = options.actor;
  }

  static async open(actor: any): Promise<CharacterBuilder> {
    const app = new CharacterBuilder({ actor });
    await app.render(true);
    return app;
  }

  get #current(): Step {
    return STEPS[Math.min(this.#step, STEPS.length - 1)]!;
  }

  /**
   * The items this step is about, so it can list what has been chosen -- and
   * what can be spent on each.
   *
   * A skill takes points and a levelled trait takes levels. Adding something
   * and not being able to say how much of it you have is only half of choosing
   * it, which is what sent people to each item's own sheet.
   */
  #itemsForStep(step: Step): Array<{
    id: string;
    name: string;
    detail: string;
    field: string;
    value: number;
    unit: string;
    /** A levelled trait steps a level at a time, between the book's limits. */
    stepper: boolean;
    atFloor: boolean;
    atCeiling: boolean;
    /** The book's name for the level held, where it names them. */
    levelName: string;
    /** A quirk, a perk or a custom trait: the name is the player's to write. */
    nameEditable: boolean;
    namePlaceholder: string;
    /** A trait the book makes the player specify, and what they have said. */
    needsSpecialty: boolean;
    specialty: string;
    incomplete: boolean;
  }> {
    if (!step.types) return [];
    const types = new Set(step.types);
    // Item types add-on modules offer at this step, which have no category.
    const addonTypes = new Set(builderTypesFor(step.id));

    return [...(this.#actor.items ?? [])]
      .filter((item: any) => {
        if (addonTypes.has(item.type)) return true;
        if (!types.has(item.type)) return false;
        if (!step.categories) return true;
        return step.categories.includes(item.system?.category);
      })
      .map((item: any) => {
        const spend = spendableOn(item);
        const stepper = spend?.unit === "levels";
        const levels = spend?.value ?? 0;
        const ceiling = stepper ? levelCeiling(item) : null;
        return {
          id: item.id,
          name: item.name,
          detail: detailFor(item),
          field: spend?.field ?? "",
          value: levels,
          unit: spend?.unit ?? "",
          stepper,
          atFloor: stepper && levels <= 0,
          atCeiling: stepper && ceiling !== null && levels >= ceiling,
          levelName: stepper ? traitLevelName(item.system?.levelNames ?? [], levels) ?? "" : "",
          nameEditable: namedByPlayer(item),
          namePlaceholder: namedByPlayer(item) ? game.i18n.localize(namePlaceholderKey(item.system?.category)) : "",
          needsSpecialty: Boolean(item.system?.needsSpecialty),
          specialty: String(item.system?.specialty ?? ""),
          incomplete: lacksSpecialty(item.system ?? {}),
        };
      });
  }

  /**
   * The review: one row per category, with how many of each were chosen and
   * what they came to, and the total set apart.
   *
   * The header ledger is hidden on this step, because the total is the point
   * of the page and saying it twice on one screen made both harder to find.
   */
  #review() {
    const points = this.#actor.system?.derived?.points ?? {};
    const items: any[] = [...(this.#actor.items ?? [])];
    const count = (predicate: (item: any) => boolean) => items.filter(predicate).length;
    const traits = (category: string) =>
      count((item) => item.type === "trait" && item.system?.category === category);

    const row = (label: string, value: number, items: number | null, negative = false) => ({
      label,
      value: value ?? 0,
      items,
      negative,
    });

    return {
      rows: [
        row("GWORLD.Points.Attributes", points.attributes, null),
        row("GWORLD.Points.Secondaries", points.secondaries, null),
        row("GWORLD.Points.Advantages", points.advantages, traits("advantage") + traits("perk")),
        row("GWORLD.Points.Disadvantages", points.disadvantages, traits("disadvantage"), true),
        row("GWORLD.Points.Quirks", points.quirks, traits("quirk"), true),
        row("GWORLD.Points.Skills", points.skills, count((item) => item.type === "skill")),
        row("GWORLD.Points.Techniques", points.techniques, count((item) => item.type === "technique")),
        row("GWORLD.Points.Spells", points.spells, count((item) => item.type === "spell")),
        row("GWORLD.Points.Languages", points.languages, count((item) => item.type === "language")),
      ].filter((entry) => entry.value !== 0 || (entry.items ?? 0) > 0),
      spent: points.spent ?? 0,
      available: points.available ?? 0,
      unspent: points.unspent ?? points.remaining ?? 0,
      over: Boolean(points.overBudget),
      gear: count((item) => ["equipment", "armor", "shield"].includes(item.type)),
      // What is still named by default -- three "New quirk" rows say nothing
      // about the character. Flagged, not refused: the sheet edits all of it.
      unnamed: items.filter((item) => stillDefaultNamed(item)).map((item) => item.name),
      // A Phobia with nothing feared is not a Phobia yet.
      unspecified: items.filter((item) => item.type === "trait" && lacksSpecialty(item.system ?? {})).map((item) => item.name),
    };
  }

  /** Opens the party whose terms the first step reads. */
  static async #onOpenParty(this: CharacterBuilder) {
    await partyOf(this.#actor)?.sheet?.render(true);
  }

  override async _prepareContext(): Promise<Record<string, unknown>> {
    const step = this.#current;
    const derived = this.#actor.system?.derived ?? {};
    const points = derived.points ?? {};
    const system = this.#actor.system ?? {};

    return {
      actor: this.#actor,
      system,
      // Fields carry ids built from this, so focus survives the redraw that
      // follows every change to the actor.
      appId: this.id,
      stepId: step.id,
      stepNumber: this.#step + 1,
      stepCount: STEPS.length,
      isFirst: this.#step === 0,
      isLast: this.#step === STEPS.length - 1,
      isReview: step.id === "review",
      steps: STEPS.map((s, index) => ({
        id: s.id,
        index,
        number: index + 1,
        active: index === this.#step,
        done: index < this.#step,
      })),
      hasBrowse: Boolean(step.types),
      browseTypes: [...(step.types ?? []), ...(step.types ? builderTypesFor(step.id) : [])].join(","),
      items: this.#itemsForStep(step),

      attributes: ATTRIBUTES.map((key) => ({
        key,
        value: system.attributes?.[key] ?? 10,
      })),

      // What this character has already been built from, so the step shows
      // progress rather than offering the same button twice.
      templates: (this.#actor.system?.derived?.templates ?? []).map(
        (applied: { name: string; kind: string; attributeCost: number; itemIds?: string[]; reference?: string }, index: number) => ({
          ...applied,
          index,
          kindLabel: `GWORLD.Template.${applied.kind}`,
          granted: (applied.itemIds ?? []).length,
        }),
      ),

      // The ledger rides along on every step. Losing track of it across six
      // tabs is the thing this whole application exists to prevent.
      points: {
        spent: points.spent ?? 0,
        starting: points.starting ?? 0,
        // Everything they have to spend, which is the starting points plus
        // whatever the campaign has awarded since.
        available: points.available ?? points.starting ?? 0,
        earned: points.earned ?? 0,
        remaining: points.remaining ?? 0,
        // As the sheet's header reads it: points to spend, all spent, or over.
        state: points.overBudget ? "over" : (points.remaining ?? 0) > 0 ? "ready" : "spent",
        overBy: Math.max(0, (points.spent ?? 0) - (points.available ?? points.starting ?? 0)),
        attributes: points.attributes ?? 0,
        advantages: points.advantages ?? 0,
        disadvantages: points.disadvantages ?? 0,
        skills: points.skills ?? 0,
        disadvantageTotal: points.disadvantageTotal ?? 0,
        disadvantageLimit: points.disadvantageLimit ?? 0,
      },
      overBudget: points.overBudget ?? false,
      overDisadvantageLimit: (points.disadvantageTotal ?? 0) > (points.disadvantageLimit ?? 0),
      // Which of the campaign's terms the party has set, and so cannot be typed here.
      campaign: derived.campaign ?? { party: null, locked: {} },
      review: step.id === "review" ? this.#review() : null,
    };
  }

  /**
   * Watches the actor from the moment the window opens.
   *
   * The picker writes straight to the actor, and so does the sheet if it is
   * open beside this; neither used to tell the builder, which went on showing
   * the list and the ledger as they were when the step was drawn.
   */
  override async _onFirstRender(context: object, options: object): Promise<void> {
    await super._onFirstRender(context, options);

    const mine = (document: any) =>
      document === this.#actor || document?.parent === this.#actor;

    for (const hook of WATCHED_HOOKS) {
      const id = Hooks.on(hook, (document: any) => {
        if (mine(document)) void this.render();
      });
      this.#hooks.push([hook, id]);
    }
  }

  override async _onClose(options: object): Promise<void> {
    for (const [hook, id] of this.#hooks) Hooks.off(hook, id);
    this.#hooks = [];
    await super._onClose(options);
  }

  /** Where the focus was when this render started; see focus-memory. */
  #focusMemory: RememberedFocus | null = null;

  override async _preRender(context: object, options: object): Promise<void> {
    await super._preRender(context, options);
    // The attribute fields write straight through to the actor, and the actor
    // update redraws this window -- taking the focus with it unless it is put
    // back. On `Tab` the browser has already moved to the next field, which is
    // the one to land on.
    this.#focusMemory = rememberFocus(this.element, document.activeElement);
  }

  override async _onRender(context: object, options: object): Promise<void> {
    await super._onRender(context, options);

    restoreFocus(this.element, this.#focusMemory, {
      active: document.activeElement,
      body: document.body,
    });
    this.#focusMemory = null;

    // The number fields write straight through to the actor. There is no
    // submit button because there is nothing to submit: this edits the sheet.
    // The redraw comes from the update hook, as it does for every other change.
    for (const input of this.element.querySelectorAll<HTMLInputElement>("input[data-item-field]")) {
      input.addEventListener("change", (event) => {
        void CharacterBuilder.#onSpend.call(this, event, input);
      });
    }

    // A quirk's or a perk's name is written in the row. Blank is not a name,
    // so an emptied field is put back to what the item is called.
    for (const input of this.element.querySelectorAll<HTMLInputElement>("input[data-item-name]")) {
      input.addEventListener("change", () => {
        const item = this.#actor.items?.get(input.dataset.itemName ?? "");
        if (!item) return;
        const name = input.value.trim();
        if (!name || name === item.name) {
          void this.render();
          return;
        }
        void item.update({ name });
      });
    }

    // What a trait is of: the behaviour, the group, the weapon. Blank is
    // allowed, and leaves the row marked as still to be said.
    for (const input of this.element.querySelectorAll<HTMLInputElement>("input[data-item-specialty]")) {
      input.addEventListener("change", () => {
        const item = this.#actor.items?.get(input.dataset.itemSpecialty ?? "");
        if (!item) return;
        const specialty = input.value.trim();
        if (specialty === String(item.system?.specialty ?? "")) return;
        void item.update({ "system.specialty": specialty });
      });
    }

    for (const input of this.element.querySelectorAll<HTMLInputElement>("input[data-path]")) {
      input.addEventListener("change", () => {
        const path = input.dataset.path;
        if (!path) return;
        const value = Number(input.value);
        if (!Number.isFinite(value)) return;
        void this.#actor.update({ [path]: value });
      });
    }
  }

  static async #onBack(this: CharacterBuilder): Promise<void> {
    this.#step = Math.max(0, this.#step - 1);
    await this.render();
  }

  /** Jumps to a step: the steps are an order to build in, not a gate. */
  static async #onGoto(this: CharacterBuilder, _event: Event, target: HTMLElement): Promise<void> {
    const index = Number(target.dataset.step);
    if (!Number.isInteger(index)) return;
    this.#step = Math.min(STEPS.length - 1, Math.max(0, index));
    await this.render();
  }

  static async #onNext(this: CharacterBuilder): Promise<void> {
    this.#step = Math.min(STEPS.length - 1, this.#step + 1);
    await this.render();
  }

  /** Takes a template, which is what this step is for (Characters p. 258). */
  static async #onApplyTemplate(this: CharacterBuilder) {
    if (await chooseAndApply(this.#actor)) this.render();
  }

  /**
   * Takes one off again, with what it added. The actor hooks redraw this
   * window as the removal lands; the render here is for the case where
   * nothing on the actor changed but the list should still say so.
   */
  static async #onRemoveTemplate(this: CharacterBuilder, _event: Event, target: HTMLElement) {
    const index = Number(target.dataset.index);
    if (!Number.isInteger(index)) return;
    if (await confirmAndRemoveTemplate(this.#actor, index)) this.render();
  }

  static async #onFinish(this: CharacterBuilder): Promise<void> {
    await this.close();
    await this.#actor.sheet?.render(true);
  }

  /**
   * Opens the picker for this step.
   *
   * The button says it is busy until the window is up. The picker itself
   * opens at once and reads the compendia afterwards, so the wait is short
   * now -- but a control that does nothing visible for even a moment invites
   * a second press, and a second picker.
   */
  static async #onBrowse(this: CharacterBuilder, _event: Event, target: HTMLElement): Promise<void> {
    const step = this.#current;
    if (!step.types) return;

    const button = target.closest<HTMLButtonElement>("button") ?? null;
    const label = button?.innerHTML ?? "";
    if (button) {
      button.disabled = true;
      button.textContent = game.i18n.localize("GWORLD.Builder.Opening");
    }

    try {
      await CompendiumPicker.open({
        actor: this.#actor,
        types: step.types,
        ...(step.categories ? { categories: step.categories } : {}),
        ...(step.custom ? { custom: step.custom } : {}),
        title: game.i18n.localize(`GWORLD.Builder.Browse.${step.id}`),
        // A character being written up buys their gear out of starting
        // wealth, which the sheet reads as the Gear figure. Buying it out of
        // the cash as well would charge for it twice, so the builder's list
        // only adds (Characters pp. 25-27).
        shopping: false,
      });
    } finally {
      if (button?.isConnected) {
        button.disabled = false;
        button.innerHTML = label;
      }
    }
  }

  /**
   * Writes a points or levels change straight through to the item.
   *
   * Levels stop where the book stops, whether they arrive from the buttons or
   * the box: a figure typed past the cap is brought back to it, and one that
   * is not a number is put back to what the trait holds.
   */
  static async #onSpend(
    this: CharacterBuilder,
    _event: Event,
    target: HTMLElement,
  ): Promise<void> {
    const id = target.dataset.itemId;
    const field = target.dataset.itemField;
    if (!id || !field) return;

    const item = this.#actor.items?.get(id);
    if (!item) return;

    const typed = (target as HTMLInputElement).value;
    if (field === "system.levels") {
      const next = clampedLevels(item, typed);
      if (next === Number(item.system?.levels ?? 0)) {
        await this.render();
        return;
      }
      await item.update({ [field]: next });
      return;
    }

    // Number("") is 0: an emptied box is put back, not written as nothing.
    const value = Math.round(Number(typed));
    if (String(typed).trim() === "" || !Number.isFinite(value)) {
      await this.render();
      return;
    }
    await item.update({ [field]: Math.max(0, value) });
  }

  /** Moves a levelled trait one level up or down, stopping where the book stops. */
  static async #onStepLevels(
    this: CharacterBuilder,
    _event: Event,
    target: HTMLElement,
  ): Promise<void> {
    const id = target.closest<HTMLElement>("[data-item-id]")?.dataset.itemId;
    if (!id) return;
    const item = this.#actor.items?.get(id);
    if (!item) return;

    const next = steppedLevels(item, target.dataset.step === "down" ? "down" : "up");
    if (next === Number(item.system?.levels ?? 0)) return;
    await item.update({ "system.levels": next });
  }

  static async #onDeleteItem(
    this: CharacterBuilder,
    _event: Event,
    target: HTMLElement,
  ): Promise<void> {
    const id = target.dataset.itemId;
    if (!id) return;
    await this.#actor.deleteEmbeddedDocuments("Item", [id]);
  }
}

/**
 * What can be spent on an item, if anything.
 *
 * Skills and techniques take character points. A trait takes levels, but only
 * if it is priced per level or from a table -- a flat 15-point advantage has
 * nothing to buy.
 */
function spendableOn(item: any): { field: string; value: number; unit: string } | null {
  const system = item.system ?? {};

  if (item.type === "skill" || item.type === "technique" || item.type === "spell") {
    return { field: "system.points", value: Number(system.points ?? 0), unit: "pts" };
  }

  if (item.type === "trait") {
    const table: number[] = system.costTable ?? [];
    if (!system.pointsPerLevel && table.length === 0) return null;
    return { field: "system.levels", value: Number(system.levels ?? 0), unit: "levels" };
  }

  return null;
}

/**
 * Whether a player-named trait still carries the name it was made with --
 * "New quirk" -- or none at all.
 */
function stillDefaultNamed(item: any): boolean {
  if (!namedByPlayer(item)) return false;
  const name = String(item.name ?? "").trim();
  if (!name) return true;
  const custom: PickerCustom = { itemType: "trait", category: String(item.system?.category ?? "") };
  const kind = game.i18n.localize(customKindKey(custom)).toLowerCase();
  return name === game.i18n.format("GWORLD.Picker.NewCustom", { kind });
}

/** The one figure worth showing beside a chosen item's name. */
function detailFor(item: any): string {
  const system = item.system ?? {};
  switch (item.type) {
    case "trait":
      return `${system.totalPoints ?? 0} pts`;
    case "skill":
    case "technique":
    case "spell": {
      // The points are in the field beside this; what is worth showing is what
      // they bought, which is the whole reason for spending them.
      const level = system.derived?.level;
      return level === null || level === undefined ? "—" : `level ${level}`;
    }
    case "armor":
      return `DR ${system.dr ?? 0}`;
    case "shield":
      return `DB ${system.db ?? 0}`;
    default:
      return `${system.weight ?? 0} lb`;
  }
}
