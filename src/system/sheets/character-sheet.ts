/**
 * The character sheet.
 *
 * Six tabs behind a persistent header, built on ApplicationV2 with one
 * Handlebars part per tab. Foundry's `changeTab` toggles `.active` on the
 * rendered sections rather than re-rendering, so every part is present in the
 * DOM at once and CSS controls visibility.
 */

import { SYSTEM_ID } from "../constants.js";
import { ENCUMBRANCE_TIERS, encumberedMove } from "../../rules/encumbrance.js";
import {
  BASIC_SPEED_STEP,
  basicSpeedPointCost,
  secondaryPointCost,
} from "../../rules/attributes.js";
import { MANEUVER_ORDER } from "../../rules/maneuvers.js";
import { handleDamageAction, handleRollAction } from "../roll.js";
import type { Attribute, Posture } from "../../rules/types.js";

const { ActorSheetV2 } = foundry.applications.sheets;
const { HandlebarsApplicationMixin } = foundry.applications.api;

const TEMPLATE_ROOT = `systems/${SYSTEM_ID}/templates/actor`;

const ATTRIBUTE_KEYS: Attribute[] = ["ST", "DX", "IQ", "HT"];

const POSTURES: Posture[] = ["standing", "crouching", "kneeling", "crawling", "sitting", "lying"];

/** Conditions the Combat tab exposes as toggle chips. */
const CONDITIONS = [
  { key: "allOutDefense", label: "GWORLD.Condition.AllOutDefense" },
  { key: "stunned", label: "GWORLD.Condition.Stunned" },
  { key: "blindToAttacker", label: "GWORLD.Condition.BlindToAttacker" },
] as const;

/** Normalises a defense into the shape the card template renders. */
function toCard(defense: { total: number; source: string; math: string } | null) {
  return defense
    ? { total: defense.total, source: defense.source, math: defense.math, available: true }
    : { total: 0, source: "", math: "", available: false };
}

/** A one-line summary of a weapon's attack modes, for the inventory Notes column. */
function describeModes(item: any): string {
  const melee = item.system.meleeModes?.length ?? 0;
  const ranged = item.system.rangedModes?.length ?? 0;
  if (!melee && !ranged) return "";
  const parts: string[] = [];
  if (melee) parts.push(`${melee} melee`);
  if (ranged) parts.push(`${ranged} ranged`);
  return parts.join(", ");
}

