/**
 * The vehicle sheet (GURPS Basic Set: Campaigns pp. 462-469), on the character
 * sheet's frame.
 *
 * Everything a vehicle could do used to hang off a row of somebody's Gear tab:
 * two unlabelled dice and a button, crammed in beside the name, with the
 * statistics readable only by opening the item. A car in a chase deserves
 * better, so it has a sheet of its own.
 *
 * Four tabs. Overview: its hit points and speed, the table's own columns, the
 * figures the legend says to work out from them, and the things that happen
 * to a vehicle in play -- a control roll and a shot at it. Crew: who is aboard,
 * which of them has the wheel, and somebody leaving it at speed. Specs: the
 * columns as fields. Notes: a line for the table and the description.
 */

import { SYSTEM_ID } from "../constants.js";
import { isRuleOn } from "../optional-rules.js";
import { controlVehicle, jumpOutOfVehicle, shootAtVehicle } from "../hazards.js";
import { promptForNumber } from "../roll.js";
import { promptForVehicleHit } from "./character-prompts.js";
import { damageAtScale, hitPointsAfterBattle } from "../damage-scale.js";
import type { DamageScale } from "../../rules/scale.js";
import { FRAGILITY_CODES, LOCOMOTIONS, activeMove, fragilityCodes, leaveSeat, operatorUuid, vehicleMoves } from "../../rules/vehicles.js";
import {
  aimableLocations, DR_LOCATIONS, MOVE_CRIPPLING_LOCATIONS, VEHICLE_ARCS, vehicleDrLabel,
} from "../../rules/vehicle-combat.js";
import { reportRefusedDrop } from "./drop-errors.js";

const { ActorSheetV2 } = foundry.applications.sheets;
const { HandlebarsApplicationMixin } = foundry.applications.api;

const TEMPLATE_ROOT = `systems/${SYSTEM_ID}/templates/actor`;
const VEHICLE_ROOT = `${TEMPLATE_ROOT}/vehicle`;

/** The picture a vehicle shows until somebody gives it one. */
const DEFAULT_IMAGE = "icons/svg/mystery-man.svg";

const L = (key: string, data?: Record<string, unknown>) =>
  data ? game.i18n.format(`GWORLD.Vehicle.${key}`, data) : game.i18n.localize(`GWORLD.Vehicle.${key}`);

/** An em dash, for a column the table leaves empty. */
const NOTHING = "—";

/**
 * The Hnd/SR tooltip: the lines that say why, less those a Move gave, which
 * the Move itself shows.
 */
function handlingHint(lines: unknown): { hint?: string } {
  const said = ((Array.isArray(lines) ? lines : []) as Array<{ label: string; stat?: string }>)
    .filter((line) => line.stat !== "acceleration" && line.stat !== "topSpeed")
    .map((line) => line.label);
  return said.length ? { hint: said.join("; ") } : {};
}

