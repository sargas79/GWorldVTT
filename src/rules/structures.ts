/**
 * Knocking a building down (GURPS Basic Set: Campaigns pp. 484, 558).
 *
 * "The Structural Damage Table gives typical DR and HP for buildings, doors,
 * walls, and similar inanimate structures. Most such structures are
 * Homogenous."
 *
 * A building takes damage the way a person does and dies the way a person
 * does, at the same multiples of its hit points. What is different is what
 * happens to everybody standing in it when it goes.
 */

import type { DiceAdds } from "./types.js";

/** "Assume that a structurally sound building in good repair has HT 12." */
export const SOUND_BUILDING_HT = 12;

/**
 * How well built it is, which is the only thing that moves its HT.
 *
 * "Shoddy construction might reduce this to HT 9-11, while a quake-resistant
 * building might have HT 13-14." The book gives ranges; the middle of each is
 * taken, and a GM who wants an end of one can say so.
 */
export type Construction = "shoddy" | "sound" | "quakeResistant";

export function buildingHealth(construction: Construction): number {
  if (construction === "shoddy") return 10;
  if (construction === "quakeResistant") return 13;
  return SOUND_BUILDING_HT;
}

/** What state a structure is in. */
export type StructureState =
  /** Standing, whatever it has taken. */
  | "standing"
  /** "one or more large breaches and loses electrical power, if any." */
  | "breached"
  /** Rolling HT every so often to stay up. */
  | "failing"
  /** Down. */
  | "collapsed";

/**
 * What a structure's hit points say about it (p. 484).
 *
 * "Any building 'disabled' by going to 0 HP or less and failing a HT roll has
 * one or more large breaches and loses electrical power, if any. At -1xHP or
 * less, it must make HT rolls to avoid collapse - just as a character would
 * roll to avoid death. It collapses automatically at -5xHP."
 *
 * Note the shape of the first clause: going to zero is not enough on its own.
 * A building at 0 HP that keeps making its rolls is still a building.
 */
export function structureState(options: {
  hp: number;
  maxHp: number;
  /** True once it has failed the roll that zero hit points calls for. */
  failedDisabling?: boolean;
}): StructureState {
  const max = Math.max(1, options.maxHp);
  if (options.hp <= -5 * max) return "collapsed";
  if (options.hp <= -max) return "failing";
  if (options.hp <= 0) return options.failedDisabling ? "breached" : "standing";
  return "standing";
}

/** "it must make HT rolls to avoid collapse" from -1xHP down. */
export function mustRollToStand(options: { hp: number; maxHp: number }): boolean {
  return structureState(options) === "failing";
}

/** "Anyone in a collapsing building takes 3d crushing damage, plus 1d per story overhead." */
export const COLLAPSE_BASE: DiceAdds = { dice: 3, adds: 0 };
export const COLLAPSE_DICE_PER_STORY = 1;

/**
 * What falls on somebody inside (p. 484).
 *
 * Only the storeys *above* them count: a man on the top floor of a tower has
 * nothing over his head, and the book says "per story overhead" rather than
 * per storey.
 */
export function collapseDamage(storiesOverhead: number): DiceAdds {
  return {
    dice: COLLAPSE_BASE.dice + Math.max(0, Math.floor(storiesOverhead)) * COLLAPSE_DICE_PER_STORY,
    adds: 0,
  };
}

/** What diving for cover in a collapsing building bought (p. 484). */
export type CollapseShelter = "crushed" | "sheltered" | "unharmed";

/**
 * "A victim can attempt to dive for cover behind a structural member. On a
 * success, he receives DR equal to the building's exterior wall DR against
 * this damage, but is still trapped in the rubble. On a critical success, he
 * is totally unharmed!"
 */
export function collapseShelter(roll: {
  success: boolean;
  criticalSuccess: boolean;
}): CollapseShelter {
  if (roll.criticalSuccess) return "unharmed";
  return roll.success ? "sheltered" : "crushed";
}

/** Whether somebody who survived the collapse is still under it (p. 484). */
export function trappedInRubble(shelter: CollapseShelter): boolean {
  return shelter !== "unharmed";
}

// ── the Structural Damage Table (p. 558) ────────────────────────────────────

/** One row of the table. */
export interface Structure {
  name: string;
  dr: number;
  hp: number;
  /**
   * True for the starred DR values, which wear away under repeated blows to
   * the same spot: "repeated impaling, piercing, and large piercing attacks
   * against the same small spot lower DR at that specific point as if it were
   * semi-ablative; repeated burning, corrosion, crushing, cutting, or huge
   * piercing attacks at that same spot reduce DR at that point as if it were
   * ablative."
   */
  wearsAway: boolean;
  /** "Structures marked Combustible or Brittle are Fragile." */
  fragile?: "combustible" | "brittle";
}

/**
 * Doors and walls, "per 1-hex or 10-square-foot area" (p. 558).
 *
 * The DR and HP are for one hex of it. A longer wall is more hexes, not a
 * bigger number.
 */
