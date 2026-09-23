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
import type { DamageType } from "./types.js";
import { woundingModifierAt } from "./hit-locations.js";
import { noInjuryTolerance, toleratedWoundingModifier } from "./injury-tolerance.js";
import { shieldDrAgainst } from "./shield-damage.js";

// ── losing control (p. 469) ─────────────────────────────────────────────

/** The kinds of vehicle the book gives separate crash results for. */
export type VehicleMedium = "ground" | "air" | "water" | "spaceOrUnderwater";

/** Which of those a locomotion is (p. 469). */
/**
 * What a vehicle does on its operator's turn (Campaigns p. 467).
 *
 * "Treat a vehicle as an extension of its operator. It moves on the
 * operator's turn, at his place in the turn sequence... To control his
 * vehicle, the operator must take a Move or Move and Attack maneuver on his
 * turn -- but it's the vehicle that moves or attacks, while the operator
 * remains at the controls. If the operator takes any other maneuver, or is
 * stunned or otherwise incapacitated, his vehicle plows ahead with the same
 * speed and course it had on the previous turn."
 */
export type VehicleMovement = "controlled" | "plowsAhead";

/** The two maneuvers that put the operator in charge of the vehicle. */
export const CONTROLLING_MANEUVERS = ["move", "moveAndAttack"] as const;

export function vehicleMovement(options: {
  /** The maneuver the operator took this turn. */
  maneuver: string;
  /** Stunned, unconscious, or otherwise not at the controls. */
  incapacitated?: boolean;
}): VehicleMovement {
  if (options.incapacitated) return "plowsAhead";
  return (CONTROLLING_MANEUVERS as readonly string[]).includes(options.maneuver)
    ? "controlled"
    : "plowsAhead";
}

/**
 * Whether an occupant may work a vehicle system this turn (p. 467): "They
 * may use vehicle systems provided they are stationed next to the
 * appropriate controls and take a suitable maneuver: Concentrate to use
 * sensors or electronics, Attack or All-Out Attack to fire vehicular
 * weapons."
 */
export function mayUseVehicleSystem(options: {
  maneuver: string;
  system: "sensors" | "weapons";
  atTheControls: boolean;
}): boolean {
  if (!options.atTheControls) return false;
  return options.system === "sensors"
    ? options.maneuver === "concentrate"
    : options.maneuver === "attack" || options.maneuver === "allOutAttack";
}

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

/**
 * How rough the ride is, for the moving-platform penalty (p. 548): a ground
 * vehicle's good road, bad road or off-road; a water vehicle's calm or rough
 * water ("smooth" and "rough", with "offRoad" counted as rough). An air
 * vehicle takes no account of it.
 */
export type RideRoughness = "smooth" | "rough" | "offRoad";

/**
 * How the weapon is held on the platform (p. 548): in the hand, on an
 * external open mount, on a fixed mount, hardpoint or carriage, or in a
 * stabilized turret or stabilized open mount.
 */
export type PlatformMounting = "handheld" | "openMount" | "fixedMount" | "stabilized";

/** The column of the table each mounting reads, worst first. */
const MOUNTING_STEP: Readonly<Record<PlatformMounting, number>> = {
  handheld: 3,
  openMount: 2,
  fixedMount: 1,
  stabilized: 0,
};

/**
 * The penalty for attacking from a moving vehicle or mount (p. 548; p. 469
 * sends the shooter there). "The penalty depends on how rough the ride is and
 * whether you're using a weapon mount or a handheld weapon": in the air and on
 * a good road a hand weapon takes -1 and anything mounted nothing; a bad road
 * or calm water runs from 0 (stabilized) to -3 (in the hand); off-road or
 * rough water from -1 to -4. A space vehicle takes nothing. A moving animal
 * is ridden over ground, and reads the ground rows.
 */
