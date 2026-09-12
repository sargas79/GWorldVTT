/**
 * Turning what is on the canvas into the six directions the tactical rules use.
 *
 * `src/rules/tactical.ts` counts hex directions 0 to 5 clockwise and does not
 * care which way 0 points. This is where that is decided, because it depends on
 * how the scene's grid is laid out: a pointy-topped hex has a neighbour to the
 * east, a flat-topped one has a neighbour to the north, and the two are thirty
 * degrees out from each other.
 *
 * Angles here are degrees clockwise from north. Foundry states a token's
 * rotation the other way up: rotation 0 faces the bottom of the screen and
 * grows clockwise, which is what its keyboard turning and auto-rotation both
 * write. The two differ by a half turn, and `facingOf` is where that is
 * reconciled.
 */

import { hexDirection, type HexDirection } from "../rules/tactical.js";

/** Foundry's grid types (CONST.GRID_TYPES). */
export const GRID = {
  gridless: 0,
  square: 1,
  hexOddRow: 2,
  hexEvenRow: 3,
  hexOddColumn: 4,
  hexEvenColumn: 5,
} as const;

/** Whether a scene's grid is one the tactical rules can read facing off. */
export function isHexGrid(gridType: number): boolean {
  return gridType >= GRID.hexOddRow && gridType <= GRID.hexEvenColumn;
}

/**
 * The angle direction 0 points at, in degrees clockwise from north.
 *
 * A row-wise (pointy-topped) grid has its neighbours at 30, 90, 150 and so on:
 * due east is a neighbour, due north is not. A column-wise (flat-topped) grid
 * has them at 0, 60, 120: due north is a neighbour, due east is not.
 */
function zeroAngle(gridType: number): number {
  return gridType === GRID.hexOddRow || gridType === GRID.hexEvenRow ? 30 : 0;
}

/** The nearest hex direction to a bearing. */
export function hexDirectionFromAngle(angleDegrees: number, gridType: number): HexDirection {
  return hexDirection(Math.round((angleDegrees - zeroAngle(gridType)) / 60));
}

/** The bearing of a hex direction, for turning a facing back into an angle. */
export function angleOfHexDirection(direction: HexDirection, gridType: number): number {
  return (zeroAngle(gridType) + direction * 60) % 360;
}

/**
 * The bearing from one point to another, in degrees clockwise from north.
 *
 * Canvas y grows downward, so north is negative y -- getting that backwards
 * mirrors every facing and puts attacks from in front behind the defender.
 */
export function bearing(
  from: { x: number; y: number },
  to: { x: number; y: number },
): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const degrees = (Math.atan2(dx, -dy) * 180) / Math.PI;
  return (degrees + 360) % 360;
}

/** A token's centre, which is what a bearing should be measured between. */
export function tokenCentre(token: any): { x: number; y: number } {
  const document_ = token?.document ?? token;
  const x = Number(document_?.x ?? 0);
  const y = Number(document_?.y ?? 0);
  const width = Number(document_?.width ?? 1);
  const height = Number(document_?.height ?? 1);
  const size = Number(token?.scene?.grid?.size ?? document_?.parent?.grid?.size ?? 100);
  return { x: x + (width * size) / 2, y: y + (height * size) / 2 };
}

/** Foundry's rotation 0 faces down the screen; a bearing of 0 is north. */
export const ROTATION_TO_BEARING = 180;

/**
 * Which way a token faces, from its rotation.
 *
 * A token that has never been turned is at rotation 0, which Foundry draws
 * facing the bottom of the screen -- south. That is a real facing rather than
 * a missing one, so it is read as such: a GM who has not turned anyone is
 * running a fight where everyone faces south, which is at least consistent,
 * and matches the arrow the token wears.
 */
export function facingOf(token: any, gridType: number): HexDirection {
  const rotation = Number(token?.document?.rotation ?? token?.rotation ?? 0);
  const bearing = ((Number.isFinite(rotation) ? rotation : 0) + ROTATION_TO_BEARING) % 360;
  return hexDirectionFromAngle(bearing, gridType);
}

/**
 * Which hex direction an attack on `defender` comes from, when made by
 * `attacker`.
 *
 * Returns null when the two are in the same place, where there is no direction
 * to speak of -- close combat, or two tokens stacked.
 */
export function attackDirection(
  attacker: any,
  defender: any,
  gridType: number,
): HexDirection | null {
  const from = tokenCentre(defender);
  const to = tokenCentre(attacker);
  if (from.x === to.x && from.y === to.y) return null;
  return hexDirectionFromAngle(bearing(from, to), gridType);
}
