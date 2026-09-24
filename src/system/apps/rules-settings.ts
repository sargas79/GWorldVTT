/**
 * The page where the GM chooses which rules the table is playing.
 *
 * One page rather than thirty entries in Foundry's settings list: the choice is
 * "how much GURPS are we doing tonight", which is one decision made in one
 * sitting, not thirty unrelated ones.
 *
 * A player opens the same page read-only: the switches change what their
 * sheet shows -- Modifying Dice + Adds turns 1d+9 into 3d+2 -- so they can see
 * which are on and why, but only the GM can change them. It opens on the rules
 * in play, since those are what a player is asking about.
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
import { normaliseQuery, ruleMatches, rulesInView, type SearchableRule } from "../rule-search.js";

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

  /** What is typed in the search box, kept so a toggle's re-render does not clear it. */
  #query = "";

  /** Every rule on the page with the words it can be found by, as last rendered. */
  #searchable: SearchableRule[] = [];

  /** Opens the page, or brings forward the one already open. */
  static async open(): Promise<void> {
    const open = (foundry.applications as any).instances?.get?.(RulesSettings.DEFAULT_OPTIONS.id);
    await (open instanceof RulesSettings ? open : new RulesSettings()).render({ force: true });
    if (open instanceof RulesSettings) (open as any).bringToFront?.();
  }

  /** In a read-only view, whether only the rules in play are shown. */
  #inPlayOnly = true;

  /**
   * Whether the page only shows the rules: anyone but a GM, who could not save
   * the world's setting anyway. `readOnly` in the options says regardless.
   */
  get readOnly(): boolean {
    const asked = ((this as any).options as { readOnly?: unknown } | undefined)?.readOnly;
    return typeof asked === "boolean" ? asked : game.user?.isGM !== true;
  }

  #state(): Record<string, boolean> {
    return this.#pending ?? ruleState();
  }

  override async _prepareContext(): Promise<Record<string, unknown>> {
    const readOnly = this.readOnly;
    // Nothing a player does here is kept, so there is nothing pending to show.
    if (readOnly) this.#pending = null;
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
    // A group with no rules yet is shown too, saying so: the module is there,
    // and its rules are still to come.
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
      }));

    const i18n = game.i18n;
    const groups = [...systemGroups, ...moduleGroups].map((group) => {
      // What the group can be found by as well as each rule in it: typing
      // "magic" should bring up the Magic group's rules, whatever they are called.
      const groupText = [i18n.localize(group.label), group.source ?? ""].join(" ");
      return {
        ...group,
        search: groupText.toLowerCase(),
        rules: group.rules.map((rule) => ({
          ...rule,
          search: [i18n.localize(rule.label), i18n.localize(rule.hint), rule.reference ?? "", groupText]
            .join(" ")
            .toLowerCase(),
        })),
      };
    });
    this.#searchable = groups.flatMap((group) => group.rules.map((rule) => ({ key: rule.key, text: rule.search })));

    return {
      groups,
      readOnly,
      inPlayOnly: this.#inPlayOnly,
      query: this.#query,
      // Unsaved changes are worth saying out loud on a page whose whole point
      // is that nothing happens until you press the button.
      dirty: this.#pending !== null,
    };
  }

  override async _onRender(context: object, options: object): Promise<void> {
    await super._onRender(context, options);

    // Filtered in place rather than by re-rendering: a render per keystroke
    // would take the caret out of the box, and the switches are all on the
    // page already.
    const search = this.element.querySelector<HTMLInputElement>('input[name="rule-search"]');
    search?.addEventListener("input", () => {
      this.#query = search.value;
      this.#applyFilter();
    });
    const inPlay = this.element.querySelector<HTMLInputElement>('input[name="in-play-only"]');
    inPlay?.addEventListener("change", () => {
      this.#inPlayOnly = inPlay.checked;
      this.#applyFilter();
    });
    this.#applyFilter();

    for (const box of this.element.querySelectorAll<HTMLInputElement>("input[data-rule]")) {
      box.addEventListener("change", () => {
        const key = box.dataset.rule;
        if (!key || this.readOnly) return;
        this.#pending = { ...this.#state(), [key]: box.checked };
        void this.render();
      });
    }
  }

  /**
   * Hides the rules the search does not match, and the groups left with none.
   * A group with no rules yet is shown while its own name matches.
   */
  #applyFilter(): void {
    const query = normaliseQuery(this.#query);
    const inPlayOnly = this.readOnly && this.#inPlayOnly;
    let shown = 0;

    for (const group of this.element.querySelectorAll<HTMLElement>(".gr-group")) {
      const rules = [...group.querySelectorAll<HTMLElement>(".gr-rule")];
      let visible = 0;
      for (const rule of rules) {
        const match = ruleMatches(rule.dataset.search ?? "", query) && (!inPlayOnly || rule.dataset.on === "true");
        rule.hidden = !match;
        if (match) visible += 1;
      }
      // A group with no rules in play has nothing to show a player who asked
      // for those alone.
      const keep = rules.length > 0 ? visible > 0 : !inPlayOnly && ruleMatches(group.dataset.search ?? "", query);
      group.hidden = !keep;
      shown += visible;
    }

    const none = this.element.querySelector<HTMLElement>(".gr-nomatch");
    if (none) none.hidden = !(query || inPlayOnly) || shown > 0;

    // The bulk buttons say when they will touch only what the search shows.
    for (const button of this.element.querySelectorAll<HTMLElement>("[data-label-all]")) {
      button.textContent = query ? (button.dataset.labelShown ?? "") : (button.dataset.labelAll ?? "");
    }
  }

  static async #onSave(this: RulesSettings): Promise<void> {
    if (this.readOnly) return;
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

  /**
   * Turns every rule on the page on or off -- or, while a search is typed,
   * only the rules it shows, leaving the hidden ones as they were.
   */
  async #setAll(value: boolean): Promise<void> {
    if (this.readOnly) return;
    const state = this.#state();
    const keys = normaliseQuery(this.#query) ? rulesInView(this.#searchable, this.#query) : Object.keys(state);
    const changes = Object.fromEntries(keys.map((key) => [key, isImplemented(key) ? value : false]));
    this.#pending = { ...state, ...changes };
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
    if (this.readOnly) return;
    this.#pending = defaultRuleState();
    await this.render();
  }
}