export class GWorldCharacterSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static override DEFAULT_OPTIONS = {
    classes: ["gworld", "sheet", "actor", "character"],
    position: { width: 740, height: 900 },
    window: { resizable: true },
    form: { submitOnChange: true, closeOnSubmit: false },
    actions: {
      roll: GWorldCharacterSheet.#onRoll,
      rollDamage: GWorldCharacterSheet.#onRollDamage,
      toggleCondition: GWorldCharacterSheet.#onToggleCondition,
      createItem: GWorldCharacterSheet.#onCreateItem,
      editItem: GWorldCharacterSheet.#onEditItem,
      deleteItem: GWorldCharacterSheet.#onDeleteItem,
      toggleEquipped: GWorldCharacterSheet.#onToggleEquipped,
    },
  };

  static override PARTS = {
    header: { template: `${TEMPLATE_ROOT}/header.hbs` },
    nav: { template: `${TEMPLATE_ROOT}/nav.hbs` },
    attributes: { template: `${TEMPLATE_ROOT}/tab-attributes.hbs`, scrollable: [""] },
    skills: { template: `${TEMPLATE_ROOT}/tab-skills.hbs`, scrollable: [""] },
    traits: { template: `${TEMPLATE_ROOT}/tab-traits.hbs`, scrollable: [""] },
    combat: { template: `${TEMPLATE_ROOT}/tab-combat.hbs`, scrollable: [""] },
    gear: { template: `${TEMPLATE_ROOT}/tab-gear.hbs`, scrollable: [""] },
    description: { template: `${TEMPLATE_ROOT}/tab-description.hbs`, scrollable: [""] },
  };

  static override TABS = {
    primary: {
      initial: "attributes",
      labelPrefix: "GWORLD.Tab",
      tabs: [
        { id: "attributes" },
        { id: "skills" },
        { id: "traits" },
        { id: "combat" },
        { id: "gear" },
        { id: "description" },
      ],
    },
  };

  /** A limited-permission observer sees only the public description. */
  static LIMITED_PARTS = {
    limited: { template: `${TEMPLATE_ROOT}/limited.hbs` },
  };

  override _configureRenderParts(options: object): Record<string, unknown> {
    if (this.document.limited) return foundry.utils.deepClone(GWorldCharacterSheet.LIMITED_PARTS);
    return super._configureRenderParts(options);
  }

  override async _prepareContext(options: object): Promise<Record<string, unknown>> {
    const context = (await super._prepareContext(options)) as Record<string, unknown>;
    const actor = this.actor;
    const system = actor.system;
    const derived = system.derived;
    const items = this.#groupItems();

    const enrich = (html: string) =>
      foundry.applications.ux.TextEditor.implementation.enrichHTML(html, {
        relativeTo: actor,
        secrets: actor.isOwner,
      });

    return {
      ...context,
      actor,
      system,
      derived,
      items,
      editable: this.isEditable,
      limited: actor.limited,
      isOwner: actor.isOwner,

      attributeCards: ATTRIBUTE_KEYS.map((key) => ({
        key,
        label: game.i18n.localize(`GWORLD.Attribute.${key}`),
        value: system.attributes[key],
        cost: (system.attributes[key] - 10) * (key === "DX" || key === "IQ" ? 20 : 10),
      })),

      postures: POSTURES.map((key) => ({
        key,
        label: game.i18n.localize(`GWORLD.Posture.${key}`),
        selected: system.posture === key,
      })),

      secondaryCells: this.#secondaryCells(system, derived),
      maneuvers: MANEUVER_ORDER.map((key) => ({
        key,
        label: game.i18n.localize(`GWORLD.Maneuver.${key}`),
        selected: system.maneuver === key,
      })),
      isEvaluating: system.maneuver === "evaluate",
      isAllOutDefense: system.maneuver === "allOutDefense" || system.conditions.allOutDefense,
      aodIncreased: system.allOutDefenseOption === "increased",
      aodTargets: (["dodge", "parry", "block"] as const).map((key) => ({
        key,
        label: `GWORLD.Secondary.${key === "dodge" ? "Dodge" : key === "parry" ? "Parry" : "Block"}`,
        selected: system.allOutDefenseTarget === key,
      })),

      pointsWarning: this.#pointsWarning(derived),

      traitGroups: [
        {
          num: "01",
          label: "GWORLD.Points.Advantages",
          addLabel: "GWORLD.Action.AddAdvantage",
          category: "advantage",
          total: derived.points.advantages,
          negative: false,
          traits: items.advantages,
        },
        {
          num: "02",
          label: "GWORLD.Points.Disadvantages",
          addLabel: "GWORLD.Action.AddDisadvantage",
          category: "disadvantage",
          total: derived.points.disadvantages,
          negative: true,
          traits: items.disadvantages,
        },
        {
          num: "03",
          label: "GWORLD.Points.Quirks",
          addLabel: "GWORLD.Action.AddQuirk",
          category: "quirk",
          total: derived.points.quirks,
          negative: true,
          traits: items.quirks,
        },
      ],
      disadvantageOverLimit: derived.points.disadvantageTotal > derived.points.disadvantageLimit,

      conditionChips: CONDITIONS.map(({ key, label }) => ({
        key,
        label,
        active: Boolean(system.conditions[key]),
      })),

      defenseCards: [
        { key: "dodge", label: "GWORLD.Secondary.Dodge", ...toCard(derived.defenses.dodge) },
        { key: "parry", label: "GWORLD.Secondary.Parry", ...toCard(derived.defenses.parry) },
        { key: "block", label: "GWORLD.Secondary.Block", ...toCard(derived.defenses.block) },
      ],

      encumbranceTiers: this.#encumbranceTiers(derived),
      carriedRows: this.#carriedRows(items),

      skillSummary: { count: items.skillGroups.reduce((n, g) => n + g.skills.length, 0) },

      biographyHTML: await enrich(system.details.biography ?? ""),
      notesHTML: await enrich(system.details.notes ?? ""),
    };
  }

  /**
   * Wires the skill filter. It is deliberately not a form field — a `name`
   * here would be submitted onto the actor on every keystroke.
   */
  override async _onRender(context: object, options: object): Promise<void> {
    await super._onRender(context, options);

    const filter = this.element.querySelector<HTMLInputElement>(".gworld-skill-filter");
    if (!filter) return;

    const apply = () => {
      const needle = filter.value.trim().toLowerCase();
      for (const row of this.element.querySelectorAll<HTMLElement>("[data-tab='skills'] tbody tr")) {
        const name = row.querySelector(".wname")?.textContent?.toLowerCase() ?? "";
        row.hidden = needle.length > 0 && !name.includes(needle);
      }
      // A group whose rows are all hidden should not leave a stray header.
      for (const group of this.element.querySelectorAll<HTMLElement>("[data-tab='skills'] .isec")) {
        const rows = [...group.querySelectorAll<HTMLElement>("tbody tr")];
        group.hidden = rows.length > 0 && rows.every((r) => r.hidden);
      }
    };

    filter.addEventListener("input", apply);
    apply();
  }

  /**
   * Hands each tab part its own tab config, so the section can mark itself
   * active on first render. Without this every section renders inactive and
   * the sheet body comes up blank.
   */
  override async _preparePartContext(
    partId: string,
    context: Record<string, any>,
    options: object,
  ): Promise<Record<string, any>> {
    const partContext = (await super._preparePartContext(partId, context, options)) as Record<
      string,
      any
    >;
    if (partContext.tabs && partId in partContext.tabs) partContext.tab = partContext.tabs[partId];
    return partContext;
  }

  /**
   * The secondary-characteristics grid.
   *
   * Each Basic Set secondary can be bought above or sold below its
   * attribute-derived default, so the editable ones expose their adjustment and
   * what it costs. Basic Lift and Dodge stay read-only — they are computed, not
   * purchased.
   */
  #secondaryCells(system: any, derived: any) {
    const L = (key: string) => game.i18n.localize(`GWORLD.Secondary.${key}`);
    const p = system.purchased;
    const b = system.bonuses;

    const cell = (
      key: "hp" | "will" | "per" | "fp" | "basicMove",
      label: string,
      value: unknown,
      derivation: string,
    ) => ({
      key,
      label,
      value,
      purchased: p[key],
      granted: b[key],
      derivation,
      step: 1,
      editable: true,
      cost: secondaryPointCost(key, p[key]),
    });

    return [
      cell("hp", L("HP"), system.hp.max, "= ST"),
      cell("will", L("Will"), derived.will, "= IQ"),
      cell("per", L("Per"), derived.per, "= IQ"),
      cell("fp", L("FP"), system.fp.max, "= HT"),
      {
        key: "basicLift", label: L("BasicLift"), value: `${derived.basicLift} lb`,
        derivation: "= ST²/5", editable: false, cost: 0, granted: 0, purchased: 0, step: 1,
      },
      {
        key: "basicSpeed", label: L("BasicSpeed"), value: derived.basicSpeed.toFixed(2),
        purchased: p.basicSpeed, granted: b.basicSpeed, derivation: "= (DX+HT)/4",
        step: BASIC_SPEED_STEP, editable: true, cost: basicSpeedPointCost(p.basicSpeed),
      },
      cell("basicMove", L("BasicMove"), derived.basicMove, "= ⌊Speed⌋"),
      {
        key: "dodge", label: L("Dodge"), value: derived.defenses.dodge.total,
        derivation: "= Move + 3", editable: false, cost: 0, granted: 0, purchased: 0, step: 1,
      },
    ];
  }

  /** The advisory line under the points ledger. Warnings never block saving. */
  #pointsWarning(derived: any): { text: string; over: boolean } {
    const { remaining, disadvantageTotal, disadvantageLimit } = derived.points;
    const parts: string[] = [];
    let over = false;

    if (remaining > 0) {
      parts.push(game.i18n.format("GWORLD.Points.Unspent", { points: remaining }));
    } else if (remaining < 0) {
      parts.push(game.i18n.format("GWORLD.Points.Over", { points: Math.abs(remaining) }));
      over = true;
    } else {
      parts.push(game.i18n.localize("GWORLD.Points.Exact"));
    }

    parts.push(
      game.i18n.format("GWORLD.Points.DisadvantageStanding", {
        total: disadvantageTotal,
        limit: disadvantageLimit,
      }),
    );
    if (disadvantageTotal > disadvantageLimit) over = true;

    return { text: parts.join(" "), over };
  }

  /** The five encumbrance tiers with this character's limits and resulting Move. */
  #encumbranceTiers(derived: any) {
    const bl = derived.basicLift;
    return ENCUMBRANCE_TIERS.map((tier) => ({
      label: `GWORLD.Encumbrance.${tier.key}`,
      limit: Math.floor(bl * tier.basicLiftMultiple),
      move: encumberedMove(derived.basicMove, tier.level),
      active: derived.encumbrance.level === tier.level,
    }));
  }

  /**
   * Equipment, armor and shields share one carried list so weight and cost read
   * as a single inventory rather than three.
   */
  #carriedRows(items: { carried: any[]; armor: any[]; shields: any[] }) {
    const rows = [
      ...items.carried.map((i: any) => ({ item: i, notes: describeModes(i), equippable: false })),
      // Armour arrives wrapped with its coverage text for the protection card,
      // so the inventory has to reach through to the item itself.
      ...items.armor.map((a: any) => ({
        item: a.item,
        notes: `DR ${a.item.system.dr} — ${a.coverage}`,
        equippable: true,
      })),
      ...items.shields.map((i: any) => ({ item: i, notes: `DB ${i.system.db}`, equippable: true })),
    ];

    return rows.map(({ item, notes, equippable }) => ({
      id: item.id,
      name: item.name,
      quantity: item.system.quantity ?? 1,
      weight: (item.system.weight ?? 0) * (item.system.quantity ?? 1),
      cost: (item.system.cost ?? 0) * (item.system.quantity ?? 1),
      equipped: Boolean(item.system.equipped),
      equippable: equippable || Boolean(item.system.meleeModes?.length || item.system.rangedModes?.length),
      notes,
    }));
  }

  /** Splits embedded items into the buckets each tab renders. */
  #groupItems() {
    const actor = this.actor;
    const all = [...actor.items];
    const byType = (type: string) => all.filter((i: any) => i.type === type);

    const skills = byType("skill");
    const trained = skills.filter((s: any) => s.system.points > 0);
    const untrained = skills.filter((s: any) => s.system.points <= 0);

    // Skills group by controlling attribute, matching the printed sheet.
    const skillGroups = (["DX", "IQ", "HT", "ST", "Will", "Per"] as const)
      .map((attribute) => ({
        attribute,
        score:
          attribute === "Will"
            ? actor.system.derived.will
            : attribute === "Per"
              ? actor.system.derived.per
              : actor.system.attributes[attribute],
        skills: trained
          .filter((s: any) => s.system.attribute === attribute)
          .sort((a: any, b: any) => a.name.localeCompare(b.name)),
      }))
      .filter((g) => g.skills.length > 0);

    const equipment = byType("equipment");

    return {
      skillGroups,
      untrainedSkills: untrained.sort((a: any, b: any) => a.name.localeCompare(b.name)),
      advantages: byType("trait").filter((t: any) => ["advantage", "perk"].includes(t.system.category)),
      disadvantages: byType("trait").filter((t: any) => t.system.category === "disadvantage"),
      quirks: byType("trait").filter((t: any) => t.system.category === "quirk"),
      // The protection card used to call every piece whole-body, which was true
      // while the only armour came from GURPS Lite's full suits. The Basic Set
      // sells a torso piece and its sleeves separately, so the card has to say
      // what each one actually covers.
      armor: byType("armor").map((a: any) => ({
        item: a,
        coverage: (a.system.locations ?? []).length
          ? (a.system.locations as string[])
              .map((l) => game.i18n.localize(`GWORLD.HitLocation.${l}`))
              .join(", ")
          : game.i18n.localize("GWORLD.Item.WholeBody"),
      })),
      shields: byType("shield"),
      languages: byType("language"),
      techniques: byType("technique")
        .sort((a: any, b: any) => a.name.localeCompare(b.name))
        // A resolved level of 0 or below is still a valid level, but Handlebars
        // reads it as false, so the template needs an explicit flag.
        .map((t: any) => ({ item: t, resolved: t.system.derived?.level !== null })),
      carried: equipment.filter((i: any) => i.system.carried),
      stored: equipment.filter((i: any) => !i.system.carried),
    };
  }

  /* ── actions ─────────────────────────────────────────────────────────── */

  /**
   * Rolls 3d6 against the clicked target number and posts the result to chat.
   * Shift-click prompts for a situational modifier first.
   */
  static async #onRoll(this: GWorldCharacterSheet, event: Event, target: HTMLElement) {
    await handleRollAction(this.actor, event, target);
  }

  /** Rolls an attack mode's damage and posts it to chat. */
  static async #onRollDamage(this: GWorldCharacterSheet, event: Event, target: HTMLElement) {
    await handleDamageAction(this.actor, event, target);
  }

  static async #onToggleCondition(this: GWorldCharacterSheet, _event: Event, target: HTMLElement) {
    const key = target.dataset.condition;
    if (!key) return;
    const current = foundry.utils.getProperty(this.actor, `system.conditions.${key}`);
    await this.actor.update({ [`system.conditions.${key}`]: !current });
  }

  static async #onCreateItem(this: GWorldCharacterSheet, _event: Event, target: HTMLElement) {
    const type = target.dataset.itemType;
    if (!type) return;
    const label = game.i18n.localize(`TYPES.Item.${type}`);
    await this.actor.createEmbeddedDocuments("Item", [{ name: `New ${label}`, type }]);
  }

  static async #onEditItem(this: GWorldCharacterSheet, _event: Event, target: HTMLElement) {
    const item = this.#itemFrom(target);
    item?.sheet?.render({ force: true });
  }

  static async #onDeleteItem(this: GWorldCharacterSheet, _event: Event, target: HTMLElement) {
    const item = this.#itemFrom(target);
    if (!item) return;
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize("GWORLD.Prompt.DeleteItemTitle") },
      content: `<p>${game.i18n.format("GWORLD.Prompt.DeleteItem", { name: item.name })}</p>`,
    });
    if (confirmed) await item.delete();
  }

  static async #onToggleEquipped(this: GWorldCharacterSheet, _event: Event, target: HTMLElement) {
    const item = this.#itemFrom(target);
    if (!item) return;
    await item.update({ "system.equipped": !item.system.equipped });
  }

  #itemFrom(target: HTMLElement) {
    const id = target.closest<HTMLElement>("[data-item-id]")?.dataset.itemId;
    return id ? this.actor.items.get(id) : null;
  }
}
