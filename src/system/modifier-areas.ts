/**
 * Modifier areas kept on a scene (since API 1.63.0): a module registers smoke
 * or a blinding field, and rolls made in it or through it take its lines.
 */

import { areaLines, hasShape, inShape, segmentCrossesShape, type Cone, type ModifierArea, type Point } from "../rules/modifier-areas.js";
import { SYSTEM_ID } from "./constants.js";
import { targetedTokens } from "./targets.js";

const FLAG = "modifierAreas";

/** The areas on a scene. */
export function listAreas(scene: any): ModifierArea[] {
  const stored = scene?.getFlag?.(SYSTEM_ID, FLAG) ?? scene?.flags?.[SYSTEM_ID]?.[FLAG];
  return Array.isArray(stored) ? stored.filter((a: any) => a && typeof a.id === "string") : [];
}

/**
 * A cone as a module gives it (since 1.89.0): its direction in degrees, or a
 * point to aim it at, and its length and end width in yards.
 */
export interface ConeInput {
  /** Degrees clockwise from the scene's +x (east), as Foundry measures a template. */
  direction?: number | null;
  /** Or a point in scene pixels it is aimed at, as the line from attacker to target point (p. 413). */
  toward?: Point | null;
  /** Its reach in yards: the weapon's maximum range. Left out with `toward`: to that point. */
  length?: number | null;
  /** Its width at the far end in yards; left out, one yard per yard of length (p. 413). */
  width?: number | null;
}

/** A module's cone in scene pixels, or null where it gives no usable direction or length. */
export function coneFrom(input: ConeInput | null | undefined, apex: Point | null, pixelsPerYard: number): Cone | null {
  if (!input || !apex) return null;
  const toward = input.toward && Number.isFinite(Number(input.toward.x)) && Number.isFinite(Number(input.toward.y))
    ? { x: Number(input.toward.x), y: Number(input.toward.y) }
    : null;
  const distance = toward ? Math.hypot(toward.x - apex.x, toward.y - apex.y) : 0;
  const given = Number(input.direction);
  const direction = toward && distance > 0
    ? (Math.atan2(toward.y - apex.y, toward.x - apex.x) * 180) / Math.PI
    : input.direction !== null && input.direction !== undefined && Number.isFinite(given) ? given : NaN;
  if (!Number.isFinite(direction)) return null;
  const yards = Number(input.length);
  const length = yards > 0 ? yards * pixelsPerYard : distance;
  if (!(length > 0)) return null;
  const width = Number(input.width);
  return {
    direction: ((direction % 360) + 360) % 360,
    length,
    width: width > 0 ? width * pixelsPerYard : length,
    base: pixelsPerYard,
  };
}

/**
 * Adds an area to a scene, or replaces the one with the same id. `radius` is
 * in yards, turned into pixels by the scene's grid; so are a cone's length and
 * width. Returns the id, or null where this user can't change the scene or a
 * cone has no direction or length.
 */
export async function addArea(
  scene: any,
  area: Omit<ModifierArea, "id" | "radius" | "cone"> & { id?: string; radius?: number | null; cone?: ConeInput | null },
): Promise<string | null> {
  if (!scene?.isOwner && !game.user?.isGM) return null;
  const id = String(area.id || foundry.utils.randomID());
  const center = area.center ? { x: Number(area.center.x) || 0, y: Number(area.center.y) || 0 } : null;
  const cone = area.cone ? coneFrom(area.cone, center, pixelsPerYard(scene)) : null;
  if (area.cone && !cone) return null;
  const radius = Number(area.radius);
  const entry: ModifierArea = {
    id,
    label: String(area.label ?? ""),
    center,
    radius: !cone && radius > 0 ? radius * pixelsPerYard(scene) : null,
    ...(cone ? { cone } : {}),
    ...(!cone && area.from && Number.isFinite(Number(area.from.x)) && Number.isFinite(Number(area.from.y))
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

/** Whether a point on the scene is in an area: its circle, its band, its cone or its region. */
export function pointInArea(scene: any, area: ModifierArea, point: Point): boolean {
  if (hasShape(area)) return inShape(point, area);
  return area.region ? regionContains(scene, area.region, point) : false;
}

/**
 * The tokens on a scene standing in an area, by its id or as `areas.list`
 * gives it (since 1.89.0): those whose centre lies in it. Token documents.
 */
export function tokensInArea(scene: any, area: string | ModifierArea): any[] {
  const found = typeof area === "string" ? listAreas(scene).find((a) => a.id === area) : area;
  if (!found) return [];
  const out: any[] = [];
  for (const doc of scene?.tokens ?? []) {
    const point = tokenCentre(doc, scene);
    if (point && pointInArea(scene, found, point)) out.push(doc);
  }
  return out;
}

/** A token document's centre in scene pixels, drawn or not. */
function tokenCentre(doc: any, scene: any): Point | null {
  const drawn = centerOf(doc?.object);
  if (drawn) return drawn;
  const size = Number(scene?.grid?.size) || 100;
  const x = Number(doc?.x);
  const y = Number(doc?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x: x + ((Number(doc?.width) || 1) * size) / 2, y: y + ((Number(doc?.height) || 1) * size) / 2 };
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
      if (hasShape(area)) return segmentCrossesShape(from, to, area);
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