export const WALLS: readonly Structure[] = [
  { name: "Brick Wall (3\" thick)", dr: 8, hp: 54, wearsAway: true },
  { name: "Brick Wall (6\" thick)", dr: 16, hp: 67, wearsAway: true },
  { name: "Brick Wall (9\" thick)", dr: 24, hp: 77, wearsAway: true },
  { name: "Brick Wall (18\" thick)", dr: 48, hp: 97, wearsAway: true },
  { name: "Concrete, reinforced (8\" thick)", dr: 96, hp: 80, wearsAway: true },
  { name: "Concrete, reinforced (2' thick)", dr: 288, hp: 115, wearsAway: true },
  { name: "Concrete, reinforced (5' thick)", dr: 720, hp: 156, wearsAway: true },
  { name: "Glass, plate (1/5\" thick)", dr: 1, hp: 3, wearsAway: false, fragile: "brittle" },
  { name: "Iron/bronze (1/4\" thick)", dr: 12, hp: 36, wearsAway: false },
  { name: "Iron (1/2\" thick)", dr: 25, hp: 46, wearsAway: false },
  { name: "Iron (1\" thick)", dr: 50, hp: 58, wearsAway: false },
  { name: "Steel, mild (1/8\" thick)", dr: 7, hp: 30, wearsAway: false },
  { name: "Steel, mild (1/4\" thick)", dr: 14, hp: 38, wearsAway: false },
  { name: "Steel, mild (1/2\" thick)", dr: 28, hp: 47, wearsAway: false },
  { name: "Steel, mild (1\" thick)", dr: 56, hp: 60, wearsAway: false },
  { name: "Steel, mild (2\" thick)", dr: 112, hp: 75, wearsAway: false },
  { name: "Stone wall (1' thick)", dr: 156, hp: 94, wearsAway: true },
  { name: "Stone wall (3' thick)", dr: 468, hp: 135, wearsAway: true },
  { name: "Stone wall (8' thick)", dr: 1250, hp: 188, wearsAway: true },
  { name: "Wallboard (1/2\" thick)", dr: 1, hp: 18, wearsAway: true, fragile: "combustible" },
  { name: "Wood (1\" thick)", dr: 1, hp: 23, wearsAway: true, fragile: "combustible" },
  { name: "Wood (2\" thick)", dr: 2, hp: 29, wearsAway: true, fragile: "combustible" },
  { name: "Wood (3\" thick)", dr: 3, hp: 33, wearsAway: true, fragile: "combustible" },
  { name: "Wood (6\" thick)", dr: 6, hp: 42, wearsAway: true, fragile: "combustible" },
  { name: "Wood (12\" thick)", dr: 12, hp: 54, wearsAway: true, fragile: "combustible" },
];

/** Whole buildings (p. 558). */
export const BUILDINGS: readonly Structure[] = [
  { name: "Farmhouse (1,000 sf)", dr: 2, hp: 370, wearsAway: true, fragile: "combustible" },
  { name: "Mansion or manor (10,000 sf)", dr: 6, hp: 1000, wearsAway: true, fragile: "combustible" },
  { name: "Modern House (2,000 sf)", dr: 6, hp: 580, wearsAway: true, fragile: "combustible" },
  { name: "Pillbox (10'-thick concrete)", dr: 1440, hp: 460, wearsAway: true },
  { name: "Skyscraper (50-story, 500,000 sf)", dr: 10, hp: 3700, wearsAway: false, fragile: "combustible" },
  { name: "Stone Keep (5'-thick walls)", dr: 780, hp: 1200, wearsAway: true },
];

/** Every row of the table, walls first. */
export const STRUCTURES: readonly Structure[] = [...WALLS, ...BUILDINGS];

/** A structure by name, or null where the table has none. */
export function structure(name: string): Structure | null {
  const wanted = name.trim().toLowerCase();
  return STRUCTURES.find((row) => row.name.toLowerCase() === wanted) ?? null;
}

/**
 * The hit points of a building worked out rather than looked up (p. 558).
 *
 * "HP = 100 x (cube root of building's empty weight in tons), and typical
 * weights per 1,000 square feet (sf) of area are 50 tons for wood frame or mud
 * brick, 100 tons for steel frame or brick, and 150 tons for stone."
 */
export type BuildingFrame = "wood" | "brick" | "stone";

export function tonsPerThousandFeet(frame: BuildingFrame): number {
  if (frame === "stone") return 150;
  if (frame === "brick") return 100;
  return 50;
}

export function buildingHitPoints(options: {
  squareFeet: number;
  frame: BuildingFrame;
}): number {
  const tons = (Math.max(0, options.squareFeet) / 1000) * tonsPerThousandFeet(options.frame);
  if (tons <= 0) return 0;
  return Math.ceil(100 * Math.cbrt(tons));
}

// The same page repeats the formula for a smaller object -- "4 x (cube root of
// empty weight in lbs.) for Unliving objects and 8 x ... for Homogenous or
// Diffuse ones" -- which is the rule already in `objects.ts` from p. 483. It
// is not repeated here.
