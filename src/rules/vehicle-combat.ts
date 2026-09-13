/**
 * Vehicles in a fight (GURPS Basic Set: Campaigns pp. 467-469, 554-555).
 *
 * A vehicle already has a stat line and a control roll; this is what happens
 * when the roll is failed and when the vehicle is shot at. A failure by no
 * more than the Stability Rating means one thing for a car and another for an
 * aeroplane, and past the SR it is a crash either way. A hit is rolled on the
 * vehicle's own hit location table, each location crippled by its own share
 * of the vehicle's HP, and five points through an occupied one puts the
 * people inside at risk.
 */

import type { Locomotion } from "./vehicles.js";

// ── losing control (p. 469) ─────────────────────────────────────────────

/** The kinds of vehicle the book gives separate crash results for. */
export type VehicleMedium = "ground" | "air" | "water" | "spaceOrUnderwater";

/** Which of those a locomotion is (p. 469). */
export function mediumOf(locomotion: Locomotion): VehicleMedium {
  if (locomotion === "air") return "air";
  if (locomotion === "water") return "water";
  return "ground";
}

export interface LossOfControl {
  /** "minor" within the SR, "major" past it, "disaster" on a critical failure. */
  severity: "minor" | "major" | "disaster";
  /** A key naming what happened, for the card to spell out. */
  result: string;
  /** Yards of altitude or depth lost, for the vehicles that have any. */
  altitudeLost: number;
  /** Yards a second shed by the stumble. */
  decelerated: number;
  /**
   * "It skids or rolls for a distance equal to 1/3 its current velocity",
   * and takes falling damage for the velocity it had. Zero when it kept its feet.
   */
  skidYards: number;
  /** True when the vehicle is wrecked, sunk, stalled or spinning. */
  crashed: boolean;
}

/**
 * What a failed control roll did (p. 469).
 *
 * "In addition to these results, a failed control roll always erases any
 * accumulated bonuses for Aim maneuvers, and gives a penalty equal to the
 * margin of failure to any attack from the vehicle until the operator's next
 * turn" -- which is the caller's to apply, and the reason the margin comes
 * back out again.
 */
export function lossOfControl(options: {
  medium: VehicleMedium;
  stabilityRating: number;
  /** Margin of failure, positive. */
  margin: number;
  criticalFailure?: boolean;
  velocity: number;
}): LossOfControl {
  const within = !options.criticalFailure && Math.abs(options.margin) <= Math.max(0, options.stabilityRating);
  const severity = options.criticalFailure ? "disaster" : within ? "minor" : "major";
  const velocity = Math.max(0, options.velocity);

  if (options.medium === "air") {
    return within
      ? { severity, result: "airStumble", altitudeLost: 5, decelerated: 10, skidYards: 0, crashed: false }
      : { severity, result: "airDive", altitudeLost: 0, decelerated: 0, skidYards: 0, crashed: true };
  }
  if (options.medium === "water") {
    return within
      ? { severity, result: "waterSkid", altitudeLost: 0, decelerated: 0, skidYards: 0, crashed: false }
      : { severity, result: "capsize", altitudeLost: 0, decelerated: 0, skidYards: 0, crashed: true };
  }
  if (options.medium === "spaceOrUnderwater") {
    return within
      ? { severity, result: "veers", altitudeLost: 5, decelerated: 0, skidYards: 0, crashed: false }
      : { severity, result: "stress", altitudeLost: 0, decelerated: 0, skidYards: 0, crashed: false };
  }
  return within
    ? { severity, result: "skid", altitudeLost: 0, decelerated: 0, skidYards: 0, crashed: false }
    : {
        severity,
        result: "rollOut",
        altitudeLost: 0,
        decelerated: 0,
        // "It skids or rolls for a distance equal to 1/3 its current velocity."
        skidYards: Math.floor(velocity / 3),
        crashed: true,
      };
}

// ── shooting from a moving vehicle (p. 469) ─────────────────────────────

/**
 * "The combined bonuses from aiming (Accuracy, extra turns of Aim, targeting
 * systems, and bracing) cannot exceed the SR of a moving vehicle unless the
 * sights or mount are stabilized" (p. 469).
 */
export function cappedAimBonus(options: {
  bonus: number;
  stabilityRating: number;
  stabilized?: boolean;
  moving?: boolean;
}): number {
  if (options.stabilized || options.moving === false) return options.bonus;
  return Math.min(options.bonus, Math.max(0, options.stabilityRating));
}