export class GWorldVehicleSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static override DEFAULT_OPTIONS = {
    // "v2" puts the character sheet's frame and components on it, as the
    // party sheet does; vehicle.css holds only what a vehicle adds.
    classes: ["gworld", "sheet", "actor", "vehicle", "v2"],
    position: { width: 860, height: 640 },
    window: { resizable: true },
    form: { submitOnChange: true, closeOnSubmit: false },
    actions: {
      controlVehicle: GWorldVehicleSheet.#onControl,
      shotAtVehicle: GWorldVehicleSheet.#onShotAt,
      jumpOut: GWorldVehicleSheet.#onJumpOut,
      takeTheWheel: GWorldVehicleSheet.#onTakeTheWheel,
      toggleStrappedIn: GWorldVehicleSheet.#onToggleStrappedIn,
      scaleDamage: GWorldVehicleSheet.#onScaleDamage,
      removeOccupant: GWorldVehicleSheet.#onRemoveOccupant,
      openOccupant: GWorldVehicleSheet.#onOpenOccupant,
    },
  };

  static override PARTS = {
    header: { template: `${VEHICLE_ROOT}/header.hbs` },
    nav: { template: `${TEMPLATE_ROOT}/v2/nav.hbs` },
    overview: { template: `${VEHICLE_ROOT}/tab-overview.hbs`, scrollable: [""] },
    crew: { template: `${VEHICLE_ROOT}/tab-crew.hbs`, scrollable: [""] },
    specs: { template: `${VEHICLE_ROOT}/tab-specs.hbs`, scrollable: [""] },
    journal: { template: `${VEHICLE_ROOT}/tab-journal.hbs`, scrollable: [""] },
  };

  static override TABS: any = {
    primary: {
      initial: "overview",
      labelPrefix: "GWORLD.Vehicle.Tab",
      tabs: [{ id: "overview" }, { id: "crew" }, { id: "specs" }, { id: "journal" }],
    },
  };

  static LIMITED_PARTS = {
    limited: { template: `${TEMPLATE_ROOT}/limited.hbs` },
  };

  override _configureRenderParts(options: object): Record<string, unknown> {
    if (this.document.limited) return foundry.utils.deepClone(GWorldVehicleSheet.LIMITED_PARTS);
    return super._configureRenderParts(options);
  }

  declare actor: any;

  /** Everyone aboard, resolved to actors, with the operator first. */
  async #occupants(): Promise<Array<Record<string, unknown>>> {
    const out: Array<Record<string, unknown>> = [];
    for (const seat of this.actor.system.crew ?? []) {
      const person: any = await fromUuid(seat.uuid).catch(() => null);
      if (!person) continue;
      out.push({
        uuid: seat.uuid,
        name: String(person.name ?? ""),
        img: String(person.img ?? ""),
        operator: seat.operator === true,
        strappedIn: seat.strappedIn === true,
        hp: person.system?.hp ?? null,
      });
    }
    // Whoever has the wheel is read first, because they are the one the
    // control roll and the vehicle's turn both belong to (p. 467).
    return out.sort((a, b) => Number(b.operator) - Number(a.operator));
  }

  override async _prepareContext(options: object): Promise<Record<string, unknown>> {
    const context = (await super._prepareContext(options)) as Record<string, unknown>;
    const actor = this.actor;
    const system = actor.system;
    const v = system.vehicle;
    const derived = system.derived ?? {};
    const tabs = (context.tabs ?? {}) as Record<string, { label?: string }>;
    const active = this.tabGroups.primary ?? "overview";
    const occupants = await this.#occupants();
    // Whoever has the wheel, a remote operator included (since API 1.154.0).
    const operator = await this.#operatorActor();
    const hpMax = Number(system.hp?.max) || 0;
    const hpValue = Number(system.hp?.value) || 0;

    return {
      ...context,
      actor,
      system,
      derived,
      img: String(actor.img || DEFAULT_IMAGE),
      editable: this.isEditable,
      isOwner: actor.isOwner,
      tabLabel: tabs[active]?.label ?? "",

      // The header's line: what it is, and what a GM would ask first.
      meta: [
        system.tl ? `TL ${system.tl}` : "",
        L(`Locomotion.${activeMove(v).locomotion}`),
        `SM ${v.sm >= 0 ? "+" : ""}${v.sm}`,
        v.skill ? v.skill : "",
      ].filter(Boolean),

      hpPercent: hpMax > 0 ? Math.max(0, Math.min(100, Math.round((hpValue / hpMax) * 100))) : 0,
      // Yards a second, doubled (p. 463), for a table that thinks in mph.
      speedMph: Math.round((Number(system.speed) || 0) * 2),
      dodge: derived.dodge ?? null,
      operatorName: operator ? String(operator.name) : "",
      specFields: this.#specFields(system),
      drFields: this.#drFields(system),
      drLocations: this.#drLocations(system),

      // The table's own columns, in the order the book prints them, so a GM
      // reading from the page can check the sheet line by line (p. 462).
      stats: [
        { label: L("StHp"), value: String(v.stHp) },
        {
          label: L("HandlingStability"),
          // As the rules read them now, where a module's state changed them (API 1.115.0).
          value: `${(derived.stats?.handling ?? v.handling) >= 0 ? "+" : ""}${derived.stats?.handling ?? v.handling}/${derived.stats?.stability ?? v.stability}`,
          ...handlingHint(derived.stats?.lines),
        },
        { label: L("Ht"), value: `${v.ht}${fragilityCodes(v.fragility).join("")}` },
        // Each Move it has, the second named by the way it moves (pp. 462-465).
        // The one in use as the rules read it now, with what changed it --
        // a crippled wheel, a module's state -- as its tooltip (API 1.134.0).
        ...vehicleMoves(v).map((move, index, moves) => {
          const inUse = index === (v.secondMoveInUse === true && moves[1] ? 1 : 0);
          const now = inUse && derived.stats?.move ? derived.stats.move : move;
          const why = inUse
            ? ((derived.stats?.lines ?? []) as Array<{ label: string; stat?: string }>)
                .filter((line) => line.stat === "acceleration" || line.stat === "topSpeed")
                .map((line) => line.label)
            : [];
          return {
            label: index === 0 ? L("Move") : L("SecondMove", { locomotion: L(`Locomotion.${move.locomotion}`) }),
            value: `${now.acceleration}/${now.topSpeed}${index === 0 && v.roadBound ? "*" : ""}`,
            ...(why.length ? { hint: why.join("; ") } : {}),
          };
        }),
        { label: L("LoadedWeightShort"), value: `${v.loadedWeight} t` },
        { label: L("LoadShort"), value: `${v.load} t` },
        { label: L("Sm"), value: v.sm >= 0 ? `+${v.sm}` : String(v.sm) },
        { label: L("Occ"), value: String(v.occupants) },
        // Both figures where the table splits it, "45/20" (p. 462).
        { label: L("Dr"), value: vehicleDrLabel(v) },
        { label: L("RangeShort"), value: v.range > 0 ? `${v.range} mi` : NOTHING },
        { label: L("Cost"), value: `$${system.cost}` },
        { label: L("LocationsShort"), value: String(v.locations) || NOTHING },
        // Only where it means something: a boat's draft, an aircraft's stall.
        ...(derived.medium === "water" && v.draft > 0
          ? [{ label: L("Draft"), value: `${v.draft} ft`, hint: L("DraftHint") }]
          : []),
        ...(derived.medium === "air" ? [{ label: L("Stall"), value: String(v.stall), hint: L("StallHint") }] : []),
      ],

      // What the legend says to work out from those columns (p. 463), which a
      // table otherwise does on paper every time it matters.
      figures: [
        { label: L("TopSpeedMph"), value: `${derived.topSpeedMph} mph` },
        { label: L("Cruising"), value: `${derived.cruisingSpeedMph} mph` },
        {
          label: L("Endurance"),
          value: derived.endurance === null ? NOTHING : L("Hours", { hours: derived.endurance }),
        },
        { label: L("CurbWeight"), value: `${derived.curbWeight} t` },
        { label: L("Cargo"), value: `${derived.cargoCapacity} t` },
        {
          label: L("SafeDeceleration"),
          value: L("YardsPerSecond", { yards: derived.safeDeceleration }),
        },
      ],

      // What a tank's numbers come to once the battle is being fought ten to
      // one (p. 470). Null for anything small enough not to need it.
      decadeScale: derived.decadeScale ?? null,

      // Which parts a shot can land on, off the Locations column (p. 554).
      hitLocations: ((derived.locations ?? []) as string[]).map((key) =>
        game.i18n.localize(`GWORLD.Vehicle.Location.${key}`),
      ),

      occupants,
      seats: derived.seats ?? { crew: 0, passengers: 0 },
      crowded: derived.crowded === true,
      // The parts it has that a hit can cripple and that change how it
      // moves, each with how many are crippled now (p. 555; API 1.134.0).
      crippledParts: MOVE_CRIPPLING_LOCATIONS
        .filter((location) => ((derived.locations ?? []) as string[]).includes(location) || Number(system.crippled?.[location]) > 0)
        .map((location) => ({
          name: `system.crippled.${location}`,
          label: game.i18n.localize(`GWORLD.Vehicle.Location.${location}`),
          value: Number(system.crippled?.[location]) || 0,
        })),
      wrecked: derived.wrecked === true,
      battered: derived.battered === true,

      rules: {
        vehicles: isRuleOn("vehicles"),
        vehicleManeuvers: isRuleOn("vehicleManeuvers"),
      },

      descriptionHTML: await foundry.applications.ux.TextEditor.implementation.enrichHTML(
        String(system.description ?? ""),
        { relativeTo: actor, secrets: actor.isOwner },
      ),
    };
  }

  /** Each part gets its own tab, or every section renders inactive and the body comes up blank. */
  override async _preparePartContext(partId: string, context: Record<string, any>, options: object): Promise<Record<string, any>> {
    const partContext = (await super._preparePartContext(partId, context, options)) as Record<string, any>;
    if (partContext.tabs && partId in partContext.tabs) partContext.tab = partContext.tabs[partId];
    return partContext;
  }

  /** The header's title follows the tab, without redrawing the sheet. */
  override changeTab(tab: string, group: string, options: object = {}): void {
    super.changeTab(tab, group, options);
    if (group !== "primary") return;
    const label = this.element?.querySelector<HTMLElement>(`.v2-rail [data-tab="${tab}"] .v2-rail-label`)?.textContent ?? "";
    const title = this.element?.querySelector<HTMLElement>("[data-v2-tab-title]");
    if (title) title.textContent = label;
  }

  /** The table's columns as fields, in the order the book prints them (pp. 462-465). */
  #specFields(system: any): Array<Record<string, unknown>> {
    const v = system.vehicle;
    const number = (key: string, name: string, value: unknown, extra: { min?: number; step?: number; hint?: string } = {}) => ({
      label: L(key),
      name,
      value,
      type: "number",
      min: extra.min ?? null,
      hasMin: extra.min !== undefined,
      step: extra.step ?? 1,
      hint: extra.hint ?? "",
    });
    const text = (key: string, name: string, value: unknown, hint = "") => ({ label: L(key), name, value, type: "text", hint });
    return [
      number("StHp", "system.vehicle.stHp", v.stHp, { min: 0 }),
      number("Handling", "system.vehicle.handling", v.handling),
      number("Stability", "system.vehicle.stability", v.stability, { min: 0 }),
      number("Ht", "system.vehicle.ht", v.ht, { min: 1 }),
      {
        // As many codes as the HT column gives: "fx" burns and blows up.
        label: L("Fragility"),
        hint: L("FragilityHint"),
        checks: FRAGILITY_CODES.map((key) => ({
          name: "system.vehicle.fragility",
          value: key,
          label: L(`FragilityChoice.${key}`),
          checked: fragilityCodes(v.fragility).includes(key),
        })),
      },
      number("Acceleration", "system.vehicle.acceleration", v.acceleration, { min: 0, step: 0.1 }),
      number("TopSpeed", "system.vehicle.topSpeed", v.topSpeed, { min: 0, step: 0.1 }),
      { label: L("RoadBound"), name: "system.vehicle.roadBound", value: v.roadBound === true, checkbox: true, hint: L("RoadBoundHint") },
      number("LoadedWeight", "system.vehicle.loadedWeight", v.loadedWeight, { min: 0, step: 0.01 }),
      number("Load", "system.vehicle.load", v.load, { min: 0, step: 0.01 }),
      number("Sm", "system.vehicle.sm", v.sm),
      text("Occupants", "system.vehicle.occupants", v.occupants),
      // The table's figure, and the front's where it prints two (p. 462).
      number("DrFront", "system.vehicle.dr", v.dr, { min: 0 }),
      number("Range", "system.vehicle.range", v.range, { min: 0 }),
      number("Cost", "system.cost", system.cost, { min: 0 }),
      text("Locations", "system.vehicle.locations", v.locations, L("LocationsHint")),
      text("Skill", "system.vehicle.skill", v.skill),
      {
        label: L("LocomotionLabel"),
        name: "system.vehicle.locomotion",
        options: LOCOMOTIONS.map((key) => ({ key, label: L(`Locomotion.${key}`), selected: v.locomotion === key })),
      },
      // A second way it moves with a Move of its own: an amphibian's water Move.
      {
        label: L("SecondLocomotion"),
        name: "system.vehicle.secondLocomotion",
        hint: L("SecondLocomotionHint"),
        options: (["", ...LOCOMOTIONS] as const).map((key) => ({
          key,
          label: key === "" ? L("SecondLocomotionNone") : L(`Locomotion.${key}`),
          selected: v.secondLocomotion === key,
        })),
      },
      number("SecondAcceleration", "system.vehicle.secondAcceleration", v.secondAcceleration, { min: 0, step: 0.1 }),
      number("SecondTopSpeed", "system.vehicle.secondTopSpeed", v.secondTopSpeed, { min: 0, step: 0.1 }),
      {
        label: L("SecondMoveInUse"),
        name: "system.vehicle.secondMoveInUse",
        value: v.secondMoveInUse === true,
        checkbox: true,
        hint: L("SecondMoveInUseHint"),
      },
      number("Draft", "system.vehicle.draft", v.draft, { min: 0, step: 0.1, hint: L("DraftHint") }),
      number("Stall", "system.vehicle.stall", v.stall, { min: 0, hint: L("StallHint") }),
      { label: "TL", name: "system.tl", value: system.tl, type: "text", hint: "" },
    ];
  }

  /**
   * DR by face (p. 462): each empty unless the vehicle gives it, with what an
   * empty one falls back to shown in its place.
   */
  #drFields(system: any): Array<Record<string, unknown>> {
    const v = system.vehicle;
    const main = Number(v.dr) || 0;
    const other = v.drOther ?? main;
    const field = (label: string, name: string, value: unknown, fallback: number) => ({
      label,
      name,
      value: value ?? "",
      placeholder: String(fallback),
    });
    return [
      field(L("DrOther"), "system.vehicle.drOther", v.drOther, main),
      field(L("DrTop"), "system.vehicle.drTop", v.drTop, other),
      field(L("DrUnderbody"), "system.vehicle.drUnderbody", v.drUnderbody, other),
    ];
  }

  /**
   * DR by location (pp. 462, 554-555), a row for each location this vehicle
   * has that can carry a DR of its own: the location's front (all round
   * unless its sides are given), its sides and rear, its top, and the arcs
   * it covers where that is fewer than all of them. Each figure is empty
   * unless given, with what an empty one falls back to shown in its place.
   */
  #drLocations(system: any): Array<Record<string, unknown>> {
    const v = system.vehicle;
    const main = Number(v.dr) || 0;
    const has = aimableLocations(system.derived?.locations ?? [], system.derived?.powered === true)
      .filter((key) => DR_LOCATIONS.includes(key));
    return has.map((key) => {
      const face = key === "largeWindow" || key === "smallWindow" ? Math.ceil(main / 2) : main;
      const front = v.drByLocation?.[key] ?? null;
      const other = v.drByLocationOther?.[key] ?? null;
      const arcs: string[] = v.drByLocationArcs?.[key] ?? [];
      return {
        key,
        label: game.i18n.localize(`GWORLD.Vehicle.Location.${key}`),
        // Front, sides and rear, top.
        faces: [
          { name: `system.vehicle.drByLocation.${key}`, value: front ?? "", placeholder: String(face) },
          { name: `system.vehicle.drByLocationOther.${key}`, value: other ?? "", placeholder: String(front ?? face) },
          {
            name: `system.vehicle.drByLocationTop.${key}`,
            value: v.drByLocationTop?.[key] ?? "",
            placeholder: String(other ?? front ?? face),
          },
        ],
        arcsName: `system.vehicle.drByLocationArcs.${key}`,
        arcs: VEHICLE_ARCS.map((arc) => ({
          key: arc,
          label: game.i18n.localize(`GWORLD.Vehicle.Arc.${arc}`),
          checked: arcs.includes(arc),
        })),
      };
    });
  }

  /**
   * Fields the sheet edits as checkboxes sharing one name. A form submits
   * nothing for such a group when no box is ticked, so unticking the last one
   * would leave the old value in place; each group the form carries is
   * supplied empty instead; where the boxes do come through, an unticked one
   * is a null in its place, and is dropped. The fragility codes are kept as
   * one string, "fx".
   */
  override _processFormData(event: SubmitEvent | null, form: HTMLFormElement, formData: any): object {
    const data = super._processFormData(event, form, formData) as Record<string, any>;
    const vehicle = data.system?.vehicle;
    if (!vehicle || typeof vehicle !== "object") return data;
    const ticked = (value: unknown): string[] =>
      (Array.isArray(value) ? value : [value]).filter((v): v is string => typeof v === "string" && v !== "");
    if (form.querySelector('input[type="checkbox"][name="system.vehicle.fragility"]')) {
      vehicle.fragility = fragilityCodes(ticked(vehicle.fragility).join("")).join("");
    }
    for (const key of DR_LOCATIONS) {
      if (!form.querySelector(`input[type="checkbox"][name="system.vehicle.drByLocationArcs.${key}"]`)) continue;
      vehicle.drByLocationArcs ??= {};
      vehicle.drByLocationArcs[key] = ticked(vehicle.drByLocationArcs[key]);
    }
    return data;
  }

  /**
   * Somebody dropped onto the sheet climbs aboard.
   *
   * The first person into an empty vehicle takes the wheel, because a car with
   * one person in it and nobody driving is not a state worth making the GM
   * click through to fix.
   */
  override async _onDropActor(event: DragEvent, person: any): Promise<unknown> {
    const uuid = String(person?.uuid ?? "");
    // A vehicle inside a vehicle is a tow, not a passenger, and this sheet has
    // nothing to say about it.
    if (!uuid || person.type === "vehicle" || !this.actor.isOwner) {
      return super._onDropActor(event, person);
    }

    const crew = [...(this.actor.system.crew ?? [])];
    if (crew.some((seat: { uuid: string }) => seat.uuid === uuid)) {
      ui.notifications?.info(L("AlreadyAboard", { name: String(person.name) }));
      return null;
    }
    crew.push({ uuid, operator: crew.length === 0, strappedIn: false });
    await this.actor.update({ "system.crew": crew });
    return null;
  }

  /**
   * Carries a weapon's damage down to the battle's scale, or this vehicle's
   * remaining hit points back up once it is over (p. 470).
   */
  static async #onScaleDamage(this: GWorldVehicleSheet) {
    const asked = await foundry.applications.api.DialogV2.prompt({
      window: { title: L("ScaleTitle") },
      content: `<div class="gworld" style="display:flex;flex-direction:column;gap:6px">
        <label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
          <span>${L("ScaleWhich")}</span>
          <select name="scale" style="width:150px">
            <option value="decade">${L("ScaleDecade")}</option>
            <option value="century">${L("ScaleCentury")}</option>
          </select>
        </label>
        <label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
          <span>${L("ScaleDamage")}</span>
          <input type="text" name="damage" value="6dx10" style="width:120px">
        </label>
        <label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
          <span>${L("ScaleRemaining")}</span>
          <input type="number" name="remaining" value="0" min="0" step="1" style="width:90px">
        </label>
      </div>`,
      ok: {
        label: game.i18n.localize("GWORLD.Chat.Roll"),
        callback: (_event: Event, button: HTMLElement) => {
          const form = button.closest<HTMLElement>(".application");
          return {
            scale: (form?.querySelector<HTMLSelectElement>('select[name="scale"]')?.value ?? "decade") as DamageScale,
            damage: form?.querySelector<HTMLInputElement>('input[name="damage"]')?.value ?? "",
            remaining: Number(form?.querySelector<HTMLInputElement>('input[name="remaining"]')?.value ?? 0) || 0,
          };
        },
      },
      rejectClose: false,
    });
    if (!asked || typeof asked !== "object") return;
    const { scale, damage, remaining } = asked as { scale: DamageScale; damage: string; remaining: number };

    const lines: string[] = [];
    const scaled = damageAtScale({ damage, scale });
    if (scaled) lines.push(game.i18n.format("GWORLD.Vehicle.ScaledDamage", { damage, scaled }));
    if (remaining > 0) {
      lines.push(game.i18n.format("GWORLD.Vehicle.ScaledBack", {
        remaining,
        full: hitPointsAfterBattle({ remaining, scale }),
      }));
    }
    if (lines.length === 0) return;
    await ChatMessage.implementation.create({
      speaker: ChatMessage.implementation.getSpeaker({ actor: this.actor }),
      style: CONST.CHAT_MESSAGE_STYLES.OTHER,
      content: `<div class="gworld gworld-chat"><div class="gc-head"><span class="gc-label">${L("ScaleTitle")}</span></div>
        <div class="gc-mods">${lines.map((l) => `<span class="gc-mod">${l}</span>`).join("")}</div></div>`,
    });
  }

  /** Buckles somebody in, or lets them loose (p. 469). */
  static async #onToggleStrappedIn(this: GWorldVehicleSheet, _event: Event, target: HTMLElement) {
    const uuid = target.dataset.uuid;
    if (!uuid || !this.actor.isOwner) return;
    const crew = (this.actor.system.crew ?? []).map((seat: { uuid: string; operator: boolean; strappedIn?: boolean }) => ({
      uuid: seat.uuid,
      operator: seat.operator === true,
      strappedIn: seat.uuid === uuid ? !(seat.strappedIn === true) : seat.strappedIn === true,
    }));
    await this.actor.update({ "system.crew": crew });
  }

  static async #onTakeTheWheel(this: GWorldVehicleSheet, _event: Event, target: HTMLElement) {
    const uuid = target.dataset.uuid;
    if (!uuid || !this.actor.isOwner) return;
    // One pair of hands on the wheel: taking it takes it from whoever had it.
    const crew = (this.actor.system.crew ?? []).map((seat: { uuid: string; strappedIn?: boolean }) => ({
      uuid: seat.uuid,
      operator: seat.uuid === uuid,
      strappedIn: seat.strappedIn === true,
    }));
    await this.actor.update({ "system.crew": crew });
  }

  static async #onRemoveOccupant(this: GWorldVehicleSheet, _event: Event, target: HTMLElement) {
    const uuid = target.dataset.uuid;
    if (!uuid || !this.actor.isOwner) return;
    await this.actor.update({ "system.crew": leaveSeat(this.actor.system.crew ?? [], uuid) });
  }

  static async #onOpenOccupant(this: GWorldVehicleSheet, _event: Event, target: HTMLElement) {
    const person: any = await fromUuid(String(target.dataset.uuid ?? "")).catch(() => null);
    await person?.sheet?.render(true);
  }

  /** The control roll, made by whoever has the wheel (Campaigns p. 466). */
  static async #onControl(this: GWorldVehicleSheet) {
    if (!isRuleOn("vehicles")) return;
    const operator = await this.#operatorActor();
    if (!operator) {
      ui.notifications?.warn(L("NobodyDriving"));
      return;
    }
    const modifier = await promptForNumber({
      title: game.i18n.localize("GWORLD.Hazard.Control"),
      label: game.i18n.localize("GWORLD.Chat.Modifier"),
      initial: 0,
    });
    if (modifier === null) return;
    await controlVehicle({ actor: operator, vehicle: this.actor, modifier });
  }

  /** Where a shot landed, and who inside caught something (pp. 554-555). */
  static async #onShotAt(this: GWorldVehicleSheet) {
    if (!isRuleOn("vehicles")) return;
    const system = this.actor.system;
    const asked = await promptForVehicleHit({
      aboard: (system.crew ?? []).length,
      locations: aimableLocations(system.derived?.locations ?? [], system.derived?.powered === true),
    });
    if (!asked) return;
    await shootAtVehicle({ actor: this.actor, vehicle: this.actor, ...asked });
  }

  /** Somebody leaving it at speed (p. 467). */
  static async #onJumpOut(this: GWorldVehicleSheet, _event: Event, target: HTMLElement) {
    if (!isRuleOn("vehicleManeuvers")) return;
    const uuid = String(target.dataset.uuid ?? "");
    const person: any = await fromUuid(uuid).catch(() => null);
    if (!person) return;
    // The speed it is going at now is what the collision is worked out from,
    // and the sheet already knows it -- but the table may say otherwise.
    const speed = await promptForNumber({
      title: game.i18n.localize("GWORLD.Hazard.JumpOut"),
      label: game.i18n.localize("GWORLD.Hazard.JumpSpeed"),
      initial: Math.round(Number(this.actor.system.speed) || 0),
    });
    if (speed === null) return;
    await jumpOutOfVehicle({ actor: person, vehicle: this.actor, speed });
    // Out is out: they are no longer aboard, whatever the landing did to them.
    if (this.actor.isOwner) {
      await this.actor.update({ "system.crew": leaveSeat(this.actor.system.crew ?? [], uuid) });
    }
  }

  /** Whoever has the wheel: one named to drive it from outside (since API 1.154.0), else the crew's operator. */
  async #operatorActor(): Promise<any> {
    const uuid = operatorUuid(this.actor.system, (id) => Boolean(fromUuidSync(id)));
    if (!uuid) return null;
    return fromUuid(uuid).catch(() => null);
  }

  /** A drop that fails says why, rather than doing nothing. */
  override async _onDrop(event: DragEvent): Promise<void> {
    await reportRefusedDrop(event, () => super._onDrop(event));
  }
}
