/**
 * The Vehicle Actor data model (GURPS Basic Set: Campaigns pp. 462-469).
 *
 * A vehicle is two things in this system, and this is the second of them. The
 * first is an entry in the equipment catalogue: what a car costs, what it
 * weighs, what you get for the money. That belongs on a character's Gear tab
 * and stays there.
 *
 * This is the car itself, on the road: it has hit points that come off when
 * somebody shoots it, people inside it who catch what comes through, an
 * operator whose turn it moves on, and a speed it is going at now. None of
 * that fits in a row of a shopping list, which is why it has a sheet.
 *
 * The statistics are the same fields the catalogue entry carries, so a vehicle
 * put on the road from an item arrives complete and the rules read one shape
 * either way.
 */

import { vehicleStatFields } from "./items.js";
import {
  cargoCapacity, cruisingSpeedMph, curbWeight, endurance, fragilityCodes,
  occupants, safeDecelerationPerTurn, vehicleMoves, type Locomotion,
} from "../../rules/vehicles.js";
import { locationsOf, mediumOf, type VehicleLocation } from "../../rules/vehicle-combat.js";
import { scaleScore, vehicleDodge } from "../../rules/scale.js";
import { normalizeSkillName } from "../../rules/skills.js";
import { afterPrepare, extensionsField } from "../data-extensions.js";
import { vehicleStats } from "../vehicle-stats.js";

const fields = foundry.data.fields;

/** Somebody aboard: the actor, whether they are driving, and whether they are strapped in. */
export interface Occupant {
  uuid: string;
  operator: boolean;
  strappedIn: boolean;
}

/**
 * The operator's level in the skill this vehicle names, or null when they do
 * not have it.
 *
 * Read off the driver's own sheet rather than asked for, because the vehicle
 * already knows which skill it takes and the driver already knows how good
 * they are at it.
 */
function controlSkillOf(driver: any, skillName: string): number | null {
  const wanted = normalizeSkillName(String(skillName ?? ""));
  if (!wanted) return null;
  for (const item of driver?.items ?? []) {
    if (item.type !== "skill") continue;
    if (normalizeSkillName(String(item.name ?? "")) !== wanted) continue;
    const level = Number(item.system?.derived?.level);
    return Number.isFinite(level) ? level : null;
  }
  return null;
}

export class VehicleData extends foundry.abstract.TypeDataModel {
  declare vehicle: {
    stHp: number; handling: number; stability: number; ht: number;
    fragility: string;
    acceleration: number; topSpeed: number; loadedWeight: number; load: number;
    sm: number; occupants: string; dr: number; range: number; skill: string;
    drOther: number | null; drTop: number | null; drUnderbody: number | null;
    drByLocation: Partial<Record<VehicleLocation, number | null>>;
    drByLocationOther: Partial<Record<VehicleLocation, number | null>>;
    drByLocationTop: Partial<Record<VehicleLocation, number | null>>;
    drByLocationArcs: Partial<Record<VehicleLocation, string[]>>;
    locations: string; locomotion: Locomotion; roadBound: boolean;
    secondLocomotion: "" | Locomotion; secondAcceleration: number; secondTopSpeed: number;
    secondMoveInUse: boolean;
    draft: number; stall: number;
  };
  declare hp: { value: number; max: number };
  declare speed: number;
  declare crew: Occupant[];
  declare tl: string;
  declare cost: number;
  declare notes: string;
  declare description: string;
  declare derived: Record<string, unknown>;