/** "If the vehicle dodged and you aren't the operator, you have an extra -2 to hit, or -4 if flying." */
export function unexpectedDodgePenalty(options: { dodged: boolean; operator: boolean; flying?: boolean }): number {
  if (!options.dodged || options.operator) return 0;
  return options.flying ? -4 : -2;
}

/** What a built-in targeting system is worth, by tech level (p. 469). */
export function targetingSystemBonus(techLevel: number): number {
  if (techLevel >= 7) return 3;
  if (techLevel >= 6) return 2;
  return 0;
}

// ── the Vehicle Hit Location Table (p. 554) ─────────────────────────────

export type VehicleLocation =
  | "smallWindow" | "weaponMount" | "smallSuperstructure" | "independentTurret"
  | "track" | "draftAnimal" | "rotor" | "mast" | "wing"
  | "arm" | "largeSuperstructure" | "mainTurret"
  | "body" | "exposedRider" | "largeWindow" | "openCabin"
  | "runner" | "wheel" | "vitalArea";

export interface VehicleLocationRow {
  /** The locations this roll can land on, in the table's order. */
  locations: readonly VehicleLocation[];
  /** The penalty for aiming at one deliberately, before the vehicle's SM. */
  penalty: number;
}

/** The table, by the 3d roll (p. 554). */
export const VEHICLE_HIT_LOCATIONS: Readonly<Record<number, VehicleLocationRow>> = {
  3: { locations: ["smallWindow", "weaponMount"], penalty: -7 },
  4: { locations: ["smallWindow", "weaponMount"], penalty: -7 },
  5: { locations: ["smallSuperstructure", "independentTurret"], penalty: -5 },
  6: { locations: ["track", "draftAnimal", "rotor", "mast", "wing"], penalty: -2 },
  7: { locations: ["track", "draftAnimal", "rotor", "mast", "wing"], penalty: -2 },
  8: { locations: ["arm", "largeSuperstructure", "mainTurret"], penalty: -2 },
  9: { locations: ["body", "exposedRider"], penalty: 0 },
  10: { locations: ["body"], penalty: 0 },
  11: { locations: ["largeWindow", "openCabin"], penalty: -3 },
  12: { locations: ["arm", "largeSuperstructure", "mainTurret"], penalty: -2 },
  13: { locations: ["track", "draftAnimal", "rotor", "mast", "wing"], penalty: -2 },
  14: { locations: ["track", "draftAnimal", "rotor", "mast", "wing"], penalty: -2 },
  15: { locations: ["runner", "wheel"], penalty: -4 },
  16: { locations: ["runner", "wheel"], penalty: -4 },
  17: { locations: ["vitalArea"], penalty: -3 },
  18: { locations: ["vitalArea"], penalty: -3 },
};

/** The letters a vehicle's Locations entry uses, and what each stands for. */
export const LOCATION_CODES: Readonly<Record<string, VehicleLocation>> = {
  A: "arm", C: "track", D: "draftAnimal", E: "exposedRider", G: "largeWindow",
  g: "smallWindow", H: "rotor", M: "mast", O: "openCabin", R: "runner",
  S: "largeSuperstructure", s: "smallSuperstructure", T: "mainTurret",
  t: "independentTurret", W: "wheel", Wi: "wing", X: "weaponMount",
};

/** The locations a vehicle actually has, read off an entry like "G4W" or "2CX". */
export function locationsOf(entry: string): VehicleLocation[] {
  const out: VehicleLocation[] = [];
  const re = /(\d*)(Wi|[ACDEGgHMORSsTtWX])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(entry)) !== null) {
    const location = LOCATION_CODES[m[2]!];
    if (location && !out.includes(location)) out.push(location);
  }
  // Every vehicle has a body, whether or not the entry bothers to say so.
  if (!out.includes("body")) out.push("body");
  // "A powered vehicle (anything with a ST attribute) has vital areas."
  return out;
}

/**
 * Where a shot landed on a vehicle (p. 554).
 *
 * "If a random location doesn't exist, is retracted, or isn't a logical
 * target given the angle of attack ... treat it as body hit. If multiple
 * locations or possibilities exist ... the attacker picks which was hit."
 */
export function vehicleHitLocation(options: {
  roll: number;
  /** The locations this vehicle has, from its table entry. */
  has: readonly VehicleLocation[];
  /** True for anything with a ST score, which is what has vital areas. */
  powered?: boolean;
}): { location: VehicleLocation; choices: VehicleLocation[]; penalty: number; fellToBody: boolean } {
  const row = VEHICLE_HIT_LOCATIONS[Math.max(3, Math.min(18, Math.round(options.roll)))]!;
  const present = row.locations.filter((l) =>
    l === "body" ? true : l === "vitalArea" ? options.powered !== false : options.has.includes(l),
  );
  if (present.length === 0) {
    return { location: "body", choices: ["body"], penalty: 0, fellToBody: true };
  }
  return { location: present[0]!, choices: present, penalty: row.penalty, fellToBody: false };
}

