/**
 * Which way a token is facing, drawn on the token
 * (GURPS Basic Set: Campaigns p. 389, "Facing").
 *
 * Tactical combat is decided by facing -- a side attack is defended at -2, an
 * attack from behind usually not at all -- and Foundry already stores it as
 * the token's rotation. What it did not do was show it: a rotated portrait
 * says little about where the character's front is, and a top-down token
 * says nothing. So the token wears an arrow at its edge on the side it is
 * facing, with the front arc marked lightly behind it, and both turn with
 * the token.
 *
 * Foundry's convention, which the keyboard and auto-rotation both follow, is
 * that rotation 0 faces the bottom of the screen and grows clockwise.
 *
 * Turning is Foundry's: Shift and the mouse wheel over a selected token, or
 * Shift with an arrow key. Two keybindings are added for a hex map, where
 * neither of those snaps to a hex side: Q and E turn every selected token one
 * side to the left or right, in the increments the scene's grid actually has.
 */

import { SYSTEM_ID } from "./constants.js";
import { facingRadians, facingShown, rotationStep, type FacingIndicatorMode } from "./facing-geometry.js";
import { combatStyle } from "./settings.js";

export { facingRadians, facingShown, rotationStep } from "./facing-geometry.js";

/** The client setting that says when the indicator is drawn. */
export const FACING_INDICATOR = "facingIndicator";

/** The front arc, which on a hex map is the three hexes ahead: half the circle. */
const FRONT_ARC_RADIANS = Math.PI;

function currentMode(): FacingIndicatorMode {
  try {
    const value = game.settings.get(SYSTEM_ID, FACING_INDICATOR);
    return value === "off" || value === "always" ? value : "tactical";
  } catch {
    return "tactical";
  }
}

/** Draws, or clears, the indicator on one token. */
function drawFacing(token: any): void {
  const PIXI = (globalThis as any).PIXI;
  if (!PIXI || !token?.document) return;

  let graphics = token.gworldFacing;
  if (!graphics || graphics.destroyed) {
    graphics = new PIXI.Graphics();
    graphics.eventMode = "none";
    token.gworldFacing = token.addChild(graphics);
  }
  graphics.clear();

  if (!facingShown(currentMode(), combatStyle())) return;
  if (token.document.hidden && !(game.user?.isGM ?? false)) return;

  const width = Number(token.w ?? token.document.width * 100);
  const height = Number(token.h ?? token.document.height * 100);
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) / 2;
  const angle = facingRadians(Number(token.document.rotation));
  const color = Number(token._getBorderColor?.() ?? token.getDispositionColor?.() ?? 0xffffff);

  // The front arc: a light band on the half of the border the character can
  // see and fight across, so a side attack can be told from a frontal one at
  // a glance.
  graphics.lineStyle(Math.max(2, radius * 0.06), color, 0.35);
  graphics.arc(cx, cy, radius - 1, angle - FRONT_ARC_RADIANS / 2, angle + FRONT_ARC_RADIANS / 2);

  // The arrow: a solid wedge at the facing itself, pointing out of the token.
  const tip = radius * 0.32;
  const tipX = cx + Math.cos(angle) * radius;
  const tipY = cy + Math.sin(angle) * radius;
  const baseX = cx + Math.cos(angle) * (radius - tip);
  const baseY = cy + Math.sin(angle) * (radius - tip);
  const half = tip * 0.55;
  const leftX = baseX + Math.cos(angle + Math.PI / 2) * half;
  const leftY = baseY + Math.sin(angle + Math.PI / 2) * half;
  const rightX = baseX + Math.cos(angle - Math.PI / 2) * half;
  const rightY = baseY + Math.sin(angle - Math.PI / 2) * half;
  graphics.lineStyle(1, 0x000000, 0.6);
  graphics.beginFill(color, 0.95);
  graphics.drawPolygon([tipX, tipY, leftX, leftY, rightX, rightY]);
  graphics.endFill();
}

/** Redraws the indicator on every token of the current scene. */
export function refreshAllFacing(): void {
  for (const token of (globalThis as any).canvas?.tokens?.placeables ?? []) drawFacing(token);
}

/** Registers the hooks and keybindings. Called once, at init. */
export function registerFacing(): void {
  Hooks.on("refreshToken", (token: any) => drawFacing(token));
  Hooks.on(`${SYSTEM_ID}.refreshFacing`, () => refreshAllFacing());

  const turn = (direction: -1 | 1) => {
    const layer = (globalThis as any).canvas?.tokens;
    const grid = (globalThis as any).canvas?.grid;
    if (!layer?.controlled?.length) return false;
    const step = rotationStep(grid);
    void layer.rotateMany({ delta: direction * step, snap: step });
    return true;
  };

  game.keybindings.register(SYSTEM_ID, "turnLeft", {
    name: "GWORLD.Keybinding.TurnLeft",
    hint: "GWORLD.Keybinding.TurnHint",
    editable: [{ key: "KeyQ" }],
    onDown: () => turn(-1),
  });
  game.keybindings.register(SYSTEM_ID, "turnRight", {
    name: "GWORLD.Keybinding.TurnRight",
    hint: "GWORLD.Keybinding.TurnHint",
    editable: [{ key: "KeyE" }],
    onDown: () => turn(1),
  });
}