  static override defineSchema() {
    return {
      /** Fields add-on modules keep on the vehicle, one object per module. */
      extensions: extensionsField("Actor"),
      description: new fields.HTMLField({ required: true, blank: true, initial: "" }),
      /** A line for the table: what it is doing here, who owns it, where it is kept. */
      notes: new fields.StringField({ required: true, blank: true, initial: "" }),
      tl: new fields.StringField({ required: true, blank: true, initial: "" }),
      cost: new fields.NumberField({ required: true, nullable: false, initial: 0, min: 0 }),

      vehicle: new fields.SchemaField(vehicleStatFields()),

      /**
       * Hit points as an actor keeps them, so the token bar works and damage
       * lands the ordinary way.
       *
       * The maximum is the ST/HP column and is written over every time the
       * sheet is prepared -- two figures for one fact drift apart. It is in
       * the schema all the same, because Foundry finds a token's bars by
       * looking for a value-and-maximum pair there: a maximum that only ever
       * existed after preparation left a car on the map with no health bar
       * at all.
       */
      hp: new fields.SchemaField({
        value: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 10 }),
        max: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 10 }),
      }),

      /**
       * How fast it is going now, in yards a second. The rules that matter --
       * a collision, somebody jumping out, how far it skids -- all ask for
       * this rather than for Top Speed.
       */
      speed: new fields.NumberField({ required: true, nullable: false, initial: 0, min: 0 }),

      /**
       * Who is aboard, by actor UUID, and which of them has the wheel. The
       * operator is the one whose turn the vehicle moves on (p. 467) and the
       * one whose skill the control roll is made against.
       */
      crew: new fields.ArrayField(
        new fields.SchemaField({
          uuid: new fields.StringField({ required: true, blank: false }),
          operator: new fields.BooleanField({ initial: false }),
          /**
           * "Occupants who are free to move (not strapped in, etc.) may dodge
           * attacks specifically targeted on them" (p. 469) -- so a seatbelt
           * is a defense given up.
           */
          strappedIn: new fields.BooleanField({ initial: false }),
        }),
        { required: true, initial: [] },
      ),
    };
  }

  /**
   * A vehicle arrives whole.
   *
   * Hit points are stored so damage sticks, and the maximum is derived from
   * the ST/HP column -- which means a vehicle created without being told its
   * hit points would sit at the field's own initial value, reading as a
   * battered wreck the moment it was made.
   */
  override async _preCreate(
    data: Record<string, any>,
    options: object,
    user: object,
  ): Promise<boolean | void> {
    const result = await super._preCreate(data, options, user);
    if (result === false) return false;
    if (data?.system?.hp?.value === undefined) {
      (this.parent as { updateSource(changes: object): unknown }).updateSource({
        "system.hp.value": this.vehicle.stHp,
      });
    }
  }

  override prepareDerivedData(): void {
    const v = this.vehicle;
    this.hp.max = v.stHp;

    // The rules read the Move it is using now: an amphibian in the water
    // cruises, brakes and loses control as a boat does -- and the figures as
    // a state that lasts leaves them (API 1.115.0): a crippled wheel, a load.
    const stats = vehicleStats(this.parent);
    const move = stats.move;
    const locomotion = move.locomotion;
    const seats = occupants(v.occupants);
    const aboard = this.crew.length;
    // Cruising speed on the ground a vehicle is built for: a paved road for
    // anything road-bound -- the book's own example is "57 x 1.25 = 71 mph on
    // a paved road" (p. 466) -- and average ground for everything else. It is
    // the figure the endurance is worked out from, and the one a table wants
    // when it asks how long the drive takes.
    const cruising = cruisingSpeedMph({
      topSpeed: move.topSpeed,
      acceleration: move.acceleration,
      locomotion,
      roadBound: v.roadBound,
      onRoad: v.roadBound,
      terrain: v.roadBound ? "good" : "average",
    });

    // "To control his vehicle, the operator must take a Move or Move and
    // Attack maneuver on his turn" (p. 467) -- so a vehicle in the tracker
    // acts when its operator does rather than rolling an initiative of its
    // own. Initiative is Basic Speed in this system, so borrowing the
    // operator's is all that takes. A vehicle nobody is driving sits at the
    // bottom of the order, which is where a driverless car belongs.
    const operator = this.crew.find((seat) => seat.operator);
    const driver = operator ? fromUuidSync(operator.uuid) : null;

    // "A vehicle's Dodge score is (operator's control skill/2) + vehicle's
    // Handling, rounded down" (p. 469). A vehicle nobody is driving does not
    // dodge, which is the same fact as its plowing ahead on nobody's turn.
    const control = driver ? controlSkillOf(driver, v.skill) : null;

    this.derived = {
      basicSpeed: Number(driver?.system?.derived?.basicSpeed) || 0,
      dodge: vehicleDodge({ controlSkill: control, handling: stats.handling }),
      controlSkill: control,
      // "To avoid excessive die rolling, it is best to adjust the damage
      // scale" (p. 470). Only worth showing for something big enough to need
      // it; a car reads the same at either scale and saying so twice is noise.
      decadeScale:
        v.stHp >= 100 || v.dr >= 100
          ? { dr: scaleScore(v.dr, "decade"), hp: scaleScore(v.stHp, "decade") }
          : null,
      medium: mediumOf(locomotion),
      // Top Speed in yards a second, doubled: "double this to get mph".
      topSpeedMph: Math.round(move.topSpeed * 2 * 10) / 10,
      /** Every way it moves, its first Move first, and the one in use now. */
      moves: vehicleMoves(v),
      move,
      /** The codes beside HT, each on its own: ["f", "x"] for "fx". */
      fragility: fragilityCodes(v.fragility),
      cruisingSpeedMph: cruising,
      endurance: endurance({ rangeMiles: v.range, cruisingSpeedMph: cruising }),
      safeDeceleration: safeDecelerationPerTurn({ locomotion, handling: stats.handling }),
      /** Handling, Stability and the Move in use as the rules read them now, and what changed them (since API 1.115.0). */
      stats,
      curbWeight: curbWeight({ loadedWeight: v.loadedWeight, load: v.load }),
      cargoCapacity: cargoCapacity({ load: v.load, people: aboard }),
      seats,
      aboard,
      /** True when more people are aboard than the vehicle seats in comfort. */
      crowded: aboard > seats.crew + seats.passengers,
      // The locations a shot can land on, read off the Locations column.
      locations: locationsOf(v.locations),
      /** "A powered vehicle (anything with a ST attribute) has vital areas." */
      powered: v.stHp > 0 && vehicleMoves(v).some((m) => m.acceleration > 0),
      /** Wrecked at zero, as any object is. */
      wrecked: this.hp.value <= 0,
      /** Below a third of its hit points, which is when things start failing. */
      battered: this.hp.value > 0 && this.hp.value < this.hp.max / 3,
    };
    afterPrepare(this.parent);
  }
}
