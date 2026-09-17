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
import { namedByPlayer } from "../picker-merge.js";
import { gearStatistics, weaponTablesOf } from "../sheet-v2/gear-statistics.js";
import { shotsEntryFor } from "../shots-entry.js";
import { fullLoad } from "../../rules/ammunition.js";
import { carriedAmmunitionFor, isAmmunition } from "../ammunition.js";
import { lacksSpecialty, traitDisplayName } from "../../rules/traits.js";
import { successChance } from "../sheet-v2/success-chance.js";
import { mechanicFallbackLabel, mechanicsOf } from "../sheet-v2/trait-mechanics.js";
import { previewAttack } from "../roll.js";
import { targetedTokens } from "../targets.js";
import { combatLog } from "../sheet-v2/combat-log.js";
import { effectiveCost, effectiveWeight } from "../data-extensions.js";
import { gearGroupOf } from "../gear-groups.js";
import { legalityNote } from "../legality.js";
import { isRuleOn } from "../optional-rules.js";
import { armorByArea, asGearSort, readiedItems, sortGear, type GearSort } from "../sheet-v2/inventory-view.js";
import {
  asProgressionMode,
  awardHistory,
  improvementRows,
  ledgerCategories,
  rowsForMode,
  type ProgressionMode,
} from "../sheet-v2/progression.js";
import { BASIC_SPEED_STEP } from "../../rules/attributes.js";
import type { SecondaryKey } from "../sheet-v2/improvements.js";
import {
  JOURNAL_KINDS,
  LINKABLE_DOCUMENTS,
  addLink,
  isJournalKind,
  kindForDrop,
  readLinks,
  removeLink,
  type JournalKind,
} from "../sheet-v2/journal-links.js";
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
      v2Location: GWorldCharacterSheetV2.#onLocation,
      v2ShowMessage: GWorldCharacterSheetV2.#onShowMessage,
      v2ToggleCarried: GWorldCharacterSheetV2.#onToggleCarried,
      v2GearSort: GWorldCharacterSheetV2.#onGearSort,
      v2Upgrade: GWorldCharacterSheetV2.#onUpgrade,
      v2ProgressionMode: GWorldCharacterSheetV2.#onProgressionMode,
      v2JournalPane: GWorldCharacterSheetV2.#onJournalPane,
      v2OpenLink: GWorldCharacterSheetV2.#onOpenLink,
      v2RemoveLink: GWorldCharacterSheetV2.#onRemoveLink,
      v2CreateEntry: GWorldCharacterSheetV2.#onCreateEntry,
      v2ShowLink: GWorldCharacterSheetV2.#onShowLink,
      v2ViewPortrait: GWorldCharacterSheetV2.#onViewPortrait,
      v2EditPortrait: GWorldCharacterSheetV2.#onEditPortrait,
    },
  };

  static override PARTS: any = {
    header: { template: `${V2_ROOT}/header.hbs` },
    nav: { template: `${V2_ROOT}/nav.hbs` },
    overview: { template: `${V2_ROOT}/tab-overview.hbs`, scrollable: [""] },
    skills: { template: `${V2_ROOT}/tab-skills.hbs`, scrollable: [".v2-list-col", ".v2-detail-col"] },
    traits: { template: `${V2_ROOT}/tab-traits.hbs`, scrollable: [".v2-list-col", ".v2-detail-col"] },
    combat: { template: `${V2_ROOT}/tab-combat.hbs`, scrollable: [""] },
    inventory: { template: `${V2_ROOT}/tab-inventory.hbs`, scrollable: [".v2-list-col", ".v2-detail-col"] },
    progression: { template: `${V2_ROOT}/tab-progression.hbs`, scrollable: [".v2-list-col", ".v2-detail-col"] },
    journal: { template: `${V2_ROOT}/tab-journal.hbs`, scrollable: ["", ".v2-journal-content"] },
    magic: { template: `${V2_ROOT}/tab-magic.hbs`, scrollable: [""] },
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
      combat: this.combatContext(context),
      inventory: await this.inventoryContext(context),
      progression: this.progressionContext(context, points.unspent),
      journal: await this.journalContext(context),
      folded: [...this.folded],
      opened: [...this.opened],
    };
    return context;
  }

  /* ── Combat ──────────────────────────────────────────────────────────── */

  protected combatContext(context: Record<string, any>): Record<string, unknown> {
    const actor = this.actor;
    const system = context.system;
    const derived = context.derived;
    const L = (key: string) => game.i18n.localize(key);

    // Every attack the character has, by name, each with what its roll will
    // take before any dialog asks for more.
    const entries = [
      ...(derived.melee ?? []).map((atk: any) => ({ atk, ranged: false })),
      ...(derived.ranged ?? []).map((atk: any) => ({ atk, ranged: true })),
    ].sort((a, b) => byName(a.atk, b.atk));

    const localize = (key: string, data?: Record<string, unknown>) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));
    const attacks = entries.map(({ atk, ranged }) => {
      const key = attackKey(atk, ranged);
      const item = atk.itemId ? actor.items.get(atk.itemId) ?? null : null;
      // The attack's row of the weapon table, for the preview: the column
      // heading over each figure. A natural attack has no item behind it.
      const table = gearStatistics({ type: "equipment", system: item?.system ?? {} }, [{ ...atk, ranged }], localize).tables[0];
      const strip = table ? { columns: table.columns, cells: table.rows[0] ?? [] } : null;
      const level = Number(atk.skillLevel);
      const hasSkill = atk.skillLevel !== null && atk.skillLevel !== undefined && Number.isFinite(level);
      const preview = hasSkill
        ? previewAttack(actor, {
            ranged,
            item,
            skillLevel: level,
            hitModifier: atk.hitModifier,
            damageType: atk.damageType,
            reach: atk.reach,
            weapon: ranged
              ? {
                  damageType: atk.damageType, accuracy: atk.accuracy, scopeBonus: atk.scopeBonus, rateOfFire: atk.rateOfFire,
                  recoil: atk.recoil, bulk: atk.bulk, projectiles: atk.projectiles, halfDamageRange: atk.halfDamageRange,
                  guidance: atk.guidance, maxRange: atk.maxRange, areaAttack: atk.areaAttack ? "1" : "",
                  coneMaxWidth: atk.coneMaxWidth, loaded: atk.shotsCapacity ? atk.shotsLoaded : "",
                }
              : {},
          })
        : null;
      const chance = preview ? successChance(preview.effective) : null;
      return {
        key,
        atk,
        ranged,
        strip,
        equipped: Boolean(item?.system?.equipped),
        preview,
        chance,
        // The bars of the 3d6 chart, scaled to the tallest total.
        bars: chance?.distribution.map((d) => ({ ...d, height: Math.round((d.ways / 27) * 100) })) ?? [],
      };
    });
    const state = this.stateOf("attacks");
    // An equipped weapon is the likelier one to be wanted first.
    const preferred = attacks.find((a) => a.equipped)?.key ?? attacks[0]?.key ?? null;
    const selected = selectedKey(attacks.map((a) => a.key), state.selected ?? preferred);
    state.selected = selected;

    const targets = targetedTokens();
    const locations = (derived.hitLocations ?? []).map((loc: any) => ({
      ...loc,
      label: L(`GWORLD.HitLocation.${loc.key}`),
    }));
    const locationState = this.stateOf("locations");
    const location = selectedKey(locations.map((l: any) => l.key), locationState.selected ?? "torso");
    locationState.selected = location;

    // The weapon tables as a character sheet prints them: every carried
    // weapon's modes under the book's column headings, a weapon with several
    // modes as a row of its own with the modes beneath it.
    const carriedWeapons = [...actor.items].filter((i: any) => ["equipment", "armor", "shield"].includes(i.type) && i.system?.carried !== false
      && ((i.system?.meleeModes?.length ?? 0) > 0 || (i.system?.rangedModes?.length ?? 0) > 0));
    const modesOf = (id: string) => entries.filter((e) => e.atk.itemId === id).map((e) => ({ ...e.atk, ranged: e.ranged }));
    const weaponTables = weaponTablesOf(carriedWeapons.map((item: any) => ({
      name: String(item.name ?? ""),
      tables: gearStatistics(item, modesOf(String(item.id)), localize).tables,
    })));

    return {
      attacks: attacks.map((a) => ({ ...a, selected: a.key === selected })),
      weaponTables,
      selected,
      target: targets.length === 1
        ? { name: String(targets[0]?.name ?? targets[0]?.document?.name ?? targets[0]?.actor?.name ?? ""), count: 1 }
        : { name: "", count: targets.length },
      status: {
        posture: L(`GWORLD.Posture.${system.posture ?? "standing"}`),
        maneuver: L(`GWORLD.Maneuver.${system.maneuver || "doNothing"}`),
        encumbrance: L(`GWORLD.Encumbrance.${derived.encumbrance?.key ?? "none"}`),
        encumbered: Number(derived.encumbrance?.level ?? 0) > 0,
        move: derived.move,
        reeling: derived.reeling === true,
      },
      locations: locations.map((l: any) => ({ ...l, selected: l.key === location })),
      location,
      log: combatLog(
        (game.messages?.contents ?? []).map((m: any) => ({
          id: String(m.id),
          speakerActor: m.speaker?.actor ?? null,
          flavor: m.flavor,
          content: m.content,
          timestamp: m.timestamp,
          rolls: m.rolls,
        })),
        String(actor.id),
      ).map((line) => ({ ...line, time: line.timestamp ? new Date(line.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "" })),
    };
  }

  /* ── Inventory ───────────────────────────────────────────────────────── */

  /** How the carried table is sorted, and which way. */
  protected gearSort: { sort: GearSort; descending: boolean } = { sort: "name", descending: false };

  protected async inventoryContext(context: Record<string, any>): Promise<Record<string, unknown>> {
    const actor = this.actor;
    const system = context.system;
    const derived = context.derived;
    const L = (key: string) => game.i18n.localize(key);
    const physical = [...actor.items].filter((i: any) => ["equipment", "armor", "shield"].includes(i.type));
    const armed = (item: any) => Boolean(item.system?.meleeModes?.length || item.system?.rangedModes?.length);
    const attacksOf = (id: string) => [
      ...(derived.melee ?? []).filter((a: any) => a.itemId === id).map((a: any) => ({ ...a, ranged: false })),
      ...(derived.ranged ?? []).filter((a: any) => a.itemId === id).map((a: any) => ({ ...a, ranged: true })),
    ];

    const sort = asGearSort(this.gearSort.sort);
    const carriedGroups = ((context.gearGroups ?? []) as Array<{ key: string; label: string; rows: any[] }>).map((group) => ({
      ...group,
      rows: sortGear(group.rows, sort, this.gearSort.descending).map((row) => ({ ...row, img: actor.items.get(row.id)?.img ?? "", canCarry: actor.items.get(row.id)?.type === "equipment", ammunition: isAmmunition(actor.items.get(row.id)) })),
    }));
    const stored = sortGear(((context.items?.stored ?? []) as any[]).map((item) => {
      const quantity = Number(item.system?.quantity ?? 1) || 1;
      return { id: String(item.id), name: String(item.name ?? ""), img: item.img ?? "", quantity, weight: effectiveWeight(item) * quantity, cost: effectiveCost(item) * quantity };
    }), sort, this.gearSort.descending);

    const details = await Promise.all(physical.map(async (item: any) => {
      const s = item.system ?? {};
      const locations = (s.locations ?? []) as string[];
      return {
        key: `item:${item.id}`,
        id: String(item.id),
        name: String(item.name ?? ""),
        img: item.img,
        type: item.type,
        typeLabel: L(`TYPES.Item.${item.type}`),
        groupLabel: L(`GWORLD.Gear.Group.${gearGroupOf(item)}`),
        quantity: Number(s.quantity ?? 1) || 1,
        weight: effectiveWeight(item),
        cost: effectiveCost(item),
        equipped: Boolean(s.equipped),
        carried: s.carried !== false,
        canCarry: item.type === "equipment",
        equippable: item.type !== "equipment" || armed(item),
        attacks: attacksOf(String(item.id)),
        // The table's row for it: what the book prints and the player looks for.
        stats: gearStatistics(item, attacksOf(String(item.id)), (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key))),
        dr: item.type === "armor" ? s.dr : null,
        coverage: item.type === "armor"
          ? (locations.length ? locations.map((l) => L(`GWORLD.HitLocation.${l}`)).join(", ") : L("GWORLD.Item.WholeBody"))
          : "",
        db: item.type === "shield" ? s.db : null,
        legality: legalityNote(s.lc ?? null),
        vehicle: s.category === "vehicle" && isRuleOn("vehicles"),
        // A weapon with a magazine loads from the rounds carried; a box of
        // rounds says how many it has left, and that count is edited here.
        ...(() => {
          const modes: any[] = Array.isArray(s.rangedModes) ? s.rangedModes : [];
          const loadModeIndex = isRuleOn("reloading")
            ? modes.findIndex((mode: any, index: number) => { const entry = shotsEntryFor(item, index, mode); return !entry.thrown && fullLoad(entry) > 0; })
            : -1;
          return {
            loadable: loadModeIndex >= 0,
            loadModeIndex: Math.max(0, loadModeIndex),
            fittingBoxes: loadModeIndex >= 0 ? carriedAmmunitionFor(actor, item, loadModeIndex).length : 0,
            isAmmunition: isAmmunition(item),
          };
        })(),
        descriptionHtml: await this.enriched(s.description, item),
        reference: s.reference ?? "",
      };
    }));

    const readied = readiedItems(physical.map((item: any) => ({
      id: String(item.id),
      name: String(item.name ?? ""),
      type: item.type,
      img: item.img,
      equipped: Boolean(item.system?.equipped),
      carried: item.system?.carried !== false,
      armed: armed(item),
      category: String(item.system?.category ?? ""),
      quantity: Number(item.system?.quantity ?? 1) || 1,
      weight: effectiveWeight(item),
      canCarry: item.type === "equipment",
    })));

    const areas = armorByArea(physical.filter((i: any) => i.type === "armor").map((item: any) => ({
      id: String(item.id),
      name: String(item.name ?? ""),
      dr: Number(item.system?.dr ?? 0) || 0,
      locations: (item.system?.locations ?? []) as string[],
      equipped: Boolean(item.system?.equipped),
    }))).map((area) => ({ ...area, label: L(`GWORLD.SheetV2.Area.${area.key}`) }));

    const state = this.stateOf("inventory");
    const keys = [...readied.map((r) => `item:${r.id}`), ...carriedGroups.flatMap((g) => g.rows.map((r: any) => `item:${r.id}`)), ...stored.map((r) => `item:${r.id}`)];
    const selected = selectedKey(keys, state.selected);
    state.selected = selected;
    const chipKeys = carriedGroups.map((g) => g.key);
    const chip = state.chip && ["all", "stored", ...chipKeys].includes(state.chip) ? state.chip : "all";
    state.chip = chip;

    return {
      strip: {
        carried: derived.encumbrance?.carriedWeight ?? 0,
        basicLift: derived.basicLift,
        tiers: context.encumbranceTiers ?? [],
        level: L(`GWORLD.Encumbrance.${derived.encumbrance?.key ?? "none"}`),
        encumbered: Number(derived.encumbrance?.level ?? 0) > 0,
        overloaded: derived.encumbrance?.overloaded === true,
        move: derived.move,
        dodge: derived.defenses?.dodge?.total ?? null,
        dodgePenalty: Number(derived.encumbrance?.dodgePenalty ?? 0) || 0,
        money: system.money,
      },
      areas,
      shields: physical.filter((i: any) => i.type === "shield" && i.system?.equipped).map((i: any) => ({ id: i.id, name: i.name, db: i.system?.db })),
      readied: readied.map((r) => ({ ...r, key: `item:${r.id}`, selected: `item:${r.id}` === selected })),
      carriedGroups,
      stored,
      details: details.map((d) => ({ ...d, selected: d.key === selected })),
      selected,
      chip,
      chips: [
        { key: "all", label: L("GWORLD.SheetV2.All"), active: chip === "all" },
        ...carriedGroups.map((g) => ({ key: g.key, label: L(g.label), count: g.rows.length, active: chip === g.key })),
        ...(stored.length ? [{ key: "stored", label: L("GWORLD.Gear.Stored"), count: stored.length, active: chip === "stored" }] : []),
      ],
      sort,
      descending: this.gearSort.descending,
      columns: (["name", "quantity", "weight", "cost"] as const).map((key) => ({
        key,
        label: L(`GWORLD.Column.${key === "name" ? "Item" : key === "quantity" ? "Qty" : key === "weight" ? "Weight" : "Cost"}`),
        active: key === sort,
        descending: key === sort && this.gearSort.descending,
      })),
    };
  }

  /**
   * Moving equipment between carried and stored by dragging a row onto the
   * other table. Only equipment has the flag; armour and shields are worn or
   * not, which Equip says.
   */
  protected wireGearDrag(): void {
    if (!this.isEditable) return;
    const type = "application/x-gworld-item-row";
    for (const row of this.element.querySelectorAll<HTMLElement>("[data-v2-draggable]")) {
      row.addEventListener("dragstart", (event) => {
        event.dataTransfer?.setData(type, String(row.dataset.itemId ?? ""));
        if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
      });
    }
    for (const zone of this.element.querySelectorAll<HTMLElement>("[data-v2-drop]")) {
      zone.addEventListener("dragover", (event) => {
        if (!event.dataTransfer?.types.includes(type)) return;
        event.preventDefault();
        zone.classList.add("v2-drop-over");
      });
      zone.addEventListener("dragleave", () => zone.classList.remove("v2-drop-over"));
      zone.addEventListener("drop", (event) => {
        const id = event.dataTransfer?.getData(type);
        zone.classList.remove("v2-drop-over");
        if (!id) return;
        // This drop is the sheet's own; Foundry's drop handling would read it as an item from elsewhere.
        event.preventDefault();
        event.stopPropagation();
        const item = this.actor.items.get(id);
        const carried = zone.dataset.v2Drop === "carried";
        if (item?.type === "equipment" && Boolean(item.system?.carried) !== carried) void item.update({ "system.carried": carried });
      });
    }
  }

  /* ── Progression ─────────────────────────────────────────────────────── */

  protected progressionContext(context: Record<string, any>, unspent: number): Record<string, unknown> {
    const actor = this.actor;
    const system = context.system;
    const derived = context.derived;
    const L = (key: string) => game.i18n.localize(key);
    const scoreOf = (attribute: string): number | null => {
      if (attribute === "Will") return Number(derived.will) || null;
      if (attribute === "Per") return Number(derived.per) || null;
      const value = derived.attributes?.[attribute] ?? system.attributes?.[attribute];
      return value === undefined ? null : Number(value);
    };

    const rows = improvementRows({
      unspent,
      attributes: (["ST", "DX", "IQ", "HT"] as const).map((key) => ({
        key,
        score: Number(system.attributes?.[key] ?? 10),
        cost: (Number(system.attributes?.[key] ?? 10) - 10) * (key === "DX" || key === "IQ" ? 20 : 10),
      })),
      secondaries: ((context.secondaryCells ?? []) as any[])
        .filter((cell) => cell.editable && ["hp", "will", "per", "fp", "basicMove", "basicSpeed"].includes(cell.key))
        .map((cell) => ({
          key: cell.key as SecondaryKey,
          label: cell.label,
          purchased: Number(cell.purchased) || 0,
          value: Number(cell.value) || 0,
          cost: Number(cell.cost) || 0,
        })),
      items: [...actor.items]
        .filter((i: any) => i.type === "skill" || i.type === "technique" || i.type === "spell")
        .map((item: any) => ({
          id: String(item.id),
          name: String(item.name ?? ""),
          type: item.type,
          attributeScore: item.type === "skill" ? scoreOf(String(item.system?.attribute ?? "DX")) : null,
          item,
        })),
      traits: [...actor.items]
        .filter((i: any) => i.type === "trait")
        .map((item: any) => ({
          id: String(item.id),
          name: String(item.name ?? ""),
          category: String(item.system?.category ?? ""),
          points: Number(item.system?.totalPoints ?? 0) || 0,
          trait: item,
        })),
      languages: [...actor.items]
        .filter((i: any) => i.type === "language")
        .map((item: any) => ({
          id: String(item.id),
          name: String(item.name ?? ""),
          spoken: String(item.system?.spoken ?? "none"),
          written: String(item.system?.written ?? "none"),
          isNative: item.system?.isNative === true,
          points: Number(item.system?.totalPoints ?? 0) || 0,
        })),
    });

    const state = this.stateOf("progression");
    const mode = asProgressionMode(this.progressionMode);
    const shown = rowsForMode(rows, mode);
    const chipKeys = ["all", ...new Set(shown.map((r) => r.category))];
    const chip = state.chip && chipKeys.includes(state.chip) ? state.chip : "all";
    state.chip = chip;
    const selected = selectedKey(shown.filter((r) => chip === "all" || r.category === chip).map((r) => r.key), state.selected);
    state.selected = selected;

    const points = derived.points ?? {};
    const stored = (system.points?.awards ?? []) as Array<{ points: number; note?: string; at?: number; session?: string }>;
    const history = awardHistory(stored);

    return {
      summary: {
        total: Number(points.available ?? 0),
        starting: Number(points.starting ?? 0),
        earned: Number(points.earned ?? 0),
        spent: Number(points.spent ?? 0),
        unspent,
        over: unspent < 0,
        overBy: unspent < 0 ? -unspent : 0,
        sessions: history.sessions,
        latestSession: history.latestSession,
      },
      categories: ledgerCategories(points).map((c) => ({
        ...c,
        label: L(`GWORLD.SheetV2.Ledger.${c.key}`),
        negative: c.points < 0,
        active: chip === c.key,
        offered: true,
        adds: this.progressionAdds(c.key, context),
      })),
      chip,
      modes: (["all", "affordable", "owned"] as const).map((key) => ({ key, label: L(`GWORLD.SheetV2.Mode.${key}`), active: key === mode })),
      rows: shown.map((row) => {
        const item = /^(item|trait|buyoff|language):/.test(row.key) ? actor.items.get(row.key.split(":")[1]) : null;
        return {
          ...row,
          selected: row.key === selected,
          after: unspent - row.improve.cost,
          // A language's step reads as its comprehension levels, and buying a
          // disadvantage off entirely reads as its removal.
          ...(row.key.startsWith("language:")
            ? {
                stepFrom: L(`GWORLD.Language.${["none", "broken", "accented", "native"][row.improve.from]}`),
                stepTo: L(`GWORLD.Language.${["none", "broken", "accented", "native"][row.improve.to]}`),
              }
            : row.kind === "buyoff" && row.improve.to === 0
              ? { stepFrom: `${row.invested} CP`, stepTo: L("GWORLD.SheetV2.Removed") }
              : {}),
          categoryLabel: L(`GWORLD.SheetV2.Ledger.${row.category}`),
          summary: item ? firstLine(item.system?.description) : L(`GWORLD.SheetV2.Explain.${row.category}`),
          attribute: item?.type === "skill" ? item.system?.attribute : null,
          difficulty: item?.system?.difficulty ?? null,
          hidden: chip !== "all" && row.category !== chip,
        };
      }),
      selected,
      history: history.rows.map((award) => ({
        ...award,
        when: award.at ? new Date(award.at).toLocaleDateString() : "",
      })),
    };
  }

  /**
   * The ways to buy something new in a category of the Progression tab: the
   * compendium picker, a new blank item, or a template. Each is one of the
   * sheet's own actions, so it works as it does on the tab it belongs to.
   */
  protected progressionAdds(category: string, context: Record<string, any>): Array<Record<string, string>> {
    const L = (key: string) => game.i18n.localize(key);
    // Each Add opens the list of what the books offer, and can make one of its
    // own from what is typed there.
    const add = (itemTypes: string, browseTitle: string, label: string, customCategory = "") =>
      ({ action: "browseCompendium", itemTypes, categories: customCategory, browseTitle, customType: itemTypes, customCategory, label: L(label), icon: "plus" });
    const create = (itemType: string, label: string, itemCategory = "") =>
      ({ action: "createItem", itemType, itemCategory, label: L(label), icon: "plus" });
    switch (category) {
      case "advantages":
        return [add("trait", "GWORLD.Picker.AdvantagesOnly", "GWORLD.Action.AddAdvantage", "advantage"), add("trait", "GWORLD.Picker.Perks", "GWORLD.SheetV2.AddPerk", "perk")];
      case "disadvantages":
        return [add("trait", "GWORLD.Picker.DisadvantagesOnly", "GWORLD.Action.AddDisadvantage", "disadvantage")];
      case "quirks":
        return [add("trait", "GWORLD.Picker.Quirks", "GWORLD.Action.AddQuirk", "quirk")];
      case "skills":
        return [add("skill", "GWORLD.Picker.SkillsOnly", "GWORLD.Action.AddSkill")];
      case "techniques":
        return [add("technique", "GWORLD.Picker.Techniques", "GWORLD.Action.AddTechnique")];
      case "spells":
        return context.rules?.magic ? [add("spell", "GWORLD.Picker.Spells", "GWORLD.Action.AddSpell")] : [];
      case "languages":
        return [create("language", "GWORLD.Action.AddLanguage")];
      case "templates":
        return [{ action: "applyTemplate", label: L("GWORLD.Template.Apply"), icon: "plus" }];
      default:
        return [];
    }
  }

  /** Which improvements the Progression tab lists. */
  protected progressionMode: ProgressionMode = "all";

  /* ── Journal ─────────────────────────────────────────────────────────── */

  /** Which pane of the Journal tab is open: a kind of link, or the profile. */
  protected journalPane: JournalKind | "profile" = "quest";

  /**
   * The Journal tab. The text lives in Foundry's journal, with its own
   * permissions; each linked document's pages are enriched and shown in
   * place, for whoever may see them. A link to a document that is gone is
   * shown as missing, to be removed.
   */
  protected async journalContext(context: Record<string, any>): Promise<Record<string, unknown>> {
    const actor = this.actor;
    const L = (key: string) => game.i18n.localize(key);
    const user = game.user;
    const links = readLinks(context.system.journalLinks);

    const entries = await Promise.all(links.map(async (link) => {
      const document: any = await fromUuid(link.uuid).catch(() => null);
      const base = { uuid: link.uuid, kind: link.kind, key: `link:${link.uuid}` };
      if (!document) return { ...base, name: L("GWORLD.SheetV2.MissingLink"), missing: true, visible: false, pages: [], summary: "" };
      const visible = document.testUserPermission ? document.testUserPermission(user, "OBSERVER") : true;
      const name = String(document.name ?? "");
      if (!visible) return { ...base, name, missing: false, visible: false, pages: [], summary: "" };

      const enrich = (html: unknown) => foundry.applications.ux.TextEditor.implementation.enrichHTML(String(html ?? ""), {
        relativeTo: document,
        secrets: document.isOwner === true,
      });
      const pageOf = async (page: any) => ({
        name: String(page.name ?? ""),
        type: page.type,
        html: page.type === "text" ? await enrich(page.text?.content) : "",
        src: page.type === "image" ? page.src : "",
        caption: page.image?.caption ?? "",
        showTitle: page.title?.show !== false,
      });
      let pages: Array<{ name: string; type: string; html: string; src: string; caption: string; showTitle: boolean }> = [];
      let img = "";
      if (document.documentName === "JournalEntry") {
        const visiblePages = [...(document.pages ?? [])]
          .filter((p: any) => !p.testUserPermission || p.testUserPermission(user, "OBSERVER"))
          .sort((a: any, b: any) => (a.sort ?? 0) - (b.sort ?? 0));
        pages = await Promise.all(visiblePages.map(pageOf));
      } else if (document.documentName === "JournalEntryPage") {
        pages = [await pageOf(document)];
      } else if (document.documentName === "Actor") {
        img = document.img ?? "";
        const text = document.system?.details?.description || document.system?.details?.biography || "";
        pages = text ? [{ name: "", type: "text", html: await enrich(text), src: "", caption: "", showTitle: false }] : [];
      } else if (document.documentName === "Scene") {
        img = document.thumb ?? document.background?.src ?? "";
      }
      const first = pages.find((p) => p.html)?.html ?? "";
      return {
        ...base,
        name,
        img,
        documentType: L(`DOCUMENT.${document.documentName}`),
        missing: false,
        visible: true,
        pages,
        summary: firstLine(first),
      };
    }));

    const panes = JOURNAL_KINDS.map((kind) => {
      const list = entries.filter((e) => e.kind === kind).sort(byName);
      const state = this.stateOf(`journal-${kind}`);
      const selected = selectedKey(list.map((e) => e.key), state.selected);
      state.selected = selected;
      return {
        kind,
        label: L(`GWORLD.SheetV2.Journal.${kind}`),
        empty: L(`GWORLD.SheetV2.Journal.Empty.${kind}`),
        active: this.journalPane === kind,
        entries: list.map((e) => ({ ...e, selected: e.key === selected })),
        selected,
      };
    });

    return {
      pane: this.journalPane,
      panes,
      profileActive: this.journalPane === "profile",
      kinds: JOURNAL_KINDS.map((kind) => ({ key: kind, label: L(`GWORLD.SheetV2.Journal.${kind}`) })),
      related: panes.map((p) => ({ kind: p.kind, label: p.label, entries: p.entries })),
      canCreate: Boolean(user?.can?.("JOURNAL_CREATE")) && this.isEditable,
      npcDescription: actor.type === "npc"
        ? await foundry.applications.ux.TextEditor.implementation.enrichHTML(String(actor.system?.details?.description ?? ""), { relativeTo: actor, secrets: actor.isOwner })
        : null,
    };
  }

  /**
   * Links a journal entry, a page, an actor or a scene dropped on the sheet,
   * as the kind of thing the Journal tab is showing where it landed. Items and
   * everything else are the classic sheet's to handle.
   */
  async _onDropDocument(event: DragEvent, document: any): Promise<any> {
    const name = String(document?.documentName ?? "");
    const onJournal = Boolean((event.target as HTMLElement | null)?.closest?.('[data-tab="journal"]'));
    const linkable = (LINKABLE_DOCUMENTS as readonly string[]).includes(name);
    if (!linkable || (!onJournal && name !== "JournalEntry" && name !== "JournalEntryPage")) {
      // Foundry's own handling, which the types this project declares do not describe.
      return (GWorldCharacterSheet.prototype as any)._onDropDocument.call(this, event, document);
    }
    if (!this.isEditable) return null;
    const where = (event.target as HTMLElement | null)?.closest?.<HTMLElement>("[data-v2-journal-kind]")?.dataset.v2JournalKind;
    const kind = isJournalKind(where) ? where : kindForDrop(name, this.journalPane);
    await this.actor.update({ "system.journalLinks": addLink(readLinks(this.actor.system.journalLinks), document.uuid, kind) });
    this.journalPane = kind;
    this.stateOf(`journal-${kind}`).selected = `link:${document.uuid}`;
    return document;
  }

  /** A link's kind changed from its select, saved as it is chosen. */
  protected wireJournalKinds(): void {
    for (const select of this.element.querySelectorAll<HTMLSelectElement>("select[data-v2-link-kind]")) {
      select.addEventListener("change", () => {
        const uuid = select.dataset.v2LinkKind ?? "";
        if (!uuid || !isJournalKind(select.value) || !this.isEditable) return;
        this.journalPane = select.value;
        this.stateOf(`journal-${select.value}`).selected = `link:${uuid}`;
        void this.actor.update({ "system.journalLinks": addLink(readLinks(this.actor.system.journalLinks), uuid, select.value) });
      });
    }
  }

  /* ── keeping the Combat tab current ──────────────────────────────────── */

  /** Hooks this sheet listens to while it is open, to take off again when it closes. */
  #hooks: Array<[string, number]> = [];

  /** A redraw asked for by something outside the actor, gathered up so a burst of them draws once. */
  #redrawTimer: ReturnType<typeof setTimeout> | null = null;
  #redrawSoon(): void {
    if (this.#redrawTimer) clearTimeout(this.#redrawTimer);
    this.#redrawTimer = setTimeout(() => {
      this.#redrawTimer = null;
      if ((this as any).rendered) void this.render();
    }, 150);
  }

  override async _onFirstRender(context: object, options: object): Promise<void> {
    await super._onFirstRender(context, options);
    // The attack preview reads the targets, and the combat log the chat: both
    // change without the actor changing, which is all a sheet redraws for.
    const on = (hook: string, fn: (...args: any[]) => void) => this.#hooks.push([hook, Hooks.on(hook, fn)]);
    on("targetToken", (user: any) => {
      if (user?.id === game.user?.id) this.#redrawSoon();
    });
    const logged = (message: any) => {
      if (message?.speaker?.actor === this.actor.id) this.#redrawSoon();
    };
    on("createChatMessage", logged);
    on("deleteChatMessage", logged);
    // A linked journal page changing redraws the Journal tab.
    on("updateJournalEntryPage", (page: any) => {
      const links = (this.actor.system?.journalLinks ?? []) as Array<{ uuid: string }>;
      if (links.some((l) => l.uuid === page?.uuid || l.uuid === page?.parent?.uuid)) this.#redrawSoon();
    });
  }

  override async _onClose(options: object): Promise<void> {
    await super._onClose(options);
    for (const [hook, id] of this.#hooks) Hooks.off(hook, id);
    this.#hooks = [];
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

  /** Folds that start shut and have been opened. */
  protected opened = new Set<string>();

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
      browseCategories: key,
      browseTitle: key === "advantage" ? "GWORLD.Picker.AdvantagesOnly" : key === "perk" ? "GWORLD.Picker.Perks" : key === "disadvantage" ? "GWORLD.Picker.DisadvantagesOnly" : "GWORLD.Picker.Quirks",
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
        // What the trait is of, where the book makes the player say, shown
        // with the name as the book writes it.
        displayName: traitDisplayName(String(item.name ?? ""), String(system.specialty ?? "")),
        needsSpecialty: Boolean(system.needsSpecialty),
        specialty: String(system.specialty ?? ""),
        lacksSpecialty: lacksSpecialty(system),
        // A quirk's or a perk's name is the player's to write in the panel.
        playerNamed: namedByPlayer(item),
        namePlaceholder: L(category === "quirk" || category === "perk" ? `GWORLD.Builder.NamePlaceholder.${category}` : "GWORLD.Builder.NamePlaceholder.trait"),
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
    this.wireGearDrag();
    this.wireJournalKinds();
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
        // A fold that starts shut remembers being opened; one that starts
        // open remembers being shut.
        if (fold.dataset.v2Default === "closed") {
          if (fold.open) this.opened.add(key);
          else this.opened.delete(key);
        } else if (fold.open) this.folded.delete(key);
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
    for (const part of this.element.querySelectorAll<HTMLElement>(`[data-v2-chip-only^="${list}:"]`)) {
      const key = String(part.dataset.v2ChipOnly ?? "").slice(list.length + 1);
      part.classList.toggle("v2-off", key !== chip);
    }
    // The detail panel follows the chip: a selected row the chip hid gives way
    // to the first row still shown.
    const rows = [...this.element.querySelectorAll<HTMLElement>(`[data-v2-row^="${list}:"]`)];
    const shown = (row: HTMLElement) => !row.closest(".v2-off") && !row.hidden;
    const current = rows.find((row) => row.dataset.v2Row === `${list}:${this.stateOf(list).selected}`);
    if (current && shown(current)) return;
    const first = rows.find(shown);
    if (first) this.showSelected(list, String(first.dataset.v2Row).slice(list.length + 1));
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

  /** Highlights a hit location on the body outline and in the table. */
  static #onLocation(this: GWorldCharacterSheetV2, _event: Event, target: HTMLElement) {
    const key = target.closest<HTMLElement>("[data-v2-location]")?.dataset.v2Location;
    if (!key) return;
    this.stateOf("locations").selected = key;
    for (const el of this.element.querySelectorAll<HTMLElement | SVGElement>("[data-v2-location]")) {
      el.classList.toggle("selected", el.dataset.v2Location === key);
    }
  }

  /** Scrolls the chat log to a message the combat log lists, and opens the chat if it is closed. */
  static #onShowMessage(this: GWorldCharacterSheetV2, _event: Event, target: HTMLElement) {
    const id = target.closest<HTMLElement>("[data-message-id]")?.dataset.messageId;
    if (!id) return;
    const sidebar: any = (ui as any).sidebar;
    sidebar?.expand?.();
    sidebar?.changeTab?.("chat", "primary");
    const card = document.querySelector<HTMLElement>(`#chat .chat-log [data-message-id="${id}"], .chat-log [data-message-id="${id}"]`);
    if (!card) return;
    card.scrollIntoView({ block: "center", behavior: "smooth" });
    card.classList.add("gworld-flash");
    setTimeout(() => card.classList.remove("gworld-flash"), 1600);
  }

  /** Moves a piece of equipment into the pack or out of it. */
  static async #onToggleCarried(this: GWorldCharacterSheetV2, _event: Event, target: HTMLElement) {
    const item = this.itemFrom(target);
    if (!item || item.type !== "equipment" || !this.isEditable) return;
    await item.update({ "system.carried": !item.system.carried });
  }

  /** Sorts the carried and stored tables by a column, or flips the order of the one in force. */
  static #onGearSort(this: GWorldCharacterSheetV2, _event: Event, target: HTMLElement) {
    const sort = asGearSort(target.dataset.v2GearSort);
    this.gearSort = sort === this.gearSort.sort
      ? { sort, descending: !this.gearSort.descending }
      : { sort, descending: false };
    void this.render();
  }

  /**
   * Buys the next step of an improvement: a point of an attribute, a level of
   * a secondary characteristic, a skill's next level, a trait's next level.
   * Through the same steps the other tabs use, so the cost charged is the
   * cost shown.
   *
   * Never refused for want of points: a GM may allow it, and a character
   * being built is over and under by turns. An upgrade that leaves the
   * character over budget says so.
   */
  static async #onUpgrade(this: GWorldCharacterSheetV2, _event: Event, target: HTMLElement) {
    if (!this.isEditable) return;
    const [kind, ...rest] = String(target.dataset.v2Upgrade ?? "").split(":");
    const id = rest.join(",");
    const actor = this.actor;
    if (kind === "attribute" && id && ["ST", "DX", "IQ", "HT"].includes(id)) {
      await actor.update({ [`system.attributes.${id}`]: Number(actor.system.attributes?.[id] ?? 10) + 1 });
    } else if (kind === "secondary" && id && ["hp", "will", "per", "fp", "basicMove", "basicSpeed"].includes(id)) {
      const step = id === "basicSpeed" ? BASIC_SPEED_STEP : 1;
      await actor.update({ [`system.purchased.${id}`]: Number(actor.system.purchased?.[id] ?? 0) + step });
    } else if (kind === "item" && id) {
      const item = actor.items.get(id);
      if (item) await this.stepPoints(item, "up");
    } else if (kind === "trait" && id) {
      const item = actor.items.get(id);
      if (item) await this.stepLevels(item, "up");
    } else if (kind === "buyoff" && id) {
      // A levelled disadvantage loses a level; anything else goes, once confirmed.
      const item = actor.items.get(id);
      if (!item) return;
      const levels = Number(item.system?.levels ?? 0) || 0;
      if (isLevelled(item) && levels > 1) {
        await this.stepLevels(item, "down");
      } else {
        const confirmed = await foundry.applications.api.DialogV2.confirm({
          window: { title: game.i18n.localize("GWORLD.SheetV2.BuyOffTitle") },
          content: `<p>${game.i18n.format("GWORLD.SheetV2.BuyOffConfirm", { name: foundry.utils.escapeHTML(String(item.name ?? "")), points: -Number(item.system?.totalPoints ?? 0) })}</p>`,
        });
        if (!confirmed) return;
        await item.delete();
      }
    } else if (kind === "language" && id) {
      const [itemId, aspect] = id.split(",");
      const item = itemId ? actor.items.get(itemId) : null;
      if (!item || (aspect !== "spoken" && aspect !== "written")) return;
      const levels = ["none", "broken", "accented", "native"];
      const at = levels.indexOf(String(item.system?.[aspect] ?? "none"));
      if (at < 0 || at >= levels.length - 1) return;
      await item.update({ [`system.${aspect}`]: levels[at + 1] });
    } else {
      return;
    }
    const unspent = Number(actor.system?.derived?.points?.unspent ?? 0);
    if (unspent < 0) {
      ui.notifications?.warn(game.i18n.format("GWORLD.SheetV2.OverBudgetNotice", { name: actor.name, points: -unspent }));
    }
  }

  /** Lists every improvement, those within the budget, or those already bought into. */
  static #onProgressionMode(this: GWorldCharacterSheetV2, _event: Event, target: HTMLElement) {
    this.progressionMode = asProgressionMode(target.dataset.v2Mode);
    void this.render();
  }

  /** Opens a pane of the Journal tab, in place. */
  static #onJournalPane(this: GWorldCharacterSheetV2, _event: Event, target: HTMLElement) {
    this.showJournalPane(String(target.dataset.v2Pane ?? ""));
  }

  /** Shows one pane of the Journal tab and hides the rest. */
  protected showJournalPane(pane: string): void {
    if (pane !== "profile" && !isJournalKind(pane)) return;
    this.journalPane = pane;
    for (const button of this.element.querySelectorAll<HTMLElement>("[data-v2-pane]")) {
      const on = button.dataset.v2Pane === pane;
      button.classList.toggle("active", on);
      button.setAttribute("aria-pressed", on ? "true" : "false");
    }
    for (const section of this.element.querySelectorAll<HTMLElement>("[data-v2-journal-pane]")) {
      section.hidden = section.dataset.v2JournalPane !== pane;
    }
  }

  /** Opens a linked document on its own sheet. */
  static async #onOpenLink(this: GWorldCharacterSheetV2, _event: Event, target: HTMLElement) {
    const uuid = target.closest<HTMLElement>("[data-v2-uuid]")?.dataset.v2Uuid;
    if (!uuid) return;
    const document: any = await fromUuid(uuid).catch(() => null);
    if (!document) return;
    if (document.documentName === "JournalEntryPage") {
      document.parent?.sheet?.render({ force: true, pageId: document.id });
      return;
    }
    if (document.documentName === "Scene") {
      document.sheet?.render({ force: true });
      return;
    }
    document.sheet?.render({ force: true });
  }

  /** Takes a link off the character. The document itself is left alone. */
  static async #onRemoveLink(this: GWorldCharacterSheetV2, _event: Event, target: HTMLElement) {
    const uuid = target.closest<HTMLElement>("[data-v2-uuid]")?.dataset.v2Uuid;
    if (!uuid || !this.isEditable) return;
    await this.actor.update({ "system.journalLinks": removeLink(readLinks(this.actor.system.journalLinks), uuid) });
  }

  /**
   * Makes a journal entry for this character -- a quest, a clue, a note --
   * owned by whoever made it, links it, and opens it to be written.
   */
  static async #onCreateEntry(this: GWorldCharacterSheetV2, _event: Event, target: HTMLElement) {
    const kind = target.dataset.v2JournalKind;
    if (!isJournalKind(kind) || !this.isEditable || !game.user?.can?.("JOURNAL_CREATE")) return;
    const label = game.i18n.localize(`GWORLD.SheetV2.Journal.New.${kind}`);
    const JournalEntry = (globalThis as any).JournalEntry;
    const entry = await JournalEntry.implementation.create({
      name: `${this.actor.name}: ${label}`,
      ownership: { default: 0, [game.user.id]: 3 },
      pages: [{ name: label, type: "text", text: { content: "" } }],
    });
    if (!entry) return;
    this.journalPane = kind;
    this.stateOf(`journal-${kind}`).selected = `link:${entry.uuid}`;
    await this.actor.update({ "system.journalLinks": addLink(readLinks(this.actor.system.journalLinks), entry.uuid, kind) });
    entry.sheet?.render({ force: true });
  }

  /** Shows a related link in its own pane. */
  static #onShowLink(this: GWorldCharacterSheetV2, _event: Event, target: HTMLElement) {
    const kind = target.dataset.v2JournalKind;
    const uuid = target.dataset.v2Uuid;
    if (!isJournalKind(kind) || !uuid) return;
    this.showJournalPane(kind);
    this.showSelected(`journal-${kind}`, `link:${uuid}`);
  }

  /** Opens the character's portrait full size, where a GM can show it to the players. */
  static #onViewPortrait(this: GWorldCharacterSheetV2) {
    const actor = this.actor;
    new (foundry.applications.apps as any).ImagePopout({
      src: String(actor.img || "icons/svg/mystery-man.svg"),
      uuid: actor.uuid,
      window: { title: String(actor.name ?? "") },
    }).render({ force: true });
  }

  /**
   * Picks a new portrait. Foundry's own editImage action needs the <img>
   * itself as the target, and this one is a button.
   */
  static async #onEditPortrait(this: GWorldCharacterSheetV2) {
    if (!this.isEditable) return;
    const actor = this.actor;
    const fp = new foundry.applications.apps.FilePicker.implementation({
      current: String(actor._source?.img ?? actor.img ?? ""),
      type: "image",
      callback: (path: string) => {
        void actor.update({ img: path });
      },
    });
    await fp.browse();
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
