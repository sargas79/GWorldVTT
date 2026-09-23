/**
 * The darkness at a spot on a scene (GURPS Basic Set: Campaigns p. 394;
 * since API 1.96.0).
 *
 * Darkness gives a penalty to Vision and to whatever depends on sight. The
 * attack dialog asks for it; this reads it off the scene's own lighting, for
 * a module's light source, sense roll or sensor: the darkness where the spot
 * is (a darkness region's own level, else the scene's), whether a light or
 * the scene's global light reaches it, and whether a darkness source covers
 * it. `rules.darknessFromLighting` turns that into the book's 0-10.
 */

import { darknessFromLighting, darknessPenaltyFor, TOTAL_DARKNESS, type Lighting } from "../rules/visibility.js";
import { SYSTEM_ID } from "./constants.js";
import { centerOf } from "./modifier-areas.js";
import { eyesOf } from "./roll.js";

/**
 * Whether a light only some can see counts for one observer (since API
 * 1.100.0): `observer` is the actor whose eyes the reading is for, or null for
 * nobody's; `light` is the light's document (an AmbientLight, or a Token for
 * its own light).
 */
export type LitForTest = (observer: any | null, light: any) => boolean;

/** A module's kind of light only some can see, as `areas.registerLitFor` takes it. */
export interface LitForRegistration {
  module: string;
  key: string;
  test: LitForTest;
}

/** The flag on a light's document naming the kind it is, `<module>.<key>`. */
export const LIT_FOR_FLAG = "litFor";

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const litForTests = new Map<string, LitForTest>();

/**
 * Registers a kind of light only some can see -- a lamp in a spectrum only
 * some eyes or gear perceive -- with the test that says who (since API
 * 1.100.0). Returns its id, `<module>.<key>`, for `setLitFor`, or null with a
 * console warning where the registration is malformed or the id is taken.
 */
export function registerLitFor(registration: LitForRegistration): string | null {
  const r = registration ?? ({} as LitForRegistration);
  const id = `${r.module}.${r.key}`;
  const refuse = (why: string) => {
    console.warn(`gworld | light kind ${id} not registered: ${why}`);
    return null;
  };
  if (typeof r.module !== "string" || !IDENTIFIER.test(r.module) || typeof r.key !== "string" || !IDENTIFIER.test(r.key)) return refuse("the module id or key is missing or malformed");
  if (typeof r.test !== "function") return refuse("it has no test function");
  if (litForTests.has(id)) return refuse("that key is already registered");
  litForTests.set(id, r.test);
  return id;
}

/** The light's document, from a placeable or the document itself, where it is a light or a token. */
function lightDocumentOf(light: any): any {
  const doc = light?.document ?? light;
  return doc?.documentName === "AmbientLight" || doc?.documentName === "Token" ? doc : null;
}

/** The kind of light a light is marked as, `<module>.<key>`, or null for one everyone sees. */
export function litForOf(light: any): string | null {
  const doc = lightDocumentOf(light);
  const id = doc?.getFlag?.(SYSTEM_ID, LIT_FOR_FLAG) ?? doc?.flags?.[SYSTEM_ID]?.[LIT_FOR_FLAG];
  return typeof id === "string" && id ? id : null;
}

/**
 * Marks a light (an AmbientLight, or a Token's own light; placeable or
 * document) as a kind only some can see, or with null as one everyone sees
 * again. True where the mark was written; false for anything that isn't a
 * light or a token, a user who may not change it, or an id that isn't
 * `<module>.<key>`.
 */
export async function setLitFor(light: any, id: string | null): Promise<boolean> {
  const doc = lightDocumentOf(light);
  if (!doc?.isOwner) return false;
  if (id === null) {
    await doc.update({ [`flags.${SYSTEM_ID}.-=${LIT_FOR_FLAG}`]: null });
    return true;
  }
  const [module, key, ...rest] = String(id).split(".");
  if (rest.length > 0 || !module || !key || !IDENTIFIER.test(module) || !IDENTIFIER.test(key)) return false;
  await doc.update({ [`flags.${SYSTEM_ID}.${LIT_FOR_FLAG}`]: `${module}.${key}` });
  return true;
}

/**
 * Whether a light counts for an observer: every unmarked light does; a marked
 * one only for an observer its kind's test passes -- so for nobody where
 * there is no observer, or no module has registered its kind.
 */
export function lightCountsFor(light: any, observer: any | null): boolean {
  const id = litForOf(light);
  if (!id) return true;
  if (!observer) return false;
  const test = litForTests.get(id);
  if (!test) return false;
  return safely(() => test(observer, lightDocumentOf(light)) === true, false);
}

/** A spot on a scene in pixels, with its elevation where it has one. */
export interface DarknessPoint {
  x: number;
  y: number;
  elevation?: number;
}

