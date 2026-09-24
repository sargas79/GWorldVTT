/**
 * A vehicle's Handling, Stability Rating and Move as the rules use them now
 * (GURPS Basic Set: Campaigns pp. 463-469; since API 1.115.0).
 *
 * The stored figures are the vehicle as built. While a state lasts -- a
 * crippled wheel, track or rotor (p. 555), a load, a module's own damage --
 * a module may change what the rules read through `gworld.vehicleStats`,
 * without touching what is stored. The vehicle's derived data, its Dodge,
 * its control rolls and what it reads for losing control all use these.
 */

import { activeMove, type VehicleMove } from "../rules/vehicles.js";
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
 * A vehicle's figures after `gworld.vehicleStats`, with `{ vehicle, handling,
 * stability, acceleration, topSpeed, move, lines }` -- `vehicle` the actor or
 * the item on a Gear tab, the four figures mutable, and `lines` for saying
 * why. A listener that throws changes nothing; a figure that isn't a number
 * is left as it was, and Stability, acceleration and top speed never go
 * below 0.
 */
export function vehicleStats(owner: any): VehicleStats {
  const v = owner?.system?.vehicle ?? {};
  const move = activeMove(v);
  const base = {
    handling: Number(v.handling) || 0,
    stability: Number(v.stability) || 0,
    acceleration: Number(move.acceleration) || 0,
    topSpeed: Number(move.topSpeed) || 0,
  };
  const context = { vehicle: owner, ...base, move: { ...move }, lines: [] as VehicleStatLine[] };
  const hooks = (globalThis as { Hooks?: { callAll?: (event: string, ...args: unknown[]) => unknown } }).Hooks;
  try {
    hooks?.callAll?.(DATA_HOOKS.vehicleStats, context);
  } catch (error) {
    console.warn(`gworld | a ${DATA_HOOKS.vehicleStats} listener failed`, error);
    return { ...base, move, lines: [] };
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
