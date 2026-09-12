/**
 * The arithmetic of the facing arrow, kept apart from the drawing so it can
 * be tested without a canvas.
 *
 * Foundry's convention, which its keyboard turning and auto-rotation both
 * follow, is that a token's rotation of 0 faces the bottom of the screen and
 * grows clockwise.
 */

export type FacingIndicatorMode = "off" | "tactical" | "always";

/** Whether the indicator should be drawn, given the setting and the world's combat style. */
export function facingShown(mode: unknown, style: "basic" | "tactical"): boolean {
  if (mode === "always") return true;
  if (mode === "off") return false;
  return style === "tactical";
}

/**
 * The angle a token's rotation points at, in radians as PIXI measures them:
 * zero to the right, growing clockwise on screen.
 *
 * Rotation 0 faces down the screen, which is a quarter turn on from PIXI's
 * zero, so the two differ by ninety degrees.
 */
export function facingRadians(rotation: number): number {
  const degrees = Number.isFinite(rotation) ? rotation : 0;
  return ((degrees + 90) * Math.PI) / 180;
}

/**
 * How far one keypress turns a token, so a turn is always to the next facing
 * the grid recognises: a hex side on a hex map, a square's diagonal on a
 * square map, and a small step where there is no grid to speak of.
 */
export function rotationStep(grid: { isHexagonal?: boolean; type?: number } | null | undefined): number {
  if (grid?.isHexagonal) return 60;
  if (grid?.type === 0) return 15;
  return 45;
}
