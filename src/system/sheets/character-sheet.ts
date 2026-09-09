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
      ...items.armor.map((i: any) => ({ item: i, notes: `DR ${i.system.dr}`, equippable: true })),
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
    const skillGroups = (["DX", "IQ", "HT", "ST"] as const)
      .map((attribute) => ({
        attribute,
        score: actor.system.attributes[attribute],
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
      armor: byType("armor"),
      shields: byType("shield"),
      languages: byType("language"),
      carried: equipment.filter((i: any) => i.system.carried),
      stored: equipment.filter((i: any) => !i.system.carried),
    };
  }

  /* ── actions ─────────────────────────────────────────────────────────── */

  /**
   * Roll handler. The roll engine and modifier bucket arrive in a later phase;
   * for now this reports the target number so the affordances are live and the
   * markup does not need reworking when rolls land.
   */
  static async #onRoll(this: GWorldCharacterSheet, _event: Event, target: HTMLElement) {
    const { rollType, rollLabel, rollTarget } = target.dataset;
    const value = Number(rollTarget);
    if (!Number.isFinite(value)) return;

    ui.notifications?.info(
      `${rollLabel ?? rollType ?? "Roll"}: target ${value} (roll engine lands in a later phase)`,
    );
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
