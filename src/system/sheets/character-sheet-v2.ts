/**
 * The new character sheet.
 *
 * A sidebar of tabs beside a header that carries the character's name, the tab
 * being read and the point budget, over cream panels on a dark frame. The list
 * tabs pair a list with a panel describing the selected row.
 *
 * It extends the classic sheet rather than replacing it. Every action -- a
 * roll, a grapple, a hazard, an award -- is the classic sheet's own handler,
 * and every section the two share is drawn from one partial, so a rule or a
 * module's button behaves the same on either. What this class adds is the
 * layout, the tabs the classic sheet does not have, and the view state a list
 * with a detail panel needs: which row is selected, which groups are folded,
 * how a list is sorted. That state lives on the sheet, not the actor, and is
 * applied again after every redraw.
 */

import { SYSTEM_ID } from "../constants.js";
import { setCondition, CONDITIONS } from "../conditions.js";
import { activeConditions } from "../procedure-extensions.js";
import { POSTURE_EFFECTS } from "../../rules/posture.js";
import { byName } from "../sort.js";
import type { SheetKind } from "../sheet-tabs.js";
import {
  activeSkills,
  contextModifiers,
  loadPercent,
  pointBadge,
  poolPercent,
  togglePinned,
} from "../sheet-v2/overview.js";
import { GWorldCharacterSheet } from "./character-sheet.js";

const V2_ROOT = `systems/${SYSTEM_ID}/templates/actor/v2`;

/** The Basic Set's hit locations the Overview's DR card names, in the order it shows them. */
const OVERVIEW_DR_LOCATIONS = ["torso", "skull"] as const;

export class GWorldCharacterSheetV2 extends GWorldCharacterSheet {
  // Foundry merges these into the classic sheet's own, so only what differs is
  // given; the type is the classic sheet's, which a partial does not satisfy.
  static override DEFAULT_OPTIONS: any = {
    classes: ["v2"],
    // Wide enough for a list beside its detail panel. It narrows: below 900
    // pixels the sidebar shows icons only and each panel drops under its list.
    position: { width: 1120, height: 760 },
    actions: {
      v2PinSkill: GWorldCharacterSheetV2.#onPinSkill,
      v2ToggleStatus: GWorldCharacterSheetV2.#onToggleStatus,
    },
  };

  static override PARTS: any = {
    header: { template: `${V2_ROOT}/header.hbs` },
    nav: { template: `${V2_ROOT}/nav.hbs` },
    overview: { template: `${V2_ROOT}/tab-overview.hbs`, scrollable: [""] },
    skills: { template: `systems/${SYSTEM_ID}/templates/actor/tab-skills.hbs`, scrollable: [""] },
    traits: { template: `systems/${SYSTEM_ID}/templates/actor/tab-traits.hbs`, scrollable: [""] },
    combat: { template: `systems/${SYSTEM_ID}/templates/actor/tab-combat.hbs`, scrollable: [""] },
    inventory: { template: `systems/${SYSTEM_ID}/templates/actor/tab-gear.hbs`, scrollable: [""] },
    progression: { template: `systems/${SYSTEM_ID}/templates/actor/tab-attributes.hbs`, scrollable: [""] },
    journal: { template: `systems/${SYSTEM_ID}/templates/actor/tab-description.hbs`, scrollable: [""] },
    magic: { template: `systems/${SYSTEM_ID}/templates/actor/tab-magic.hbs`, scrollable: [""] },
  };

  static override TABS: any = {
    primary: {
      initial: "overview",
      labelPrefix: "GWORLD.SheetV2.Tab",
      tabs: [
        { id: "overview" },
        { id: "skills" },
        { id: "traits" },
        { id: "combat" },
        { id: "inventory" },
        { id: "journal" },
        { id: "progression" },
        { id: "magic" },
      ],
    },
  };

  protected override get sheetKind(): SheetKind {
    return "new";
  }

  /* ── context ─────────────────────────────────────────────────────────── */

  override async _prepareContext(options: object): Promise<Record<string, unknown>> {
    const context = (await super._prepareContext(options)) as Record<string, any>;
    const tabs = (context.tabs ?? {}) as Record<string, { label?: string }>;
    const active = this.tabGroups.primary ?? "overview";
    context.v2 = {
      tabLabel: tabs[active]?.label ?? "",
      points: pointBadge(context.derived?.points ?? {}),
      ...this.overviewContext(context),
    };
    return context;
  }

