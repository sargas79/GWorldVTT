/**
 * The NPC sheet: one pane, no tabs.
 *
 * A GM opens this mid-combat, so it shows attributes, defenses, attacks and a
 * short skill line at a glance rather than hiding anything behind navigation.
 */

import { SYSTEM_ID } from "../constants.js";
import { handleDamageAction, handleRollAction } from "../roll.js";
import { castSpell } from "../casting.js";
import { isRuleOn } from "../optional-rules.js";
import { swarmAttack, swarmOf } from "../swarms.js";
import type { SwarmProtection } from "../../rules/swarms.js";
import type { Attribute } from "../../rules/types.js";

const { ActorSheetV2 } = foundry.applications.sheets;
const { HandlebarsApplicationMixin } = foundry.applications.api;

const TEMPLATE_ROOT = `systems/${SYSTEM_ID}/templates/actor`;

/** How high a skill must be, relative to its attribute, to be worth listing. */
const NOTABLE_SKILL_MINIMUM_POINTS = 1;

/** Asks what the victims are wearing, and how long they have been in it (p. 461). */
async function promptForSwarmAttack(): Promise<{ protection: SwarmProtection; secondsExposed: number } | null> {
  const L = (key: string) => game.i18n.localize(`GWORLD.Swarm.${key}`);
  const options = (["none", "clothing", "armor", "sealed"] as const)
    .map((k) => `<option value="${k}">${L(`Protection.${k}`)}</option>`)
    .join("");

  const result = await foundry.applications.api.DialogV2.prompt({
    window: { title: L("Attack") },
    content: `<div class="gworld" style="display:flex;flex-direction:column;gap:6px">
      <label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <span>${L("Wearing")}</span>
        <select name="protection" style="width:220px">${options}</select>
      </label>
      <label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <span>${L("Seconds")}</span>
        <input type="number" name="seconds" value="0" min="0" step="1" style="width:90px">
      </label>
      <p class="ihint" style="margin:0">${L("AttackHint")}</p>
    </div>`,
    ok: {
      label: game.i18n.localize("GWORLD.Chat.Roll"),
      callback: (_event: Event, button: HTMLElement) => {
        const form = button.closest<HTMLElement>(".application");
        return {
          protection: (form?.querySelector<HTMLSelectElement>('select[name="protection"]')?.value ?? "none") as SwarmProtection,
          secondsExposed:
            Number(form?.querySelector<HTMLInputElement>('input[name="seconds"]')?.value ?? 0) || 0,
        };
      },
    },
    rejectClose: false,
  });
  return result && typeof result === "object" ? (result as never) : null;
}

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
      swarmAttack: GWorldNpcSheet.#onSwarmAttack,
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

    // A swarm is an NPC with a block saying what it does every second.
    const swarm = swarmOf(actor);

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

      // The mook switch is only worth a line on the sheet where the table is
      // playing the rule (Campaigns p. 417).
      cannonFodderInPlay: isRuleOn("cannonFodder"),

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
      // A swarm attacks with none of those: it has a line of its own.
      swarm: swarm ? { ...swarm, about: system.swarm?.about ?? "", inPlay: isRuleOn("swarms") } : null,

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

  /**
   * A second of being swarmed (Campaigns p. 461).
   *
   * No roll to hit and none to defend; what is asked is what the victims are
   * wearing and how long they have been in it, since against insects a
   * covering only holds for a few seconds.
   */
  static async #onSwarmAttack(this: GWorldNpcSheet) {
    if (!isRuleOn("swarms")) return;
    const asked = await promptForSwarmAttack();
    if (!asked) return;
    await swarmAttack({ actor: this.actor, ...asked });
  }

  static async #onCastSpell(this: GWorldNpcSheet, _event: Event, target: HTMLElement) {
    const id = target.closest<HTMLElement>("[data-item-id]")?.dataset.itemId;
    const item = id ? this.actor.items.get(id) : null;
    if (item) await castSpell(this.actor, item);
  }
}
