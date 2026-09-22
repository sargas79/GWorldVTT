/**
 * Modifier areas kept on a scene (since API 1.63.0): a module registers smoke
 * or a blinding field, and rolls made in it or through it take its lines.
 */

import { areaLines, circleOf, inShape, segmentCrossesShape, type ModifierArea, type Point } from "../rules/modifier-areas.js";
import { SYSTEM_ID } from "./constants.js";
import { targetedTokens } from "./targets.js";

const FLAG = "modifierAreas";

/** The areas on a scene. */
export function listAreas(scene: any): ModifierArea[] {
  const stored = scene?.getFlag?.(SYSTEM_ID, FLAG) ?? scene?.flags?.[SYSTEM_ID]?.[FLAG];
  return Array.isArray(stored) ? stored.filter((a: any) => a && typeof a.id === "string") : [];
}

/**
 * Adds an area to a scene, or replaces the one with the same id. `radius` is
 * in yards, turned into pixels by the scene's grid. Returns the id, or null
 * where this user can't change the scene.
 */
export async function addArea(scene: any, area: Omit<ModifierArea, "id" | "radius"> & { id?: string; radius?: number | null }): Promise<string | null> {
  if (!scene?.isOwner && !game.user?.isGM) return null;
  const id = String(area.id || foundry.utils.randomID());
  const radius = Number(area.radius);
  const entry: ModifierArea = {
    id,
    label: String(area.label ?? ""),
    center: area.center ? { x: Number(area.center.x) || 0, y: Number(area.center.y) || 0 } : null,
    radius: radius > 0 ? radius * pixelsPerYard(scene) : null,
    ...(area.from && Number.isFinite(Number(area.from.x)) && Number.isFinite(Number(area.from.y))
      ? { from: { x: Number(area.from.x), y: Number(area.from.y) } }
      : {}),
    region: area.region ? String(area.region) : null,
    lines: (area.lines ?? []).map((l) => ({
      label: String(l.label ?? ""),
      value: Number(l.value) || 0,
      ...(Array.isArray(l.rolls) ? { rolls: l.rolls.map(String) } : {}),
      applies: l.applies === "inside" || l.applies === "through" ? l.applies : "both",
    })),
    expires: typeof area.expires === "number" && Number.isFinite(area.expires) ? area.expires : null,
  };
  const areas = listAreas(scene).filter((a) => a.id !== id);
  await scene.setFlag(SYSTEM_ID, FLAG, [...areas, entry]);
  return id;
}

/** Removes an area from a scene. */
export async function removeArea(scene: any, id: string): Promise<void> {
  if (!scene?.isOwner && !game.user?.isGM) return;
  const areas = listAreas(scene);
  if (!areas.some((a) => a.id === id)) return;
  await scene.setFlag(SYSTEM_ID, FLAG, areas.filter((a) => a.id !== id));
}

/** Pixels in a yard on this scene's grid. */
export function pixelsPerYard(scene: any): number {
  const size = Number(scene?.grid?.size) || 100;
  const distance = Number(scene?.grid?.distance) || 1;
  const units = String(scene?.grid?.units ?? "").trim().toLowerCase();
  const yardsPerCell = units === "ft" || units === "feet" || units === "'" ? distance / 3 : units === "m" ? distance * 1.0936 : distance;
  return size / (yardsPerCell || 1);
}

export function centerOf(token: any): Point | null {
  const c = token?.center ?? token?.object?.center;
  return c && Number.isFinite(c.x) && Number.isFinite(c.y) ? { x: c.x, y: c.y } : null;
}

function regionContains(scene: any, id: string, point: Point): boolean {
  const region = scene?.regions?.get?.(id);
  if (!region?.testPoint) return false;
  try {
    return Boolean(region.testPoint({ x: point.x, y: point.y, elevation: 0 }));
  } catch {
    return false;
  }
}

/** Whether a point on the scene is in an area: its circle, its band or its region. */
export function pointInArea(scene: any, area: ModifierArea, point: Point): boolean {
  if (circleOf(area)) return inShape(point, area);
  return area.region ? regionContains(scene, area.region, point) : false;
}

/**
 * The lines the current scene's areas put on a roll: where the actor's token
 * stands, and on the way to the one token targeted (or the subject's token).
 */
export function sceneAreaLines(context: { actor: any; kind: string; tags: readonly string[]; subject?: any }): Array<{ label: string; value: number }> {
  const scene = (globalThis as any).canvas?.scene;
  const areas = listAreas(scene);
  if (!areas.length) return [];
  const from = centerOf(context.actor?.getActiveTokens?.()?.[0]);
  if (!from) return [];
  const targets = targetedTokens();
  const toToken = context.subject?.getActiveTokens?.()?.[0] ?? (targets.length === 1 ? targets[0] : null);
  const to = centerOf(toToken);
  return areaLines({
    areas,
    kind: context.kind,
    tags: context.tags,
    now: Number(game.time?.worldTime) || 0,
    inside: (area) => pointInArea(scene, area, from),
    through: (area) => {
      if (!to) return false;
      if (circleOf(area)) return segmentCrossesShape(from, to, area);
      if (!area.region) return false;
      // A region's shape is sampled along the line.
      for (let i = 0; i <= 20; i++) {
        const t = i / 20;
        if (regionContains(scene, area.region, { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t })) return true;
      }
      return false;
    },
  });
}