/**
 * What it takes to cripple a location, as a share of the vehicle's HP
 * (pp. 554-555), and what is lost when it goes. Null for the locations a
 * hit passes through to a person or an animal instead.
 */
export function crippleThreshold(
  location: VehicleLocation,
  hitPoints: number,
  counts: { wheels?: number; masts?: number } = {},
): number | null {
  const hp = Math.max(0, hitPoints);
  switch (location) {
    case "track":
    case "rotor":
      // "Damage over HP/2 cripples one track"; a rotor is HP/3, a wing HP/2.
      return location === "track" ? hp / 2 : hp / 3;
    case "wing":
      return hp / 2;
    case "runner":
      return hp / 3;
    case "weaponMount":
      return hp / 5;
    case "smallSuperstructure":
    case "independentTurret":
      return hp / 3;
    case "mast":
      return hp / (2 * Math.max(1, counts.masts ?? 1));
    case "wheel":
      return hp / (2 * Math.max(1, counts.wheels ?? 1));
    default:
      // Body, turrets, superstructures and vital areas are not crippled by a
      // share of HP; they roll against HT on a major wound instead.
      return null;
  }
}

/** The locations that pass the hit through to somebody instead of the vehicle (p. 555). */
export function hitsAPerson(location: VehicleLocation): boolean {
  return location === "exposedRider" || location === "openCabin";
}

/** The wounding modifier a vehicle's vital area takes (p. 555). */
export function vitalAreaModifier(damageType: string): number {
  if (damageType === "burn") return 2;
  if (damageType === "imp" || damageType.startsWith("pi")) return 3;
  return 1;
}

/** "A closed window gives half the vehicle's DR (round up)" (p. 555). */
export function windowDr(vehicleDr: number): number {
  return Math.ceil(Math.max(0, vehicleDr) / 2);
}

// ── the Occupant Hit Table (p. 555) ─────────────────────────────────────

/** Penetrating damage that puts the people inside at risk. */
export const OCCUPANT_RISK_DAMAGE = 5;

/** The table's rows, by how many are aboard. */
const OCCUPANT_ROWS: ReadonlyArray<{ upTo: number; bySm: readonly number[] }> = [
  { upTo: 1, bySm: [10, 9, 8, 7, 6, 5, 4, 3, 3, 3, 3] },
  { upTo: 2, bySm: [12, 10, 9, 8, 7, 6, 5, 4, 3, 3, 3] },
  { upTo: 5, bySm: [14, 12, 10, 9, 8, 7, 6, 5, 4, 3, 3] },
  { upTo: 10, bySm: [16, 14, 12, 10, 9, 8, 7, 6, 5, 4, 3] },
  { upTo: 20, bySm: [17, 16, 14, 12, 10, 9, 8, 7, 6, 5, 4] },
  { upTo: 50, bySm: [17, 17, 16, 14, 12, 10, 9, 8, 7, 6, 5] },
  { upTo: 100, bySm: [17, 17, 17, 16, 14, 12, 10, 9, 8, 7, 6] },
  { upTo: 200, bySm: [17, 17, 17, 17, 16, 14, 12, 10, 9, 8, 7] },
  { upTo: 500, bySm: [17, 17, 17, 17, 17, 16, 14, 12, 10, 9, 8] },
];

/**
 * The number to roll 3d against for an occupant to be hit (p. 555):
 * "cross-index the number of occupants with the vehicle or structure's Size
 * Modifier ... the more tightly packed the object, the higher the number".
 * The table runs from SM +1 to SM +11.
 */
export function occupantHitTarget(occupants: number, sizeModifier: number): number {
  const row = OCCUPANT_ROWS.find((r) => occupants <= r.upTo) ?? OCCUPANT_ROWS[OCCUPANT_ROWS.length - 1]!;
  const index = Math.max(0, Math.min(row.bySm.length - 1, Math.round(sizeModifier) - 1));
  return row.bySm[index]!;
}

/**
 * What an occupant takes when the table says they were hit (p. 555): "1d
 * cutting damage per five full points of penetrating damage the vehicle
 * sustained".
 */
export function occupantDamage(penetrating: number): { dice: number; adds: number } {
  return { dice: Math.floor(Math.max(0, penetrating) / OCCUPANT_RISK_DAMAGE), adds: 0 };
}
