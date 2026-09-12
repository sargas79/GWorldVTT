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
import { CompendiumPicker } from "./compendium-picker.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** The attributes, in the order the book prices them. */
const ATTRIBUTES = ["ST", "DX", "IQ", "HT"] as const;

interface Step {
  id: string;
  /** Item types this step's Browse button offers, if it offers one. */
  types?: string[];
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
 * there is to spend.
 */
const STEPS: readonly Step[] = [
  { id: "points" },
  { id: "attributes" },
  { id: "advantages", types: ["trait"], categories: ["advantage", "perk"] },
  { id: "disadvantages", types: ["trait"], categories: ["disadvantage", "quirk"] },
  { id: "skills", types: ["skill", "technique"] },
  { id: "gear", types: ["equipment", "armor", "shield"] },
  { id: "review" },
];

/** The document hooks that mean this actor may have changed. */
const WATCHED_HOOKS = ["updateActor", "createItem", "updateItem", "deleteItem"] as const;

export class CharacterBuilder extends HandlebarsApplicationMixin(ApplicationV2) {
  static override DEFAULT_OPTIONS = {
    classes: ["gworld", "gworld-builder"],
    position: { width: 520, height: 620 },
    window: { title: "GWORLD.Builder.Title", resizable: true },
    actions: {
      back: CharacterBuilder.#onBack,
      next: CharacterBuilder.#onNext,
      browse: CharacterBuilder.#onBrowse,
      deleteItem: CharacterBuilder.#onDeleteItem,
      finish: CharacterBuilder.#onFinish,
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
  }> {
    if (!step.types) return [];
    const types = new Set(step.types);

    return [...(this.#actor.items ?? [])]
      .filter((item: any) => {
        if (!types.has(item.type)) return false;
        if (!step.categories) return true;
        return step.categories.includes(item.system?.category);
      })
      .map((item: any) => {
        const spend = spendableOn(item);
        return {
          id: item.id,
          name: item.name,
          detail: detailFor(item),
          field: spend?.field ?? "",
          value: spend?.value ?? 0,
          unit: spend?.unit ?? "",
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
        row("GWORLD.Points.Languages", points.languages, count((item) => item.type === "language")),
      ].filter((entry) => entry.value !== 0 || (entry.items ?? 0) > 0),
      spent: points.spent ?? 0,
      available: points.available ?? 0,
      unspent: points.unspent ?? points.remaining ?? 0,
      over: Boolean(points.overBudget),
      gear: count((item) => ["equipment", "armor", "shield"].includes(item.type)),
    };
  }

  override async _prepareContext(): Promise<Record<string, unknown>> {
    const step = this.#current;
    const derived = this.#actor.system?.derived ?? {};
    const points = derived.points ?? {};
    const system = this.#actor.system ?? {};

    return {
      actor: this.#actor,
      system,
      stepId: step.id,
      stepNumber: this.#step + 1,
      stepCount: STEPS.length,
      isFirst: this.#step === 0,
      isLast: this.#step === STEPS.length - 1,
      isReview: step.id === "review",
      hasBrowse: Boolean(step.types),
      browseTypes: (step.types ?? []).join(","),
      items: this.#itemsForStep(step),

      attributes: ATTRIBUTES.map((key) => ({
        key,
        value: system.attributes?.[key] ?? 10,
      })),

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
        attributes: points.attributes ?? 0,
        advantages: points.advantages ?? 0,
        disadvantages: points.disadvantages ?? 0,
        skills: points.skills ?? 0,
        disadvantageTotal: points.disadvantageTotal ?? 0,
        disadvantageLimit: points.disadvantageLimit ?? 0,
      },
      overBudget: points.overBudget ?? false,
      overDisadvantageLimit: (points.disadvantageTotal ?? 0) > (points.disadvantageLimit ?? 0),
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

  override async _onRender(context: object, options: object): Promise<void> {
    await super._onRender(context, options);

    // The number fields write straight through to the actor. There is no
    // submit button because there is nothing to submit: this edits the sheet.
    // The redraw comes from the update hook, as it does for every other change.
    for (const input of this.element.querySelectorAll<HTMLInputElement>("input[data-item-field]")) {
      input.addEventListener("change", (event) => {
        void CharacterBuilder.#onSpend.call(this, event, input);
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

  static async #onNext(this: CharacterBuilder): Promise<void> {
    this.#step = Math.min(STEPS.length - 1, this.#step + 1);
    await this.render();
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
        title: game.i18n.localize(`GWORLD.Builder.Browse.${step.id}`),
      });
    } finally {
      if (button?.isConnected) {
        button.disabled = false;
        button.innerHTML = label;
      }
    }
  }

  /** Writes a points or levels change straight through to the item. */
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

    const value = Math.round(Number((target as HTMLInputElement).value));
    if (!Number.isFinite(value)) {
      await this.render();
      return;
    }
    await item.update({ [field]: Math.max(0, value) });
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

  if (item.type === "skill" || item.type === "technique") {
    return { field: "system.points", value: Number(system.points ?? 0), unit: "pts" };
  }

  if (item.type === "trait") {
    const table: number[] = system.costTable ?? [];
    if (!system.pointsPerLevel && table.length === 0) return null;
    return { field: "system.levels", value: Number(system.levels ?? 0), unit: "levels" };
  }

  return null;
}

/** The one figure worth showing beside a chosen item's name. */
function detailFor(item: any): string {
  const system = item.system ?? {};
  switch (item.type) {
    case "trait":
      return `${system.totalPoints ?? 0} pts`;
    case "skill":
    case "technique": {
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
