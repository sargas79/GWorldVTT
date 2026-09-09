/**
 * The NPC sheet: one pane, no tabs.
 *
 * A GM opens this mid-combat, so it shows attributes, defenses, attacks and a
 * short skill line at a glance rather than hiding anything behind navigation.
 */

import { SYSTEM_ID } from "../constants.js";
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
      editItem: GWorldNpcSheet.#onEditItem,
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

    return {
      ...context,
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
          cell(`GWORLD.Attribute.${key}Abbr`, system.attributes[key], true),
        ),
        cell("GWORLD.Secondary.WillAbbr", derived.will, true),
        cell("GWORLD.Secondary.PerAbbr", derived.per, true),
        cell("GWORLD.Secondary.MoveAbbr", derived.move),
        cell("GWORLD.Secondary.DRAbbr", derived.dr),
      ],

      allAttacks: [...derived.melee, ...derived.ranged],
      notableSkills,

      biographyHTML: await foundry.applications.ux.TextEditor.implementation.enrichHTML(
        system.details.biography ?? "",
        { relativeTo: actor, secrets: actor.isOwner },
      ),
    };
  }

  static async #onRoll(this: GWorldNpcSheet, _event: Event, target: HTMLElement) {
    const { rollLabel, rollTarget } = target.dataset;
    const value = Number(rollTarget);
    if (!Number.isFinite(value)) return;
    ui.notifications?.info(`${rollLabel ?? "Roll"}: target ${value}`);
  }

  static async #onEditItem(this: GWorldNpcSheet, _event: Event, target: HTMLElement) {
    const id = target.closest<HTMLElement>("[data-item-id]")?.dataset.itemId;
    if (id) this.actor.items.get(id)?.sheet?.render({ force: true });
  }
}
