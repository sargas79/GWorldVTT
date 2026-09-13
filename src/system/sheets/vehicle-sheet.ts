/**
 * The vehicle sheet: one pane, no tabs (GURPS Basic Set: Campaigns pp. 462-469).
 *
 * Everything a vehicle could do used to hang off a row of somebody's Gear tab:
 * two unlabelled dice and a button, crammed in beside the name, with the
 * statistics readable only by opening the item. A car in a chase deserves
 * better, so it has a sheet of its own.
 *
 * What is on it: the table's own columns, the figures the legend says to work
 * out from them, who is aboard and which of them has the wheel, and the three
 * things that happen to a vehicle in play -- a control roll, a shot at it, and
 * somebody leaving it at speed.
 */

import { SYSTEM_ID } from "../constants.js";
import { isRuleOn } from "../optional-rules.js";
import { controlVehicle, jumpOutOfVehicle, shootAtVehicle } from "../hazards.js";
import { promptForNumber } from "../roll.js";
import { LOCOMOTIONS, leaveSeat } from "../../rules/vehicles.js";

const { ActorSheetV2 } = foundry.applications.sheets;
const { HandlebarsApplicationMixin } = foundry.applications.api;

const TEMPLATE_ROOT = `systems/${SYSTEM_ID}/templates/actor`;

const L = (key: string, data?: Record<string, unknown>) =>
  data ? game.i18n.format(`GWORLD.Vehicle.${key}`, data) : game.i18n.localize(`GWORLD.Vehicle.${key}`);

/** An em dash, for a column the table leaves empty. */
const NOTHING = "—";

/** How much damage got through, and how many people are inside to catch it. */
async function promptForHit(aboard: number): Promise<{ penetrating: number; occupants: number } | null> {
  const result = await foundry.applications.api.DialogV2.prompt({
    window: { title: L("ShotAt") },
    content: `<div class="gworld" style="display:flex;flex-direction:column;gap:6px">
      <label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <span>${L("Penetrating")}</span>
        <input type="number" name="damage" value="0" min="0" step="1" style="width:90px">
      </label>
      <label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <span>${L("Aboard")}</span>
        <input type="number" name="occupants" value="${Math.max(1, aboard)}" min="0" step="1" style="width:90px">
      </label>
      <p class="ihint" style="margin:0">${L("ShotAtHint")}</p>
    </div>`,
    ok: {
      label: game.i18n.localize("GWORLD.Chat.Roll"),
      callback: (_event: Event, button: HTMLElement) => {
        const form = button.closest<HTMLElement>(".application");
        const num = (name: string) =>
          Number(form?.querySelector<HTMLInputElement>(`input[name="${name}"]`)?.value ?? 0) || 0;
        return { penetrating: num("damage"), occupants: num("occupants") };
      },
    },
    rejectClose: false,
  });
  return result && typeof result === "object" ? (result as never) : null;
}

export class GWorldVehicleSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static override DEFAULT_OPTIONS = {
    classes: ["gworld", "sheet", "actor", "vehicle"],
    position: { width: 560, height: "auto" },
    window: { resizable: true },
    form: { submitOnChange: true, closeOnSubmit: false },
    actions: {
      controlVehicle: GWorldVehicleSheet.#onControl,
      shotAtVehicle: GWorldVehicleSheet.#onShotAt,
      jumpOut: GWorldVehicleSheet.#onJumpOut,
      takeTheWheel: GWorldVehicleSheet.#onTakeTheWheel,
      removeOccupant: GWorldVehicleSheet.#onRemoveOccupant,
      openOccupant: GWorldVehicleSheet.#onOpenOccupant,
    },
  };

  static override PARTS = {
    sheet: { template: `${TEMPLATE_ROOT}/vehicle-sheet.hbs`, scrollable: [".ibody"] },
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

    return {
      ...context,
      actor,
      system,
      derived,
      editable: this.isEditable,
      isOwner: actor.isOwner,

      // The table's own columns, in the order the book prints them, so a GM
      // reading from the page can check the sheet line by line (p. 462).
      stats: [
        { label: L("StHp"), value: String(v.stHp) },
        {
          label: L("HandlingStability"),
          value: `${v.handling >= 0 ? "+" : ""}${v.handling}/${v.stability}`,
        },
        { label: L("Ht"), value: v.fragility ? `${v.ht}${v.fragility}` : String(v.ht) },
        {
          label: L("Move"),
          value: `${v.acceleration}/${v.topSpeed}${v.roadBound ? "*" : ""}`,
        },
        { label: L("LoadedWeightShort"), value: `${v.loadedWeight} t` },
        { label: L("LoadShort"), value: `${v.load} t` },
        { label: L("Sm"), value: v.sm >= 0 ? `+${v.sm}` : String(v.sm) },
        { label: L("Occ"), value: String(v.occupants) },
        { label: L("Dr"), value: String(v.dr) },
        { label: L("RangeShort"), value: v.range > 0 ? `${v.range} mi` : NOTHING },
        { label: L("Cost"), value: `$${system.cost}` },
        { label: L("LocationsShort"), value: String(v.locations) || NOTHING },
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

      // Only where it means something: a boat's draft, an aircraft's stall.
      draft: derived.medium === "water" && v.draft > 0 ? v.draft : null,
      stall: derived.medium === "air" ? v.stall : null,

      locomotions: LOCOMOTIONS.map((key) => ({
        key,
        label: L(`Locomotion.${key}`),
        selected: v.locomotion === key,
      })),
      fragilities: (["", "c", "f", "x"] as const).map((key) => ({
        key,
        label: L(`FragilityChoice.${key === "" ? "none" : key}`),
        selected: v.fragility === key,
      })),

      // Which parts a shot can land on, off the Locations column (p. 554).
      hitLocations: ((derived.locations ?? []) as string[]).map((key) =>
        game.i18n.localize(`GWORLD.Vehicle.Location.${key}`),
      ),

      occupants: await this.#occupants(),
      seats: derived.seats ?? { crew: 0, passengers: 0 },
      crowded: derived.crowded === true,
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
    crew.push({ uuid, operator: crew.length === 0 });
    await this.actor.update({ "system.crew": crew });
    return null;
  }

  static async #onTakeTheWheel(this: GWorldVehicleSheet, _event: Event, target: HTMLElement) {
    const uuid = target.dataset.uuid;
    if (!uuid || !this.actor.isOwner) return;
    // One pair of hands on the wheel: taking it takes it from whoever had it.
    const crew = (this.actor.system.crew ?? []).map((seat: { uuid: string }) => ({
      uuid: seat.uuid,
      operator: seat.uuid === uuid,
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
    const asked = await promptForHit((this.actor.system.crew ?? []).length);
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

  async #operatorActor(): Promise<any> {
    const seat = (this.actor.system.crew ?? []).find((s: { operator: boolean }) => s.operator);
    if (!seat) return null;
    return fromUuid(seat.uuid).catch(() => null);
  }
}
