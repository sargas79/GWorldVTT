import { afterEach, describe, expect, it } from "vitest";

import { createApi } from "../api.js";
import { darknessAt } from "../darkness.js";
import { darknessFromLighting, darknessPenaltyFor, LIT_DARKNESS } from "../../rules/visibility.js";

/** Reading the darkness at a token or a point (sargas79/GWorldVTT#673). */

const globals = globalThis as Record<string, unknown>;

afterEach(() => {
  delete globals.canvas;
});

describe("darknessFromLighting", () => {
  it("counts a point of darkness per tenth of the way to black night", () => {
    expect(darknessFromLighting({ level: 0 })).toBe(0);
    expect(darknessFromLighting({ level: 0.44 })).toBe(4);
    expect(darknessFromLighting({ level: 1 })).toBe(10);
    expect(darknessFromLighting({ level: Number.NaN })).toBe(0);
  });

  it("leaves at most 3 where a light reaches, none in daylight, and total in unnatural darkness", () => {
    expect(darknessFromLighting({ level: 1, inLight: true })).toBe(LIT_DARKNESS);
    expect(darknessFromLighting({ level: 0.2, inLight: true })).toBe(2);
    expect(darknessFromLighting({ level: 1, daylight: true })).toBe(0);
    expect(darknessFromLighting({ level: 0, daylight: true, unnaturalDarkness: true })).toBe(10);
  });
});

describe("darknessPenaltyFor", () => {
  it("is -1 to -9 after Night Vision, and -10 in total darkness unless the eyes see in it", () => {
    expect(darknessPenaltyFor(0)).toBe(0);
    expect(darknessPenaltyFor(6)).toBe(-6);
    expect(darknessPenaltyFor(6, { nightVision: 4 })).toBe(-2);
    expect(darknessPenaltyFor(10)).toBe(-10);
    expect(darknessPenaltyFor(10, { nightVision: 9 })).toBe(-10);
    expect(darknessPenaltyFor(10, { darkVision: true })).toBe(0);
    expect(darknessPenaltyFor(10, { infravision: true })).toBe(0);
  });
});

/** A scene drawn on the canvas with lighting that answers as told. */
function drawnScene(options: {
  level?: number;
  regionLevel?: (p: any) => number | null;
  lights?: Array<(p: any) => boolean>;
  darknessSources?: Array<(p: any) => boolean>;
  global?: { enabled: boolean; bright: boolean; min?: number; max?: number };
}) {
  const scene = {
    grid: { size: 100 },
    environment: {
      darknessLevel: options.level ?? 0,
      globalLight: { enabled: options.global?.enabled ?? false, bright: options.global?.bright ?? false, darkness: { min: options.global?.min ?? 0, max: options.global?.max ?? 1 } },
    },
  };
  const globalLightSource = { active: options.global?.enabled ?? false, data: { bright: 5000, darkness: { min: options.global?.min ?? 0, max: options.global?.max ?? 1 } } };
  globals.canvas = {
    scene,
    environment: { globalLightSource },
    effects: {
      getDarknessLevel: (p: any) => options.regionLevel?.(p) ?? scene.environment.darknessLevel,
      testInsideLight: (p: any, opts: any) => {
        if (globalLightSource.active && opts?.condition?.(globalLightSource) !== false) return true;
        return (options.lights ?? []).some((test) => test(p));
      },
      testInsideDarkness: (p: any) => (options.darknessSources ?? []).some((test) => test(p)),
    },
  };
  return scene;
}

describe("darknessAt", () => {
  it("reads the scene's darkness at a point", () => {
    const scene = drawnScene({ level: 0.6 });
    expect(darknessAt(scene, { x: 50, y: 50 })).toEqual({
      darkness: 6,
      total: false,
      penalty: -6,
      lighting: { level: 0.6, daylight: false, inLight: false, unnaturalDarkness: false },
    });
  });

  it("reads a darkness region's level, a light and a darkness source where the spot is", () => {
    const scene = drawnScene({
      level: 1,
      regionLevel: (p) => (p.x < 100 ? 0.3 : null),
      lights: [(p) => p.x >= 500 && p.x < 700],
      darknessSources: [(p) => p.x >= 900],
    });
    expect(darknessAt(scene, { x: 50, y: 0 })?.darkness).toBe(3);
    expect(darknessAt(scene, { x: 300, y: 0 })).toMatchObject({ darkness: 10, total: true, penalty: -10 });
    expect(darknessAt(scene, { x: 600, y: 0 })).toMatchObject({ darkness: 3, penalty: -3, lighting: { inLight: true } });
    expect(darknessAt(scene, { x: 950, y: 0 })).toMatchObject({ darkness: 10, lighting: { unnaturalDarkness: true } });
  });

  it("takes the scene's global light as daylight when bright, as one more light when dim", () => {
    expect(darknessAt(drawnScene({ level: 0.9, global: { enabled: true, bright: true } }), { x: 0, y: 0 })?.darkness).toBe(0);
    expect(darknessAt(drawnScene({ level: 0.9, global: { enabled: true, bright: false } }), { x: 0, y: 0 })?.darkness).toBe(3);
    // Past the darkness it is on up to, it lights nothing.
    expect(darknessAt(drawnScene({ level: 0.9, global: { enabled: true, bright: true, max: 0.5 } }), { x: 0, y: 0 })?.darkness).toBe(9);
  });

  it("reads at a token's centre, for an observer's eyes", () => {
    const scene = drawnScene({ level: 0.5, lights: [(p) => p.x === 250 && p.y === 150] });
    const doc = { documentName: "Token", x: 200, y: 100, width: 1, height: 1, elevation: 0, parent: scene, object: null };
    const owl = { system: { derived: { vision: { nightVision: 2 } } } };
    expect(darknessAt(null, doc, { observer: owl })).toMatchObject({ darkness: 3, penalty: -1 });
    const placeable = { document: { ...doc }, center: { x: 250, y: 150 } };
    (placeable.document as any).object = placeable;
    expect(darknessAt(null, placeable)).toMatchObject({ darkness: 3, penalty: -3 });
  });

  it("reads a scene not drawn from its settings alone", () => {
    drawnScene({ level: 0 });
    const other = { grid: { size: 100 }, environment: { darknessLevel: 0.8, globalLight: { enabled: false } } };
    expect(darknessAt(other, { x: 0, y: 0 })).toMatchObject({ darkness: 8, penalty: -8 });
  });

  it("gives null for a spot it can't place, and is on the API as areas.darknessAt", () => {
    drawnScene({ level: 0 });
    expect(darknessAt(null, { x: "here" })).toBeNull();
    expect(createApi().areas.darknessAt).toBe(darknessAt);
  });
});