/** The darkness at a spot, as `areas.darknessAt` gives it. */
export interface DarknessReading {
  /** The darkness, 0 (none) to 10 (total). */
  darkness: number;
  /** Whether it is total darkness, where the foe is unseen rather than penalised. */
  total: boolean;
  /**
   * What it costs a Vision roll or an attack: -1 to -9 for partial darkness,
   * -10 for total, 0 for none. After the observer's eyes (Night Vision, Dark
   * Vision, Infravision) where one was given.
   */
  penalty: number;
  /** The lighting it was read from: the level (0-1) and what lit the spot. */
  lighting: Required<Lighting>;
}

/** A token (placeable or document) or a point, as the spot to read. */
function spotOf(scene: any, at: any): DarknessPoint | null {
  if (!at) return null;
  // A Token placeable carries its document; a TokenDocument names itself.
  const doc = at.document?.documentName === "Token" ? at.document : at.documentName === "Token" ? at : null;
  if (doc) {
    const drawn = centerOf(doc.object);
    const size = Number(scene?.grid?.size) || 100;
    const x = drawn?.x ?? Number(doc?.x) + ((Number(doc?.width) || 1) * size) / 2;
    const y = drawn?.y ?? Number(doc?.y) + ((Number(doc?.height) || 1) * size) / 2;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { x, y, elevation: Number(doc?.elevation) || 0 };
  }
  const x = Number(at.x);
  const y = Number(at.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y, elevation: Number(at.elevation) || 0 };
}

/** Calls a lighting test, taking any failure as "no". */
function safely<T>(run: () => T, fallback: T): T {
  try {
    return run();
  } catch {
    return fallback;
  }
}

/**
 * How a spot is lit: from the canvas where the scene is the one drawn, else
 * from the scene's settings. A light only some can see counts where it counts
 * for `observer` (since API 1.100.0).
 */
function lightingAt(scene: any, point: DarknessPoint, observer: any | null): Required<Lighting> {
  const canvas = (globalThis as any).canvas;
  const environment = scene?.environment ?? {};
  const global = environment.globalLight ?? {};
  const drawn = canvas?.scene && scene && canvas.scene === scene && canvas.effects;
  if (drawn) {
    const effects = canvas.effects;
    const level = Number(safely(() => effects.getDarknessLevel(point), environment.darknessLevel)) || 0;
    const globalSource = canvas.environment?.globalLightSource;
    const range = globalSource?.data?.darkness ?? global.darkness ?? {};
    // The scene's global light, where it is on at this darkness: daylight
    // when bright, one more light when dim.
    const globalOn = Boolean(globalSource?.active ?? global.enabled)
      && level >= (Number(range.min) || 0) && level <= (range.max === undefined ? 1 : Number(range.max));
    // The scene's setting says bright or dim; the source's `bright` is a radius.
    const bright = global.bright;
    const lit = safely(() => Boolean(effects.testInsideLight(point, {
      condition: (source: any) => source !== globalSource && lightCountsFor(source?.object, observer),
    })), false);
    const dark = safely(() => Boolean(effects.testInsideDarkness(point)), false);
    return { level, daylight: globalOn && bright === true, inLight: lit || (globalOn && bright !== true), unnaturalDarkness: dark };
  }
  // A scene nobody has drawn: its settings only, no lights.
  const level = Number(environment.darknessLevel) || 0;
  const range = global.darkness ?? {};
  const globalOn = global.enabled === true && level >= (Number(range.min) || 0) && level <= (range.max === undefined ? 1 : Number(range.max));
  return { level, daylight: globalOn && global.bright === true, inLight: globalOn && global.bright !== true, unnaturalDarkness: false };
}

/**
 * The darkness at a token or a point on a scene, and its penalty (Campaigns
 * p. 394). `scene` may be null for the token's own scene, or the one drawn.
 * `observer` is whose eyes the penalty is for, and whose the lights only some
 * can see are tested against; left out, nobody's. Null for a spot that can't
 * be placed.
 */
export function darknessAt(scene: any, at: any, options: { observer?: any } = {}): DarknessReading | null {
  // Left out, the token's own scene, else the one drawn.
  const target = scene ?? at?.document?.parent ?? (at?.documentName === "Token" ? at.parent : null) ?? (globalThis as any).canvas?.scene ?? null;
  const point = spotOf(target, at);
  if (!point) return null;
  const lighting = lightingAt(target, point, options.observer ?? null);
  const darkness = darknessFromLighting(lighting);
  const eyes = options.observer ? eyesOf(options.observer) : {};
  return {
    darkness,
    total: darkness >= TOTAL_DARKNESS,
    penalty: darknessPenaltyFor(darkness, eyes),
    lighting,
  };
}
