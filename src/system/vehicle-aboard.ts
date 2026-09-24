/**
 * Somebody shooting from a vehicle (GURPS Basic Set: Campaigns pp. 467-469).
 *
 * A vehicle's crew list says who is aboard and who has the wheel, and that is
 * all the attack needs to know to ask the right questions: the driver firing a
 * pistol is dividing his attention, a passenger was thrown about when the car
 * swerved, a moving car will not hold a rifle steady past its Stability
 * Rating, and a built-in targeting system is worth something at TL6 and more
 * at TL7.
 */

import { mediumOf, mayUseVehicleSystem, type VehicleMedium } from "../rules/vehicle-combat.js";
import { activeMove } from "../rules/vehicles.js";
import { vehicleStats } from "./vehicle-stats.js";

/** The vehicle a character is aboard, and their place in it. */
export interface Aboard {
  /** The vehicle actor. */
  vehicle: any;
  name: string;
  /** True for whoever has the wheel. */
  operator: boolean;
  /** Stability Rating, which caps what aiming buys in a moving vehicle. */
  stabilityRating: number;
  /** True for anything in the air, where an unexpected swerve costs double. */
  flying: boolean;
  /** Ground, air or water, which picks the row of the moving-platform penalty (p. 548). */
  medium: VehicleMedium;
  /** True while it is going anywhere at all. */
  moving: boolean;
  /** Its tech level, which is what a targeting system is worth. */
  techLevel: number;
}

/**
 * The vehicle an actor is aboard, or null.
 *
 * Found by looking for them in a vehicle's crew rather than kept on the
 * character, because the crew list is the one place that is true: getting out
 * takes them off it, and a second record would drift.
 */
export function vehicleAboard(actor: any, vehicles: Iterable<any> = allVehicles()): Aboard | null {
  const uuid = String(actor?.uuid ?? "");
  if (!uuid) return null;
  for (const vehicle of vehicles) {
    if (vehicle?.type !== "vehicle") continue;
    const seat = (vehicle.system?.crew ?? []).find((s: { uuid: string }) => s.uuid === uuid);
    if (!seat) continue;
    const stats = vehicle.system?.vehicle ?? {};
    // The way it is moving now, for a vehicle that moves two ways.
    const medium = mediumOf(activeMove(stats).locomotion);
    return {
      vehicle,
      name: String(vehicle.name ?? ""),
      operator: seat.operator === true,
      // As a state that lasts leaves it (API 1.115.0).
      stabilityRating: vehicleStats(vehicle).stability,
      flying: medium === "air",
      medium,
      moving: (Number(vehicle.system?.speed) || 0) > 0,
      techLevel: Number.parseInt(String(vehicle.system?.tl ?? ""), 10) || 0,
    };
  }
  return null;
}

function allVehicles(): any[] {
  return (globalThis as { game?: { actors?: { contents?: any[] } } }).game?.actors?.contents ?? [];
}

/**
 * Whether this character may fire the vehicle's own weapons this turn (p. 467).
 *
 * "They may use vehicle systems provided they are stationed next to the
 * appropriate controls and take a suitable maneuver ... Attack or All-Out
 * Attack to fire vehicular weapons." Being aboard is taken as being at the
 * controls; the maneuver is read off the sheet.
 */
export function mayFireMountedWeapon(actor: any, aboard: Aboard | null): boolean {
  if (!aboard) return false;
  return mayUseVehicleSystem({
    maneuver: String(actor?.system?.maneuver ?? ""),
    system: "weapons",
    atTheControls: true,
  });
}