  /** The header's vitals and the Overview tab. */
  protected overviewContext(context: Record<string, any>): Record<string, unknown> {
    const actor = this.actor;
    const system = context.system;
    const derived = context.derived;
    const L = (key: string) => game.i18n.localize(key);

    const skills = [...actor.items]
      .filter((item: any) => item.type === "skill")
      .map((item: any) => ({
        id: String(item.id),
        name: String(item.name ?? ""),
        points: Number(item.system?.points ?? 0) || 0,
        level: item.system?.derived?.level ?? null,
        item,
      }));

    // What the character has in hand: the modes of equipped weapons. Bare
    // hands and natural attacks, which have no item, are listed only when
    // nothing is equipped -- the Combat tab lists every attack either way.
    const allAttacks = [
      ...(derived.melee ?? []).map((atk: any) => ({ atk, ranged: false })),
      ...(derived.ranged ?? []).map((atk: any) => ({ atk, ranged: true })),
    ].map((entry) => ({ ...entry, key: attackKey(entry.atk, entry.ranged) }));
    const inHand = allAttacks.filter((entry) => Boolean(actor.items.get(entry.atk.itemId)?.system?.equipped));
    const attacks = (inHand.length ? inHand : allAttacks.filter((entry) => !entry.atk.itemId)).sort((a, b) => byName(a.atk, b.atk));

    const locations = (derived.hitLocations ?? []) as Array<{ key: string; dr: number; splits: boolean }>;
    const status = String(derived.status ?? "healthy");
    const fatigue = String(derived.fatigue?.status ?? "fresh");

    const activeIds = [...(actor.statuses ?? [])] as string[];
    const statuses = CONDITIONS.map((c) => ({ id: c.id, label: L(c.label), img: c.img, active: activeIds.includes(c.id) }))
      .sort((a, b) => a.label.localeCompare(b.label));

    return {
      vitals: {
        hp: {
          value: system.hp.value,
          max: system.hp.max,
          percent: poolPercent(system.hp.value, system.hp.max),
          status,
          statusLabel: L(`GWORLD.Health.${status}`),
          hurt: status !== "healthy",
        },
        fp: {
          value: system.fp.value,
          max: system.fp.max,
          percent: poolPercent(system.fp.value, system.fp.max),
          status: fatigue,
          tired: fatigue !== "fresh",
          statusLabel: fatigue === "fresh" ? "" : L(fatigue === "veryTired" ? "GWORLD.Health.VeryTired" : `GWORLD.Health.${fatigue}`),
        },
        move: derived.move,
        basicMove: derived.basicMove,
        basicSpeed: derived.basicSpeed,
        thrust: derived.thrust,
        swing: derived.swing,
        posture: L(`GWORLD.Posture.${system.posture ?? "standing"}`),
        encumbrance: {
          label: L(`GWORLD.Encumbrance.${derived.encumbrance?.key ?? "none"}`),
          carried: derived.encumbrance?.carriedWeight ?? 0,
          basicLift: derived.basicLift,
          percent: loadPercent(derived.encumbrance?.carriedWeight, derived.basicLift),
          level: Number(derived.encumbrance?.level ?? 0),
        },
      },
      attacks,
      activeSkills: activeSkills(skills, system.pinnedSkills ?? []).map(({ skill, pinned }) => ({
        id: skill.id,
        name: skill.name,
        level: skill.level,
        rollable: skill.level !== null,
        attribute: skill.item.system?.attribute,
        pinned,
        bonusLines: skill.item.system?.derived?.bonusLines ?? [],
      })),
      dr: OVERVIEW_DR_LOCATIONS.map((key) => {
        const found = locations.find((l) => l.key === key);
        return { key, label: L(`GWORLD.HitLocation.${key}`), dr: found?.dr ?? 0, splits: found?.splits === true };
      }),
      statuses: {
        active: statuses.filter((s) => s.active),
        inactive: statuses.filter((s) => !s.active),
      },
      contextModifiers: contextModifiers({
        posture: String(system.posture ?? "standing"),
        postureEffects: POSTURE_EFFECTS[(system.posture ?? "standing") as keyof typeof POSTURE_EFFECTS] ?? { attack: 0, defense: 0 },
        encumbranceDodge: Number(derived.encumbrance?.dodgePenalty ?? 0) || 0,
        encumbranceKey: String(derived.encumbrance?.key ?? "none"),
        maneuver: String(system.maneuver ?? ""),
        attributePenalties: system.attributePenalties ?? {},
        timed: activeConditions(actor).map((c) => ({ label: c.label, modifiers: c.modifiers })),
        attackPenalties: { melee: derived.attackPenalties?.melee ?? [], ranged: derived.attackPenalties?.ranged ?? [] },
        layeringPenalty: Number(derived.armorNotes?.layeringPenalty ?? 0) || 0,
      }).map((line) => ({
        label: line.labelKey ? L(line.label) : line.label,
        appliesTo: line.appliesTo,
        value: line.value,
      })),
    };
  }

