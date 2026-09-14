/**
 * The page where the GM chooses which rules the table is playing.
 *
 * One page rather than thirty entries in Foundry's settings list: the choice is
 * "how much GURPS are we doing tonight", which is one decision made in one
 * sitting, not thirty unrelated ones.
 */

import { SYSTEM_ID } from "../constants.js";
import {
  OPTIONAL_RULES,
  OPTIONAL_RULES_KEY,
  RULE_GROUPS,
  defaultRuleState,
  isImplemented,
  mergeStoredRules,
  ruleState,
} from "../optional-rules.js";
import { ruleReferencePages } from "../rule-references.js";
import { registeredRuleGroups, registeredRules } from "../rule-registry.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class RulesSettings extends HandlebarsApplicationMixin(ApplicationV2) {
  static override DEFAULT_OPTIONS = {
    id: "gworld-rules-settings",
    classes: ["gworld", "gworld-rules"],
    position: { width: 560, height: 640 },
    window: { title: "GWORLD.Rules.Title", resizable: true },
    actions: {
      save: RulesSettings.#onSave,
      allOn: RulesSettings.#onAllOn,
      allOff: RulesSettings.#onAllOff,
      restore: RulesSettings.#onRestore,
      openReference: RulesSettings.#onOpenReference,
    },
  };

  static override PARTS = {
    body: {
      template: `systems/${SYSTEM_ID}/templates/apps/rules-settings.hbs`,
      scrollable: [".gr-body"],
    },
  };

  /**
   * What the switches currently read, which is not what is saved until Save is
   * pressed. Held here so the toggles survive a re-render.
   */
  #pending: Record<string, boolean> | null = null;

  #state(): Record<string, boolean> {
    return this.#pending ?? ruleState();
  }

  override async _prepareContext(): Promise<Record<string, unknown>> {
    const state = this.#state();
    // A content module's page for a rule, where one is installed (the book's
    // own text, which the system cannot ship).
    const references = await ruleReferencePages();

    const systemGroups = RULE_GROUPS.map((group) => ({
      id: group.id,
      label: group.label,
      source: null,
      rules: OPTIONAL_RULES[group.id].map((rule) => ({
        key: rule.key,
        label: `GWORLD.Rules.Rule.${rule.key}.Name`,
        hint: `GWORLD.Rules.Rule.${rule.key}.Hint`,
        reference: rule.reference,
        referenceUuid: references.get(rule.key) ?? null,
        // A rule nothing reads yet is shown greyed rather than hidden: the
        // page is a map of the ruleset, and a gap in it is worth seeing.
        pending: rule.implemented === false,
        enabled: rule.implemented !== false && (state[rule.key] ?? rule.default),
      })),
    }));

    // Modules' groups come after the system's, each saying which module it
    // is from, so nobody mistakes an add-on's rule for part of the Basic Set.
    const moduleGroups = registeredRuleGroups()
      .map((group) => ({
        id: group.id,
        label: group.label,
        source: game.modules?.get(group.module)?.title ?? group.module,
        rules: registeredRules(group.id).map((rule) => ({
          key: rule.key,
          label: rule.name,
          hint: rule.hint,
          reference: rule.reference,
          referenceUuid: references.get(rule.key) ?? null,
          pending: !rule.implemented,
          enabled: rule.implemented && (state[rule.key] ?? rule.default),
        })),
      }))
      .filter((group) => group.rules.length > 0);

    return {
      groups: [...systemGroups, ...moduleGroups],
      // Unsaved changes are worth saying out loud on a page whose whole point
      // is that nothing happens until you press the button.
      dirty: this.#pending !== null,
    };
  }

  override async _onRender(context: object, options: object): Promise<void> {
    await super._onRender(context, options);

    for (const box of this.element.querySelectorAll<HTMLInputElement>("input[data-rule]")) {
      box.addEventListener("change", () => {
        const key = box.dataset.rule;
        if (!key) return;
        this.#pending = { ...this.#state(), [key]: box.checked };
        void this.render();
      });
    }
  }

  static async #onSave(this: RulesSettings): Promise<void> {
    const stored = game.settings.get(SYSTEM_ID, OPTIONAL_RULES_KEY) as Record<string, unknown> | null;
    await game.settings.set(SYSTEM_ID, OPTIONAL_RULES_KEY, mergeStoredRules(stored, this.#state()));
    this.#pending = null;
    ui.notifications?.info(game.i18n.localize("GWORLD.Rules.Saved"));
    await this.close();

    // Sheets show or hide controls by these, so what is open needs redrawing.
    for (const app of Object.values((ui as any).windows ?? {})) {
      (app as any)?.render?.(false);
    }
  }

  static async #onAllOn(this: RulesSettings): Promise<void> {
    await this.#setAll(true);
  }

  static async #onAllOff(this: RulesSettings): Promise<void> {
    await this.#setAll(false);
  }

  async #setAll(value: boolean): Promise<void> {
    const state = this.#state();
    this.#pending = Object.fromEntries(
      Object.keys(state).map((key) => [key, isImplemented(key) ? value : false]),
    );
    await this.render();
  }

  /** Opens a rule's reference page from the content module that provides it. */
  static async #onOpenReference(this: RulesSettings, _event: Event, target: HTMLElement): Promise<void> {
    const uuid = target.dataset.uuid;
    if (!uuid) return;
    const entry = await fromUuid(uuid);
    entry?.sheet?.render(true);
  }

  static async #onRestore(this: RulesSettings): Promise<void> {
    this.#pending = defaultRuleState();
    await this.render();
  }
}