export function movingPlatformPenalty(options: {
  medium: VehicleMedium;
  ride: RideRoughness;
  mounting: PlatformMounting;
}): number {
  const step = MOUNTING_STEP[options.mounting] ?? MOUNTING_STEP.handheld;
  if (options.medium === "spaceOrUnderwater") return 0;
  if (options.medium === "air") return options.mounting === "handheld" ? -1 : 0;
  // Calm water reads as a bad road, rough water as off-road.
  const smooth = options.ride === "smooth";
  if (options.medium === "ground" && smooth) return options.mounting === "handheld" ? -1 : 0;
  const rough = options.medium === "water" ? !smooth : options.ride === "offRoad";
  return 0 - (step + (rough ? 1 : 0));
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
 * The locations a shot could be aimed at on this vehicle, in the table's
 * order: the body, whatever its Locations entry lists, and the vital area of
 * a powered one (p. 554).
 */
export function aimableLocations(has: readonly string[], powered: boolean): VehicleLocation[] {
  const out: VehicleLocation[] = [];
  for (const row of Object.values(VEHICLE_HIT_LOCATIONS)) {
    for (const location of row.locations) {
      if (out.includes(location)) continue;
      if (location === "body" || (location === "vitalArea" ? powered : has.includes(location))) out.push(location);
    }
  }
  return out;
}

/**
 * The penalty for aiming at a location deliberately, before the vehicle's SM
 * (p. 554): the figure in parentheses on the row it is on.
 */
export function vehicleLocationPenalty(location: VehicleLocation): number {
  for (const row of Object.values(VEHICLE_HIT_LOCATIONS)) {
    if (row.locations.includes(location)) return row.penalty;
  }
  return 0;
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

/**
 * The wounding modifier a vehicle's vital area gives, where it gives one (p. 555).
 *
 * "The wounding modifier for a tight-beam burning attack is x2; that for an
 * impaling or any piercing attack is x3!" A tight beam, not every burn: a
 * flamethrower on the fuel tank is a burn like any other, which is the same
 * line the character's own vitals draw (p. 399). Null for every other attack,
 * which takes the ordinary modifier there.
 */
export function vitalAreaModifier(damageType: string, tightBeam = false): number | null {
  if (damageType === "burn") return tightBeam ? 2 : null;
  if (damageType === "imp" || damageType.startsWith("pi")) return 3;
  return null;
}

/**
 * The wounding modifier a hit on a vehicle takes (pp. 380, 555).
 *
 * "Most powered vehicles are Unliving; most unpowered vehicles are
 * Homogenous" -- which is what cuts a bullet down to a third against a car's
 * body and a fifth against a wagon's. A vital area overrides that for the
 * attacks it names; everything else takes the ordinary torso figure.
 */
export function vehicleWoundingModifier(options: {
  damageType: DamageType;
  tightBeam?: boolean;
  location: VehicleLocation;
  /** True for a powered vehicle, which is Unliving; false for one that is Homogenous. */
  powered: boolean;
}): number {
  if (options.location === "vitalArea") {
    const vital = vitalAreaModifier(options.damageType, options.tightBeam === true);
    if (vital !== null) return vital;
  }
  const tolerance = { ...noInjuryTolerance(), unliving: options.powered, homogenous: !options.powered };
  return (
    toleratedWoundingModifier(options.damageType, tolerance) ??
    woundingModifierAt(options.damageType, "torso", { tightBeam: options.tightBeam === true })
  );
}

/**
 * What a hit does to a vehicle's hit points (pp. 380, 555).
 *
 * The same arithmetic as injury to anybody: the modifier rounds down, "but any
 * attack that penetrates DR at all inflicts a minimum of 1 point of injury".
 */
export function vehicleInjury(options: {
  penetrating: number;
  damageType: DamageType;
  tightBeam?: boolean;
  location: VehicleLocation;
  powered: boolean;
}): number {
  const penetrating = Math.max(0, Math.floor(options.penetrating));
  if (penetrating === 0) return 0;
  return Math.max(1, Math.floor(penetrating * vehicleWoundingModifier(options)));
}

/** "A closed window gives half the vehicle's DR (round up)" (p. 555). */
export function windowDr(vehicleDr: number): number {
  return Math.ceil(Math.max(0, vehicleDr) / 2);
}

// ── DR by face and location (pp. 462, 554-555) ──────────────────────────

/**
 * The side of a vehicle a shot came in on. The tables split DR by face --
 * "for ground vehicles, this is usually the front DR and the average of side
 * and rear DR" (p. 462) -- and a shot from above or below meets the top or
 * the underbody.
 */
export type VehicleArc = "front" | "side" | "rear" | "top" | "underbody";

export const VEHICLE_ARCS: readonly VehicleArc[] = ["front", "side", "rear", "top", "underbody"];

/**
 * The locations whose hit the vehicle's DR does not stand in front of: the
 * person or the animal there is struck instead, and "the vehicle takes no
 * damage, and its DR doesn't protect" them (p. 555).
 */
export function passesThrough(location: VehicleLocation): boolean {
  return hitsAPerson(location) || location === "draftAnimal";
}

/**
 * The locations a vehicle may give a DR of its own. The body is the faces'
 * figure by definition, and the ones a hit passes through have none.
 */
export const DR_LOCATIONS: readonly VehicleLocation[] = [
  "smallWindow", "weaponMount", "smallSuperstructure", "independentTurret",
  "track", "rotor", "mast", "wing", "arm", "largeSuperstructure", "mainTurret",
  "largeWindow", "runner", "wheel", "vitalArea",
];

/**
 * A vehicle's DR as its statistics give it. `dr` is the table's figure, and
 * the front's when the table splits it; everything else is optional, and a
 * vehicle that gives none of it has one DR all round (p. 462).
 */
export interface VehicleDrFigures {
  dr: number;
  /** The second figure of a split like "45/20": the sides and rear. */
  drOther?: number | null;
  drTop?: number | null;
  drUnderbody?: number | null;
  /** A location that has a DR of its own, replacing the face's there. */
  drByLocation?: Partial<Record<VehicleLocation, number | null | undefined>> | null;
}

/** Where a vehicle's DR at a spot came from, for the card to say. */
export type VehicleDrSource = "location" | "window" | "face" | "none";

function given(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : null;
}

/**
 * The DR of one face (p. 462). The table's one figure is the front's; a
 * vehicle that gives a second has it on the sides and rear. The top and the
 * underbody are the second figure unless given their own, since the table
 * lists only "the two most important DR scores" and the front is the one
 * built to take fire. No arc at all reads the table's figure.
 */
export function vehicleFaceDr(figures: VehicleDrFigures, arc: VehicleArc | null): number {
  const main = Math.max(0, Math.floor(Number(figures.dr) || 0));
  const other = given(figures.drOther) ?? main;
  switch (arc) {
    case "side":
    case "rear":
      return other;
    case "top":
      return given(figures.drTop) ?? other;
    case "underbody":
      return given(figures.drUnderbody) ?? other;
    default:
      return main;
  }
}

/**
 * The vehicle's DR where a shot landed (pp. 462, 554-555): nothing where the
 * hit passes through to a person or an animal, a location's own figure where
 * it has one, half the face's for a closed window ("round up"), and the
 * face's everywhere else.
 */
export function vehicleDrAt(
  figures: VehicleDrFigures,
  location: VehicleLocation,
  arc: VehicleArc | null,
): { dr: number; source: VehicleDrSource } {
  if (passesThrough(location)) return { dr: 0, source: "none" };
  const own = given(figures.drByLocation?.[location]);
  if (own !== null) return { dr: own, source: "location" };
  const face = vehicleFaceDr(figures, arc);
  if (location === "largeWindow" || location === "smallWindow") return { dr: windowDr(face), source: "window" };
  return { dr: face, source: "face" };
}

/**
 * What gets through a vehicle's DR (p. 378, as for anybody): the layers that
 * count are added up, the highest Hardened among them steps the armour
 * divisor down (Characters p. 47), the divisor divides what is left, and the
 * rest comes off the basic damage.
 */
export function vehiclePenetration(options: {
  basicDamage: number;
  lines: ReadonlyArray<{ dr: number; applies: boolean; hardened?: number }>;
  armorDivisor: number;
  ignoresDr?: boolean;
}): { dr: number; effectiveDr: number; penetrating: number } {
  let dr = 0;
  let hardened = 0;
  for (const line of options.lines) {
    if (line.applies === false) continue;
    dr += Math.max(0, Math.floor(Number(line.dr) || 0));
    hardened = Math.max(hardened, Math.max(0, Math.floor(Number(line.hardened) || 0)));
  }
  const effectiveDr = shieldDrAgainst({
    dr,
    armorDivisor: Number(options.armorDivisor) > 0 ? Number(options.armorDivisor) : 1,
    ignoresDr: options.ignoresDr === true,
    hardened,
  });
  const basic = Math.max(0, Math.floor(Number(options.basicDamage) || 0));
  return { dr, effectiveDr, penetrating: Math.max(0, basic - effectiveDr) };
}

/** The DR as the tables print it:"45/20" for a split, "45" for one figure. */
export function vehicleDrLabel(figures: VehicleDrFigures): string {
  const main = Math.max(0, Math.floor(Number(figures.dr) || 0));
  const other = given(figures.drOther);
  return other === null || other === main ? String(main) : `${main}/${other}`;
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