  /* ── rendering ───────────────────────────────────────────────────────── */

  override changeTab(tab: string, group: string, options: object = {}): void {
    super.changeTab(tab, group, options);
    if (group !== "primary") return;
    const label = this.element?.querySelector<HTMLElement>(`.v2-rail [data-tab="${tab}"] .v2-rail-label`)?.textContent ?? "";
    const title = this.element?.querySelector<HTMLElement>("[data-v2-tab-title]");
    if (title) title.textContent = label;
  }

  override async _onRender(context: object, options: object): Promise<void> {
    await super._onRender(context, options);
    this.wireListFilters();
    this.wireStatusPicker();
  }

  /**
   * Search boxes that narrow a list to the rows whose name contains what was
   * typed. Not form fields: a name here would be saved onto the actor. What
   * was typed is kept on the sheet so a redraw does not clear it.
   */
  protected wireListFilters(): void {
    for (const input of this.element.querySelectorAll<HTMLInputElement>("input[data-v2-filter]")) {
      const scope = input.dataset.v2Filter ?? "";
      const list = this.element.querySelector<HTMLElement>(`[data-v2-list="${scope}"]`);
      if (!list) continue;
      const apply = () => {
        const needle = input.value.trim().toLowerCase();
        this.filters.set(scope, input.value);
        for (const row of list.querySelectorAll<HTMLElement>("[data-v2-name]")) {
          row.hidden = needle.length > 0 && !String(row.dataset.v2Name ?? "").toLowerCase().includes(needle);
        }
        for (const group of list.querySelectorAll<HTMLElement>("[data-v2-group]")) {
          const rows = [...group.querySelectorAll<HTMLElement>("[data-v2-name]")];
          group.hidden = needle.length > 0 && rows.length > 0 && rows.every((r) => r.hidden);
        }
      };
      input.value = this.filters.get(scope) ?? "";
      input.addEventListener("input", apply);
      apply();
    }
  }

  /** What was typed into each list's search box, by list. */
  protected filters = new Map<string, string>();

  /** The Overview's picker for putting a condition on the character. */
  protected wireStatusPicker(): void {
    const picker = this.element.querySelector<HTMLSelectElement>("select[data-v2-add-status]");
    picker?.addEventListener("change", () => {
      const id = picker.value;
      if (id) void setCondition(this.actor, id, true);
    });
  }

  /* ── actions ─────────────────────────────────────────────────────────── */

  /** Pins a skill to the Overview, or unpins it. */
  static async #onPinSkill(this: GWorldCharacterSheetV2, _event: Event, target: HTMLElement) {
    const id = target.closest<HTMLElement>("[data-item-id]")?.dataset.itemId;
    if (!id || !this.isEditable) return;
    await this.actor.update({ "system.pinnedSkills": togglePinned(this.actor.system.pinnedSkills ?? [], id) });
  }

  /** Takes a condition off the character, or puts it on. */
  static async #onToggleStatus(this: GWorldCharacterSheetV2, _event: Event, target: HTMLElement) {
    const id = target.dataset.status;
    if (!id || !this.isEditable) return;
    await setCondition(this.actor, id, !this.actor.statuses?.has?.(id));
  }
}

/** A stable key for one attack mode, for selecting it on the sheet. */
export function attackKey(atk: { itemId?: unknown; modeIndex?: unknown; derivedMode?: unknown; name?: unknown }, ranged: boolean): string {
  return [ranged ? "r" : "m", String(atk.itemId ?? ""), String(atk.modeIndex ?? ""), String(atk.derivedMode ?? ""), String(atk.name ?? "")].join(":");
}
