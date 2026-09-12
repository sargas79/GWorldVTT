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

export type Locomotion = "wheels" | "tracks" | "legs" | "runners" | "water" | "air";

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
