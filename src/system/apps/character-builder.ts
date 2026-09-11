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
  /** The trait category this step lists, for the two trait steps. */
  category?: string;
}

/**
 * The order to build in: what you can afford, then what you are, then what you
 * have. Disadvantages come before skills because what they pay for is what
 * there is to spend.
 */
const STEPS: readonly Step[] = [
  { id: "points" },
  { id: "attributes" },
  { id: "advantages", types: ["trait"], category: "advantage" },
  { id: "disadvantages", types: ["trait"], category: "disadvantage" },
  { id: "skills", types: ["skill", "technique"] },
  { id: "gear", types: ["equipment", "armor", "shield"] },
  { id: "review" },
];

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
        if (!step.category) return true;
        return item.system?.category === step.category;
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
        remaining: points.remaining ?? 0,
        attributes: points.attributes ?? 0,
        advantages: points.advantages ?? 0,
        disadvantages: points.disadvantages ?? 0,
        skills: points.skills ?? 0,
        disadvantageTotal: points.disadvantageTotal ?? 0,
        disadvantageLimit: points.disadvantageLimit ?? 0,
      },
      overBudget: (points.spent ?? 0) > (points.starting ?? 0),
      overDisadvantageLimit: (points.disadvantageTotal ?? 0) > (points.disadvantageLimit ?? 0),
    };
  }

  override async _onRender(context: object, options: object): Promise<void> {
    await super._onRender(context, options);

    // The number fields write straight through to the actor. There is no
    // submit button because there is nothing to submit: this edits the sheet.
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
        void this.#actor.update({ [path]: value }).then(() => this.render());
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

  static async #onBrowse(this: CharacterBuilder): Promise<void> {
    const step = this.#current;
    if (!step.types) return;

    const picker = await CompendiumPicker.open({
      actor: this.#actor,
      types: step.types,
      title: game.i18n.localize(`GWORLD.Builder.Browse.${step.id}`),
    });

    // The picker adds straight to the actor, so this step's list is stale the
    // moment anything is picked. Re-rendering when it closes catches up.
    const close = picker.close.bind(picker);
    picker.close = async (closeOptions?: object) => {
      const result = await close(closeOptions);
      await this.render();
      return result;
    };
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
    await this.render();
  }

  static async #onDeleteItem(
    this: CharacterBuilder,
    _event: Event,
    target: HTMLElement,
  ): Promise<void> {
    const id = target.dataset.itemId;
    if (!id) return;
    await this.#actor.deleteEmbeddedDocuments("Item", [id]);
    await this.render();
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
