/**
 * The NPC sheet: one pane, no tabs.
 *
 * A GM opens this mid-combat, so it shows attributes, defenses, attacks and a
 * short skill line at a glance rather than hiding anything behind navigation.
 */

import { SYSTEM_ID } from "../constants.js";
import { handleDamageAction, handleRollAction } from "../roll.js";
import { castSpell } from "../casting.js";
import type { Attribute } from "../../rules/types.js";

const { ActorSheetV2 } = foundry.applications.sheets;
const { HandlebarsApplicationMixin } = foundry.applications.api;

const TEMPLATE_ROOT = `systems/${SYSTEM_ID}/templates/actor`;

/** How high a skill must be, relative to its attribute, to be worth listing. */
const NOTABLE_SKILL_MINIMUM_POINTS = 1;

export class GWorldNpcSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static override DEFAULT_OPTIONS = {
    classes: ["gworld", "sheet", "actor", "npc"],
    position: { width: 480, height: "auto" },
    window: { resizable: true },
    form: { submitOnChange: true, closeOnSubmit: false },
    actions: {
      roll: GWorldNpcSheet.#onRoll,
      rollDamage: GWorldNpcSheet.#onRollDamage,
      editItem: GWorldNpcSheet.#onEditItem,
      castSpell: GWorldNpcSheet.#onCastSpell,
    },
  };

  static override PARTS = {
    sheet: { template: `${TEMPLATE_ROOT}/npc-sheet.hbs`, scrollable: [".ibody"] },
  };

  static LIMITED_PARTS = {
    limited: { template: `${TEMPLATE_ROOT}/limited.hbs` },
  };

  override _configureRenderParts(options: object): Record<string, unknown> {
    if (this.document.limited) return foundry.utils.deepClone(GWorldNpcSheet.LIMITED_PARTS);
    return super._configureRenderParts(options);
  }

  override async _prepareContext(options: object): Promise<Record<string, unknown>> {
    const context = (await super._prepareContext(options)) as Record<string, unknown>;
    const actor = this.actor;
    const system = actor.system;
    const derived = system.derived;

    const cell = (label: string, value: unknown, rollable = false) => ({
      label: game.i18n.localize(label),
      value,
      rollable,
    });

    const notableSkills = [...actor.items]
      .filter((i: any) => i.type === "skill" && i.system.points >= NOTABLE_SKILL_MINIMUM_POINTS)
      .map((i: any) => ({ name: i.name, level: i.system.derived?.level }))
      .filter((s) => s.level !== null && s.level !== undefined)
      .sort((a, b) => (b.level as number) - (a.level as number));

    // The spells an NPC actually knows, at the level they cast them: a GM
    // running a wizard mid-fight needs Fireball 15 in the same glance as the
    // DR, not on another sheet.
    const notableSpells = [...actor.items]
      .filter((i: any) => i.type === "spell" && i.system.points >= NOTABLE_SKILL_MINIMUM_POINTS)
      .map((i: any) => ({ id: i.id, name: i.name, level: i.system.derived?.level }))
      .filter((s) => s.level !== null && s.level !== undefined)
      .sort((a, b) => (b.level as number) - (a.level as number));

    // A GM reading this mid-fight needs the DR, and needs to know when it is not
    // one number: an NPC in a ballistic vest stops a bullet far better than a
    // club, and a sheet showing only the higher figure would have them subtract
    // it from both.
    const torso = (derived.hitLocations ?? []).find((l: any) => l.key === "torso");

    return {
      ...context,
      torsoDr: torso
        ? {
            dr: torso.dr,
            splits: torso.splits,
            exceptions: torso.exceptions,
          }
        : null,
      actor,
      system,
      derived,
      editable: this.isEditable,
      isOwner: actor.isOwner,

      groupSizeLabel:
        system.groupSize > 1
          ? game.i18n.format("GWORLD.Npc.InScene", { count: system.groupSize })
          : null,

      statCells: [
        ...(["ST", "DX", "IQ", "HT"] as Attribute[]).map((key) =>
          cell(`GWORLD.Attribute.${key}Abbr`, derived.attributes?.[key] ?? system.attributes[key], true),
        ),
        cell("GWORLD.Secondary.WillAbbr", derived.will, true),
        cell("GWORLD.Secondary.PerAbbr", derived.per, true),
        cell("GWORLD.Secondary.MoveAbbr", derived.move),
        cell("GWORLD.Secondary.DRAbbr", derived.dr),
      ],

      allAttacks: [...derived.melee, ...derived.ranged],
      notableSkills,
      notableSpells,

      biographyHTML: await foundry.applications.ux.TextEditor.implementation.enrichHTML(
        system.details.biography ?? "",
        { relativeTo: actor, secrets: actor.isOwner },
      ),
    };
  }

  static async #onRoll(this: GWorldNpcSheet, event: Event, target: HTMLElement) {
    await handleRollAction(this.actor, event, target);
  }

  static async #onRollDamage(this: GWorldNpcSheet, event: Event, target: HTMLElement) {
    await handleDamageAction(this.actor, event, target);
  }

  static async #onEditItem(this: GWorldNpcSheet, _event: Event, target: HTMLElement) {
    const id = target.closest<HTMLElement>("[data-item-id]")?.dataset.itemId;
    if (id) this.actor.items.get(id)?.sheet?.render({ force: true });
  }

  static async #onCastSpell(this: GWorldNpcSheet, _event: Event, target: HTMLElement) {
    const id = target.closest<HTMLElement>("[data-item-id]")?.dataset.itemId;
    const item = id ? this.actor.items.get(id) : null;
    if (item) await castSpell(this.actor, item);
  }
}
