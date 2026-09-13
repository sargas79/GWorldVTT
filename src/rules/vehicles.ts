/**
 * Vehicles (GURPS Basic Set: Campaigns pp. 462-468).
 *
 * A vehicle is a stat line -- ST/HP, Hnd/SR, HT, Move as acceleration and
 * top speed, weight, load, size, occupants, DR, range -- and two rules that
 * read it. A control roll "against Boating, Driving, Piloting, etc." is made
 * "in any potentially hazardous situation", with Handling as its modifier;
 * "failure by no more than the vehicle's Stability Rating (SR) is a minor
 * problem ... More severe failure means a major problem ... On a critical
 * failure, disaster is inevitable!" And a journey's speed comes off the top
 * speed by terrain: "Top Speed x 0.5 mph on wheels" over average ground,
 * "x 1.25 mph" on a paved road.
 */

import type { Terrain } from "./hiking.js";

export type ControlOutcome = "ok" | "minor" | "major" | "disaster";

/** What a control roll came to (p. 466). */
export function controlRoll(options: {
  success: boolean;
  criticalFailure?: boolean;
  /** Margin of failure, positive, on a failed roll. */
  margin?: number;
  stabilityRating: number;
}): ControlOutcome {
  if (options.criticalFailure) return "disaster";
  if (options.success) return "ok";
  return Math.abs(options.margin ?? 0) <= Math.max(0, options.stabilityRating) ? "minor" : "major";
}

/** How a vehicle moves, in the order a picker should offer them. */
export const LOCOMOTIONS = ["wheels", "tracks", "legs", "runners", "water", "air"] as const;

export type Locomotion = (typeof LOCOMOTIONS)[number];

/**
 * Cruising speed in mph, from Top Speed in yards a second (p. 466).
 *
 * Over land the terrain decides: very bad ground is x0.1 on wheels or
 * runners, x0.15 on tracks and x0.2 on legs; bad is x0.25 on wheels and
 * x0.5 otherwise; average x0.5 on wheels and x1 otherwise; good x1.25 for
 * all. "For a road-bound vehicle ... use Top Speed only when traveling on a
 * road. Off road, use the lower of Top Speed and 4 x Acceleration." A
 * powered vessel "moves at Top Speed x 2 mph", an aircraft "about Top Speed
 * x 1.6 mph".
 */
export function cruisingSpeedMph(options: {
  topSpeed: number;
  acceleration?: number;
  locomotion: Locomotion;
  terrain?: Terrain;
  /** A road-bound vehicle, such as an ordinary car. */
  roadBound?: boolean;
  /** Whether the terrain is a road, for a road-bound vehicle. */
  onRoad?: boolean;
}): number {
  const top = Math.max(0, options.topSpeed);
  if (options.locomotion === "water") return top * 2;
  if (options.locomotion === "air") return top * 1.6;

  const terrain = options.terrain ?? "average";
  const speed =
    options.roadBound && !options.onRoad
      ? Math.min(top, 4 * Math.max(0, options.acceleration ?? 0))
      : top;
  const wheels = options.locomotion === "wheels" || options.locomotion === "runners";
  const factor = (() => {
    switch (terrain) {
      case "veryBad":
        return wheels ? 0.1 : options.locomotion === "tracks" ? 0.15 : 0.2;
      case "bad":
        return wheels ? 0.25 : 0.5;
      case "average":
        return wheels ? 0.5 : 1;
      default:
        return 1.25;
    }
  })();
  return Math.round(speed * factor * 10) / 10;
}

/**
 * How much a vehicle can slow each turn, safely (p. 468): "5 yards/second"
 * for a powered wheeled ground vehicle, 10 for an animal-drawn, tracked,
 * walking or slithering one, and "(5 + Handling) ... (minimum 1)" for air and
 * water.
 */
export function safeDecelerationPerTurn(options: { locomotion: Locomotion; handling: number }): number {
  switch (options.locomotion) {
    case "wheels":
      return 5;
    case "air":
    case "water":
      return Math.max(1, 5 + options.handling);
    default:
      return 10;
  }
}

/** The occupants a vehicle carries, from its "crew+passengers" entry, e.g. "1+3". */
export function occupants(entry: string): { crew: number; passengers: number } {
  const m = /^\s*(\d+)\s*(?:\+\s*(\d+))?/.exec(entry);
  if (!m) return { crew: 0, passengers: 0 };
  return { crew: Number(m[1]), passengers: Number(m[2] ?? 0) };
}

/** Weight in tons the book assumes for one person and their gear (p. 463). */
export const TONS_PER_PERSON = 0.1;

/**
 * The weight the vehicle carries once its people are aboard (p. 463).
 *
 * "To find cargo capacity, subtract the weight of occupants (for simplicity,
 * assume 0.1 ton/person, including gear)." A vehicle loaded with more people
 * than it has room for carries no cargo rather than negative cargo.
 */
export function cargoCapacity(options: { load: number; people: number }): number {
  const left = options.load - Math.max(0, options.people) * TONS_PER_PERSON;
  return Math.max(0, Math.round(left * 100) / 100);
}

/**
 * What the vehicle weighs with fuel and nothing else (p. 463).
 *
 * "To find 'curb weight' (with fuel but no other payload), subtract Load from
 * LWt."
 */
export function curbWeight(options: { loadedWeight: number; load: number }): number {
  return Math.max(0, Math.round((options.loadedWeight - options.load) * 100) / 100);
}

/**
 * How long it can stay out, in hours (p. 463).
 *
 * "Divide Range in miles by cruising speed in mph to determine endurance in
 * hours for situations where 'loiter' capability matters more than range."
 * A vehicle with no range on the table -- oars, sails, draft animals -- has
 * no endurance to work out, which is null rather than an infinity.
 */
export function endurance(options: { rangeMiles: number; cruisingSpeedMph: number }): number | null {
  if (options.rangeMiles <= 0 || options.cruisingSpeedMph <= 0) return null;
  return Math.round((options.rangeMiles / options.cruisingSpeedMph) * 10) / 10;
}

/** Somebody aboard a vehicle, and whether they have the wheel. */
export interface Seat {
  uuid: string;
  operator: boolean;
}

/**
 * The crew without one of them, with the wheel still in somebody's hands.
 *
 * "To control his vehicle, the operator must take a Move or Move and Attack
 * maneuver on his turn" (p. 467), which only means anything while somebody is
 * driving. So a driver who gets out hands the wheel on: a vehicle with people
 * in it and nobody at the controls is not a state to be able to reach by
 * getting out of a car.
 *
 * An empty vehicle is another matter, and stays empty.
 */
export function leaveSeat(crew: readonly Seat[], uuid: string): Seat[] {
  const left = crew.filter((seat) => seat.uuid !== uuid).map((seat) => ({ ...seat }));
  if (left.length > 0 && !left.some((seat) => seat.operator)) left[0]!.operator = true;
  return left;
}
