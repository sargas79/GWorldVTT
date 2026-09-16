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
import { SKILL_GROUP_ORDER } from "../skill-groups.js";
import { techniqueDefaultLabel } from "../item-summary.js";
import { isOpenTechniqueData } from "../open-techniques.js";
import { isReadTrait } from "../../rules/trait-effects.js";
import { weaknessOf } from "../../rules/weakness.js";
import { traitLevelName } from "../../rules/traits.js";
import { asSortMode, firstLine, groupRows, selectedKey, sortRows, type SortMode } from "../sheet-v2/list-view.js";
import { isLevelled, itemImprovement, traitImprovement } from "../sheet-v2/improvements.js";
import { successChance } from "../sheet-v2/success-chance.js";
import { mechanicFallbackLabel, mechanicsOf } from "../sheet-v2/trait-mechanics.js";
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
      v2Select: GWorldCharacterSheetV2.#onSelect,
      v2Chip: GWorldCharacterSheetV2.#onChip,
    },
  };

  static override PARTS: any = {
    header: { template: `${V2_ROOT}/header.hbs` },
    nav: { template: `${V2_ROOT}/nav.hbs` },
    overview: { template: `${V2_ROOT}/tab-overview.hbs`, scrollable: [""] },
    skills: { template: `${V2_ROOT}/tab-skills.hbs`, scrollable: [".v2-list-col", ".v2-detail-col"] },
    traits: { template: `${V2_ROOT}/tab-traits.hbs`, scrollable: [".v2-list-col", ".v2-detail-col"] },
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
    const points = pointBadge(context.derived?.points ?? {});
    context.v2 = {
      tabLabel: tabs[active]?.label ?? "",
      points,
      ...this.overviewContext(context),
      skills: await this.skillsContext(context, points.unspent),
      traits: await this.traitsContext(context, points.unspent),
    };
    return context;
  }

  /* ── view state ──────────────────────────────────────────────────────── */

  /**
   * Each list's view state: the row its detail panel shows, the chip it is
   * filtered to, and how it is sorted. On the sheet, not the actor: how
   * somebody is reading a list is not a fact about the character, and every
   * edit redraws the sheet.
   */
  protected listState = new Map<string, { selected?: string | null; chip?: string; sort?: SortMode }>();

  /** Groups folded shut, as "<list>:<group>". */
  protected folded = new Set<string>();

  protected stateOf(list: string) {
    if (!this.listState.has(list)) this.listState.set(list, {});
    return this.listState.get(list)!;
  }

  /** An item's description with its links and rolls live: the prose modules bring included. */
  protected async enriched(html: unknown, relativeTo: any): Promise<string> {
    const text = String(html ?? "");
    if (!text.trim()) return "";
    return foundry.applications.ux.TextEditor.implementation.enrichHTML(text, {
      relativeTo,
      secrets: this.actor.isOwner,
    });
  }

  /** The chips a list offers, with the one in force marked. */
  protected chips(list: string, entries: Array<{ key: string; label: string; count?: number }>) {
    const state = this.stateOf(list);
    const keys = entries.map((e) => e.key);
    const active = state.chip && keys.includes(state.chip) ? state.chip : "all";
    state.chip = active;
    return entries.map((e) => ({ ...e, active: e.key === active }));
  }

  /* ── Skills ──────────────────────────────────────────────────────────── */

  protected async skillsContext(context: Record<string, any>, unspent: number): Promise<Record<string, unknown>> {
    const actor = this.actor;
    const derived = context.derived;
    const L = (key: string) => game.i18n.localize(key);
    const state = this.stateOf("skills");
    const sort = asSortMode(state.sort);
    state.sort = sort;
    const pinned = new Set<string>(context.system.pinnedSkills ?? []);
    const scoreOf = (attribute: string): number | null => {
      if (attribute === "Will") return Number(derived.will) || null;
      if (attribute === "Per") return Number(derived.per) || null;
      const value = derived.attributes?.[attribute] ?? context.system.attributes?.[attribute];
      return value === undefined ? null : Number(value);
    };

    const skillRows = await Promise.all([...actor.items].filter((i: any) => i.type === "skill").map(async (item: any) => {
      const system = item.system ?? {};
      const level = system.derived?.level ?? null;
      const points = Number(system.points ?? 0) || 0;
      const attribute = String(system.attribute ?? "DX");
      return {
        key: `skill:${item.id}`,
        id: String(item.id),
        item,
        kind: "skill",
        name: String(item.name ?? ""),
        group: attribute,
        attribute,
        difficulty: system.difficulty,
        techLevel: system.techLevel,
        points,
        level,
        trained: points > 0,
        rollable: level !== null && (points > 0 || system.derived?.hasDefault === true),
        pinned: pinned.has(String(item.id)),
        summary: firstLine(system.description),
        descriptionHtml: await this.enriched(system.description, item),
        reference: system.reference ?? "",
        bonusLines: system.derived?.bonusLines ?? [],
        talentBonus: Number(system.derived?.talentBonus ?? 0) || 0,
        toolBonus: Number(system.derived?.toolBonus ?? 0) || 0,
        chance: level === null ? null : successChance(level),
        improve: itemImprovement(item, unspent, scoreOf(attribute)),
      };
    }));

    const techniqueRows = await Promise.all([...actor.items].filter((i: any) => i.type === "technique").map(async (item: any) => {
      const system = item.system ?? {};
      const level = system.derived?.level ?? null;
      return {
        key: `technique:${item.id}`,
        id: String(item.id),
        item,
        kind: "technique",
        name: String(item.name ?? ""),
        group: "techniques",
        attribute: "",
        difficulty: system.difficulty,
        techLevel: "",
        points: Number(system.points ?? 0) || 0,
        level,
        trained: true,
        rollable: level !== null,
        pinned: false,
        open: isOpenTechniqueData(item),
        defaultLabel: techniqueDefaultLabel({
          from: system.derived?.defaultFrom ?? system.defaultFrom ?? "skill",
          skill: system.derived?.defaultSkill ?? system.prerequisite ?? "",
          modifier: Number(system.derived?.defaultModifier ?? system.defaultModifier) || 0,
        }),
        kindLabel: system.derived?.kindLabel ?? "",
        summary: firstLine(system.description),
        descriptionHtml: await this.enriched(system.description, item),
        reference: system.reference ?? "",
        bonusLines: [],
        talentBonus: 0,
        toolBonus: 0,
        chance: level === null ? null : successChance(level),
        improve: itemImprovement(item, unspent),
      };
    }));

    const groups = groupRows(sortRows([...skillRows, ...techniqueRows], sort), (row) => row.group, [...SKILL_GROUP_ORDER, "techniques"])
      .map((group) => ({
        key: group.key,
        label: group.key === "techniques" ? L("GWORLD.Section.Techniques") : game.i18n.format("GWORLD.SheetV2.BasedOn", { attribute: group.key }),
        score: group.key === "techniques" ? null : scoreOf(group.key),
        open: !this.folded.has(`skills:${group.key}`),
        points: group.rows.reduce((sum, row) => sum + row.points, 0),
        rows: group.rows,
      }));

    const all = groups.flatMap((g) => g.rows);
    const selected = selectedKey(all.map((r) => r.key), state.selected);
    state.selected = selected;

    return {
      sort,
      sorts: (["name", "level", "points"] as const).map((key) => ({ key, label: L(`GWORLD.SheetV2.Sort.${key}`), selected: key === sort })),
      chips: this.chips("skills", [
        { key: "all", label: L("GWORLD.SheetV2.All") },
        ...groups.map((g) => ({ key: g.key, label: g.key === "techniques" ? L("GWORLD.Section.Techniques") : g.key, count: g.rows.length })),
        { key: "languages", label: L("GWORLD.Section.Languages") },
      ]),
      groups,
      rows: all.map((row) => ({ ...row, selected: row.key === selected })),
      selected,
      chip: state.chip,
      trainedCount: skillRows.filter((r) => r.trained).length,
      points: Number(derived.points?.skills ?? 0) + Number(derived.points?.techniques ?? 0),
    };
  }

  /* ── Traits ──────────────────────────────────────────────────────────── */

  protected async traitsContext(context: Record<string, any>, unspent: number): Promise<Record<string, unknown>> {
    const actor = this.actor;
    const L = (key: string) => game.i18n.localize(key);
    const state = this.stateOf("traits");
    const order = ["advantage", "perk", "disadvantage", "quirk"];
    const browse = (key: string) => ({
      browseCategories: key === "advantage" || key === "perk" ? "advantage,perk" : key === "disadvantage" ? "disadvantage,quirk" : "quirk",
      browseTitle: key === "advantage" || key === "perk" ? "GWORLD.Picker.Advantages" : key === "disadvantage" ? "GWORLD.Picker.Disadvantages" : "GWORLD.Picker.Quirks",
    });

    const rows = await Promise.all([...actor.items].filter((i: any) => i.type === "trait").map(async (item: any) => {
      const system = item.system ?? {};
      const category = order.includes(system.category) ? system.category : "advantage";
      const total = Number(system.totalPoints ?? system.points ?? 0) || 0;
      const levels = Number(system.levels ?? 0) || 0;
      const mechanics = mechanicsOf({
        name: String(item.name ?? ""),
        levels,
        modifiers: (system.modifiers ?? []).map((m: any) => String(m?.name ?? "")),
      }).map((m) => {
        const key = `GWORLD.SheetV2.Effect.${m.path}`;
        return { label: game.i18n.has(key) ? L(key) : mechanicFallbackLabel(m.path), value: m.value, numeric: typeof m.value === "number" };
      });
      return {
        key: `trait:${item.id}`,
        id: String(item.id),
        item,
        name: String(item.name ?? ""),
        category,
        categoryLabel: L(`GWORLD.SheetV2.Category.${category}`),
        points: total,
        negative: total < 0,
        levelled: isLevelled(item),
        levels,
        levelName: traitLevelName(system.levelNames ?? [], levels) ?? system.levelName ?? null,
        modifiers: system.modifiers ?? [],
        reactionModifier: Number(system.reactionModifier ?? 0) || 0,
        selfControl: system.selfControl ?? null,
        weakness: weaknessOf({ name: String(item.name ?? "") }) !== null,
        applied: isReadTrait(String(item.name ?? ""), system.talentSkills ?? []),
        mechanics,
        summary: firstLine(system.description),
        descriptionHtml: await this.enriched(system.description, item),
        reference: system.reference ?? "",
        improve: traitImprovement(item, unspent),
      };
    }));

    const grouped = groupRows(sortRows(rows, "name"), (row) => row.category, order);
    // Every category is listed, with its add buttons, even with nothing in it yet.
    const groups = order.map((key) => {
      const found = grouped.find((g) => g.key === key)?.rows ?? [];
      return {
        key,
        label: L(`GWORLD.SheetV2.Categories.${key}`),
        open: !this.folded.has(`traits:${key}`),
        total: found.reduce((sum, row) => sum + row.points, 0),
        negative: key === "disadvantage" || key === "quirk",
        ...browse(key),
        rows: found,
      };
    });

    const all = groups.flatMap((g) => g.rows);
    const selected = selectedKey(all.map((r) => r.key), state.selected);
    state.selected = selected;
    const points = context.derived?.points ?? {};
    const sum = (key: string) => groups.find((g) => g.key === key)?.total ?? 0;

    return {
      chips: this.chips("traits", [
        { key: "all", label: L("GWORLD.SheetV2.All") },
        ...groups.map((g) => ({ key: g.key, label: g.label, count: g.rows.length })),
        { key: "templates", label: L("GWORLD.Template.Title") },
      ]),
      groups,
      rows: all.map((row) => ({ ...row, selected: row.key === selected })),
      selected,
      chip: state.chip,
      summary: {
        advantages: sum("advantage"),
        perks: sum("perk"),
        disadvantages: sum("disadvantage"),
        quirks: sum("quirk"),
        total: Number(points.spent ?? 0),
        disadvantageTotal: Number(points.disadvantageTotal ?? 0),
        disadvantageLimit: Number(points.disadvantageLimit ?? 0),
        overLimit: Number(points.disadvantageTotal ?? 0) > Number(points.disadvantageLimit ?? 0),
      },
    };
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
    this.wireListControls();
  }

  /**
   * The sort selects and group folds of the list tabs. A sort redraws the
   * list; a fold is remembered so the redraw after an edit keeps it.
   */
  protected wireListControls(): void {
    for (const select of this.element.querySelectorAll<HTMLSelectElement>("select[data-v2-sort]")) {
      select.addEventListener("change", () => {
        this.stateOf(select.dataset.v2Sort ?? "").sort = asSortMode(select.value);
        void this.render();
      });
    }
    for (const fold of this.element.querySelectorAll<HTMLDetailsElement>("details[data-v2-fold]")) {
      fold.addEventListener("toggle", () => {
        const key = fold.dataset.v2Fold ?? "";
        if (fold.open) this.folded.delete(key);
        else this.folded.add(key);
      });
    }
  }

  /**
   * Shows the detail panel of the row selected in a list, and marks the row.
   * Done in place rather than by redrawing: every panel is already rendered,
   * so choosing a row is instant and nothing typed elsewhere is lost.
   */
  protected showSelected(list: string, key: string): void {
    this.stateOf(list).selected = key;
    for (const row of this.element.querySelectorAll<HTMLElement>(`[data-v2-row^="${list}:"]`)) {
      const on = row.dataset.v2Row === `${list}:${key}`;
      row.classList.toggle("selected", on);
      row.setAttribute("aria-selected", on ? "true" : "false");
    }
    for (const panel of this.element.querySelectorAll<HTMLElement>(`[data-v2-detail^="${list}:"]`)) {
      panel.hidden = panel.dataset.v2Detail !== `${list}:${key}`;
    }
  }

  /** Narrows a list to one group, in place. */
  protected showChip(list: string, chip: string): void {
    this.stateOf(list).chip = chip;
    for (const button of this.element.querySelectorAll<HTMLElement>(`[data-v2-chip^="${list}:"]`)) {
      const on = button.dataset.v2Chip === `${list}:${chip}`;
      button.classList.toggle("active", on);
      button.setAttribute("aria-pressed", on ? "true" : "false");
    }
    for (const group of this.element.querySelectorAll<HTMLElement>(`[data-v2-chip-group^="${list}:"]`)) {
      const key = String(group.dataset.v2ChipGroup ?? "").slice(list.length + 1);
      group.classList.toggle("v2-off", chip !== "all" && key !== chip);
    }
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

  /** Shows a list row's detail panel. */
  static #onSelect(this: GWorldCharacterSheetV2, _event: Event, target: HTMLElement) {
    const [list, ...rest] = String(target.closest<HTMLElement>("[data-v2-row]")?.dataset.v2Row ?? "").split(":");
    if (!list || rest.length === 0) return;
    this.showSelected(list, rest.join(":"));
  }

  /** Narrows a list to one of its groups, or shows them all. */
  static #onChip(this: GWorldCharacterSheetV2, _event: Event, target: HTMLElement) {
    const [list, chip] = String(target.dataset.v2Chip ?? "").split(":");
    if (!list || !chip) return;
    this.showChip(list, chip);
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
