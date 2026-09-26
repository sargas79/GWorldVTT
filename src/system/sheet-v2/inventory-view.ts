/**
 * How the character sheet's Inventory tab arranges what a character carries:
 * armour by the part of the body it covers, what is ready to hand, and the
 * carried and stored lists in the order asked for.
 *
 * Kept apart from the sheet so it can be tested without Foundry.
 */

import { byName } from "../sort.js";

/**
 * The body areas the Equipped panel shows, each the hit locations it covers
 * (Characters p. 552). An area is where a piece of armour is listed; a piece
 * covering several areas is listed under each.
 */
export const BODY_AREAS = [
  { key: "head", locations: ["skull", "face", "eye", "neck"] },
  { key: "torso", locations: ["torso", "vitals", "groin"] },
  { key: "arms", locations: ["arm"] },
  { key: "hands", locations: ["hand"] },
  { key: "legs", locations: ["leg"] },
  { key: "feet", locations: ["foot"] },
] as const;

export type BodyArea = (typeof BODY_AREAS)[number]["key"];

export interface WornPiece {
  id: string;
  name: string;
  dr: number;
  /** Hit locations it covers; none means the whole body, as a suit does. */
  locations: readonly string[];
  equipped: boolean;
}

/** Equipped armour under each body area, by name. Every area is listed, empty ones included. */
export function armorByArea<T extends WornPiece>(pieces: readonly T[]): Array<{ key: BodyArea; pieces: T[] }> {
  const worn = pieces.filter((p) => p.equipped).sort(byName);
  return BODY_AREAS.map((area) => ({
    key: area.key,
    pieces: worn.filter((p) => p.locations.length === 0 || p.locations.some((l) => (area.locations as readonly string[]).includes(l))),
  }));
}

export interface GearRow {
  id: string;
  name: string;
  quantity: number;
  weight: number;
  cost: number;
}

export const GEAR_SORTS = ["name", "quantity", "weight", "cost"] as const;
export type GearSort = (typeof GEAR_SORTS)[number];

/** Reads a stored sort back into one the table knows, defaulting to by name. */
export function asGearSort(value: unknown): GearSort {
  return (GEAR_SORTS as readonly string[]).includes(String(value)) ? (value as GearSort) : "name";
}

/**
 * A sorted copy of the rows: by name A to Z by default, or by a number,
 * highest first, name breaking ties. `descending` flips whichever order.
 */
export function sortGear<T extends GearRow>(rows: readonly T[], sort: GearSort, descending = false): T[] {
  const copy = [...rows];
  const numeric = sort !== "name";
  copy.sort((a, b) => {
    const order = numeric ? (Number(b[sort]) || 0) - (Number(a[sort]) || 0) || byName(a, b) : byName(a, b);
    return descending ? -order : order;
  });
  return copy;
}

export interface ReadyCandidate {
  id: string;
  name: string;
  type: string;
  equipped: boolean;
  carried: boolean;
  /** Whether it has an attack mode. */
  armed: boolean;
  category: string;
}

/**
 * Whether an item can be moved between carried and stored: every physical
 * thing, armour and shields as well as equipment. Stowing takes it off.
 */
export function canStow(type: unknown): boolean {
  return type === "equipment" || type === "armor" || type === "shield";
}

/**
 * What is ready to hand, by name: equipped weapons and shields, then carried
 * consumables -- the draught and the throwing knife a player reaches for
 * without opening the pack.
 */
export function readiedItems<T extends ReadyCandidate>(items: readonly T[]): T[] {
  const inHand = items.filter((i) => i.equipped && (i.armed || i.type === "shield")).sort(byName);
  // A quiver of arrows is as handy as a draught: rounds count with consumables.
  const handy = items.filter((i) => !inHand.includes(i) && i.carried && (i.category === "consumable" || i.category === "ammunition")).sort(byName);
  return [...inHand, ...handy];
}

/** Total weight of a list of rows, to one decimal place. */
export function totalWeight(rows: readonly GearRow[]): number {
  return Math.round(rows.reduce((sum, r) => sum + (Number(r.weight) || 0), 0) * 10) / 10;
}
