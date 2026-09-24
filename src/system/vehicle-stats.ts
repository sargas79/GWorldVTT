/**
 * A vehicle's Handling, Stability Rating and Move as the rules use them now
 * (GURPS Basic Set: Campaigns pp. 463-469; since API 1.115.0).
 *
 * The stored figures are the vehicle as built. While a state lasts -- a
 * crippled wheel, track or rotor (p. 555), a load, a module's own damage --
 * a module may change what the rules read through `gworld.vehicleStats`,
 * without touching what is stored. The vehicle's derived data, its Dodge,
 * its control rolls and what it reads for losing control all use these.
 *
 * The crippled parts the vehicle keeps are the one such state the Basic Set
 * spells out, so the system applies them itself before the listeners hear
 * (since API 1.134.0): a module that knows better -- a run-flat tyre, a
 * spare rotor -- changes the figures back, rather than every module
 * working the book's arithmetic out again.
 */

import { activeMove, type VehicleMove } from "../rules/vehicles.js";
import {
  MOVE_CRIPPLING_LOCATIONS, crippledMove, type CrippledVehicleParts,
} from "../rules/vehicle-combat.js";
import { DATA_HOOKS } from "./data-extensions.js";

/** A line saying what changed a vehicle's figures, for the sheet and the card. */
export interface VehicleStatLine {
  label: string;
  /** Which figure it changed, where it says. */
  stat?: "handling" | "stability" | "acceleration" | "topSpeed";
  value?: number;
}

/** The figures the rules read, and what changed them. */
export interface VehicleStats {
  handling: number;
  stability: number;
  acceleration: number;
  topSpeed: number;
  /** The Move in use, with the acceleration and top speed above. */
  move: VehicleMove;
  lines: VehicleStatLine[];
}

/**
 * The parts a vehicle has crippled now (since API 1.134.0). Only a vehicle
 * actor keeps them; an entry on a Gear tab is the vehicle as bought and has
 * none.
 */
export function crippledParts(owner: any): Record<(typeof MOVE_CRIPPLING_LOCATIONS)[number], number> {
  const kept = owner?.system?.crippled ?? {};
  return Object.fromEntries(
    MOVE_CRIPPLING_LOCATIONS.map((location) => [location, Math.max(0, Math.floor(Number(kept[location]) || 0))]),
  ) as Record<(typeof MOVE_CRIPPLING_LOCATIONS)[number], number>;
}

/** A line's label, through the translation where Foundry is there to give one. */
function say(key: string, data: Record<string, unknown>): string {
  const i18n = (globalThis as { game?: { i18n?: { format?: (key: string, data: object) => string } } }).game?.i18n;
  return i18n?.format ? i18n.format(key, data) : key;
}

/**
 * A vehicle's figures after `gworld.vehicleStats`, with `{ vehicle, handling,
 * stability, acceleration, topSpeed, move, crippled, lines }` -- `vehicle`
 * the actor or the item on a Gear tab, the four figures mutable, `move` the
 * Move in use as stored, `crippled` the parts crippled now, and `lines` for
 * saying why. The figures arrive with the crippled parts already applied
 * (since API 1.134.0). A listener that throws changes nothing a listener
 * did; a figure that isn't a number is left as it was, and Stability,
 * acceleration and top speed never go below 0.
 */
export function vehicleStats(owner: any): VehicleStats {
  const v = owner?.system?.vehicle ?? {};
  const move = activeMove(v);
  const crippled: CrippledVehicleParts = crippledParts(owner);
  // What the crippled parts leave of the Move in use (p. 555), before any
  // module hears, so a listener adjusts the book's figure rather than
  // having to know it.
  const lamed = crippledMove({ move, crippled, locations: String(v.locations ?? "") });
  const lines: VehicleStatLine[] = [];
  if (lamed.cause) {
    lines.push({
      label: say(`GWORLD.Vehicle.CrippledMove.${lamed.cause}`, {
        count: crippled[lamed.cause] ?? 0,
        acceleration: lamed.acceleration,
        topSpeed: lamed.topSpeed,
      }),
      stat: "topSpeed",
      value: lamed.topSpeed - (Number(move.topSpeed) || 0),
    });
  }
  const base = {
    handling: Number(v.handling) || 0,
    stability: Number(v.stability) || 0,
    acceleration: lamed.acceleration,
    topSpeed: lamed.topSpeed,
  };
  const context = { vehicle: owner, ...base, move: { ...move }, crippled: { ...crippled }, lines: [...lines] };
  const hooks = (globalThis as { Hooks?: { callAll?: (event: string, ...args: unknown[]) => unknown } }).Hooks;
  try {
    hooks?.callAll?.(DATA_HOOKS.vehicleStats, context);
  } catch (error) {
    console.warn(`gworld | a ${DATA_HOOKS.vehicleStats} listener failed`, error);
    return { ...base, move: { ...move, acceleration: base.acceleration, topSpeed: base.topSpeed }, lines };
  }
  const read = (value: unknown, fallback: number, floor: number | null) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return floor === null ? n : Math.max(floor, n);
  };
  const acceleration = read(context.acceleration, base.acceleration, 0);
  const topSpeed = read(context.topSpeed, base.topSpeed, 0);
  return {
    handling: Math.round(read(context.handling, base.handling, null)),
    stability: Math.round(read(context.stability, base.stability, 0)),
    acceleration,
    topSpeed,
    move: { ...move, acceleration, topSpeed },
    lines: Array.isArray(context.lines) ? context.lines.filter((line) => typeof line?.label === "string") : [],
  };
}
