import { afterEach, describe, expect, it, vi } from "vitest";

import { createApi } from "../api.js";
import { darknessAt, lightCountsFor, litForOf, registerLightLevel, registerLitFor, setLitFor } from "../darkness.js";
import { lightFrom } from "../modifier-areas.js";
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
  /** Lights with the placeable they belong to, for the lights only some can see. */
  sources?: Array<{ test: (p: any) => boolean; object: any; at?: { x: number; y: number } }>;
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
        if ((options.lights ?? []).some((test) => test(p))) return true;
        return (options.sources ?? []).some((source) => opts?.condition?.(source) !== false && source.test(p));
      },
      testInsideDarkness: (p: any) => (options.darknessSources ?? []).some((test) => test(p)),
      // The light sources, with the global light among them as Foundry keeps it.
      lightSources: new Map<string, any>([
        ["global", globalLightSource],
        ...(options.sources ?? []).map((source, i): [string, any] => [
          `light${i}`, { active: true, object: source.object, data: source.at ?? { x: 0, y: 0 }, testPoint: source.test },
        ]),
      ]),
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
      lightAreas: [],
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

/** Lights only some viewers can see (sargas79/GWorldVTT#687). */
describe("lights only some can see", () => {
  /** A light placeable whose document carries the mark, as Foundry's flags hold it. */
  const lamp = (litFor?: string) => {
    const document: any = { documentName: "AmbientLight", isOwner: true, flags: litFor ? { gworld: { litFor } } : {} };
    document.update = async (change: Record<string, unknown>) => {
      for (const [path, value] of Object.entries(change)) {
        if (path === "flags.gworld.-=litFor") delete document.flags.gworld?.litFor;
        else if (path === "flags.gworld.litFor") document.flags.gworld = { ...(document.flags.gworld ?? {}), litFor: value };
      }
    };
    return { document };
  };
  const goggles = { name: "wearer", gear: "goggles" };
  const bare = { name: "bare" };

  it("registers a kind of light with its test, once, under <module>.<key>", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(registerLitFor({ module: "test-mod", key: "infrared", test: (observer) => observer?.gear === "goggles" })).toBe("test-mod.infrared");
    expect(registerLitFor({ module: "test-mod", key: "infrared", test: () => true })).toBeNull();
    expect(registerLitFor({ module: "", key: "x", test: () => true })).toBeNull();
    expect(registerLitFor({ module: "test-mod", key: "none" } as any)).toBeNull();
    expect(warn).toHaveBeenCalledTimes(3);
  });

  it("counts a marked light only for the observers its test passes", () => {
    expect(lightCountsFor(lamp().document, null)).toBe(true);
    const infrared = lamp("test-mod.infrared");
    expect(lightCountsFor(infrared, goggles)).toBe(true);
    expect(lightCountsFor(infrared, bare)).toBe(false);
    // Nobody's eyes, or a kind no module registered: it counts for nobody.
    expect(lightCountsFor(infrared, null)).toBe(false);
    expect(lightCountsFor(lamp("gone-mod.uv"), goggles)).toBe(false);
  });

  it("lights the spot in darknessAt only for an observer who sees the light", () => {
    const scene = drawnScene({ level: 1, sources: [{ test: (p) => p.x < 500, object: lamp("test-mod.infrared") }] });
    const wearer = { ...goggles, system: { derived: { vision: {} } } };
    expect(darknessAt(scene, { x: 100, y: 0 }, { observer: wearer })).toMatchObject({ darkness: 3, penalty: -3, lighting: { inLight: true } });
    expect(darknessAt(scene, { x: 100, y: 0 }, { observer: { ...bare, system: {} } })).toMatchObject({ darkness: 10, total: true });
    expect(darknessAt(scene, { x: 100, y: 0 })).toMatchObject({ darkness: 10 });
    // An ordinary light beside it still lights the spot for everyone.
    const lit = drawnScene({ level: 1, sources: [{ test: () => true, object: lamp() }] });
    expect(darknessAt(lit, { x: 100, y: 0 })?.darkness).toBe(3);
  });

  it("marks and unmarks a light or a token, for a user who may change it", async () => {
    const light = lamp();
    expect(await setLitFor(light, "test-mod.infrared")).toBe(true);
    expect(litForOf(light)).toBe("test-mod.infrared");
    expect(await setLitFor(light.document, null)).toBe(true);
    expect(litForOf(light)).toBeNull();
    expect(await setLitFor(light, "not an id")).toBe(false);
    expect(await setLitFor(light, "a.b.c")).toBe(false);
    expect(await setLitFor({ document: { ...light.document, isOwner: false } }, "test-mod.infrared")).toBe(false);
    expect(await setLitFor({ documentName: "Tile", isOwner: true }, "test-mod.infrared")).toBe(false);
    const token = { documentName: "Token", isOwner: true, flags: { gworld: { litFor: "test-mod.infrared" } } };
    expect(litForOf(token)).toBe("test-mod.infrared");
  });

  it("is on the API under areas", () => {
    const api = createApi();
    expect(api.areas.registerLitFor).toBe(registerLitFor);
    expect(api.areas.setLitFor).toBe(setLitFor);
    expect(api.areas.litFor).toBe(litForOf);
  });
});

describe("a module's light on an area (sargas79/GWorldVTT#693)", () => {
  /** A drawn scene in total darkness with these areas kept on it. */
  const withAreas = (areas: any[]) => {
    const scene: any = drawnScene({ level: 1 });
    scene.flags = { gworld: { modifierAreas: areas } };
    return scene;
  };
  const lantern = (light: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
    ({ id: "lantern", label: "Lantern", center: { x: 0, y: 0 }, radius: null, lines: [], light: { radius: 500, darknessCap: 3, litFor: null, ...light }, ...extra });

  it("turns total darkness to 3 within its radius, and leaves it alone beyond", () => {
    const scene = withAreas([lantern({})]);
    expect(darknessAt(scene, { x: 300, y: 0 })).toMatchObject({ darkness: 3, penalty: -3, lighting: { inLight: true }, lightAreas: ["lantern"] });
    expect(darknessAt(scene, { x: 600, y: 0 })).toMatchObject({ darkness: 10, lightAreas: [] });
  });

  it("leaves at most its own cap, the least of the lights that reach", () => {
    const scene = withAreas([lantern({ darknessCap: 5 }), { ...lantern({ darknessCap: 7 }), id: "candle" }]);
    expect(darknessAt(scene, { x: 100, y: 0 })).toMatchObject({ darkness: 5, lighting: { inLight: false }, lightAreas: ["lantern", "candle"] });
  });

  it("gives no light once it has expired, or into unnatural darkness", () => {
    (globalThis as any).game = { time: { worldTime: 100 } };
    try {
      expect(darknessAt(withAreas([lantern({}, { expires: 50 })]), { x: 0, y: 0 })?.darkness).toBe(10);
      expect(darknessAt(withAreas([lantern({}, { expires: 150 })]), { x: 0, y: 0 })?.darkness).toBe(3);
    } finally {
      delete (globalThis as any).game;
    }
    const dark: any = drawnScene({ level: 1, darknessSources: [() => true] });
    dark.flags = { gworld: { modifierAreas: [lantern({})] } };
    expect(darknessAt(dark, { x: 0, y: 0 })?.darkness).toBe(10);
  });

  it("counts a light only some can see only for those its kind's test passes", () => {
    registerLitFor({ module: "test-mod", key: "lantern-uv", test: (observer, light) => observer?.gear === "goggles" && light?.id === "lantern" });
    const scene = withAreas([lantern({ litFor: "test-mod.lantern-uv" })]);
    expect(darknessAt(scene, { x: 0, y: 0 }, { observer: { gear: "goggles", system: {} } })?.darkness).toBe(3);
    expect(darknessAt(scene, { x: 0, y: 0 }, { observer: { system: {} } })?.darkness).toBe(10);
    expect(darknessAt(scene, { x: 0, y: 0 })?.darkness).toBe(10);
  });

  it("is read from yards, the area's radius standing in for its own", () => {
    expect(lightFrom({}, { x: 0, y: 0 }, 4, 100)).toEqual({ radius: 400, darknessCap: 3, litFor: null });
    expect(lightFrom({ radius: 10, darknessCap: 12, litFor: "a.b" }, { x: 0, y: 0 }, 0, 50)).toEqual({ radius: 500, darknessCap: 10, litFor: "a.b" });
    expect(lightFrom({ radius: 2, litFor: "not a kind" }, { x: 0, y: 0 }, 0, 100)?.litFor).toBeNull();
    expect(lightFrom({}, { x: 0, y: 0 }, 0, 100)).toBeNull();
    expect(lightFrom({ radius: 5 }, null, 0, 100)).toBeNull();
  });
});

/**
 * A light that leaves its own darkness level (sargas79/GWorldVTT#730). Kept
 * last: a registered light level stays for the rest of the file.
 */
describe("a light's own darkness level", () => {
  /** A lamp whose document carries a test module's mark of how bright it is. */
  const lamp = (brightness?: number, litFor?: string) => ({
    document: { documentName: "AmbientLight", flags: { gworld: litFor ? { litFor } : {}, "test-mod": brightness === undefined ? {} : { brightness } } },
  });
  const brightnessOf = (light: any): number | undefined => light?.flags?.["test-mod"]?.brightness;

  it("registers a light level once, under <module>.<key>", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    // A lamp leaves 1 within 2 yards, -5 (as a penalty) out to 5, and 8 beyond;
    // a light it doesn't know is left its own.
    expect(registerLightLevel({
      module: "test-mod",
      key: "falloff",
      level: (_observer, light, spot) => {
        if (brightnessOf(light) !== 1) return null;
        return spot.distance <= 2 ? 1 : spot.distance <= 5 ? -5 : 8;
      },
    })).toBe("test-mod.falloff");
    expect(registerLightLevel({ module: "test-mod", key: "falloff", level: () => 0 })).toBeNull();
    expect(registerLightLevel({ module: "test mod", key: "x", level: () => 0 })).toBeNull();
    expect(registerLightLevel({ module: "test-mod", key: "none" } as any)).toBeNull();
    expect(warn).toHaveBeenCalledTimes(3);
    warn.mockRestore();
  });

  it("leaves the level a light source's reading gives, by the spot's distance from it", () => {
    const scene = drawnScene({ level: 1, sources: [{ test: (p) => p.x < 1000, object: lamp(1), at: { x: 0, y: 0 } }] });
    expect(darknessAt(scene, { x: 100, y: 0 })).toMatchObject({ darkness: 1, penalty: -1, lighting: { inLight: true } });
    // Four yards off, it lifts total darkness only to -5, and the spot is not in light.
    expect(darknessAt(scene, { x: 400, y: 0 })).toMatchObject({ darkness: 5, penalty: -5, lighting: { inLight: false } });
    expect(darknessAt(scene, { x: 800, y: 0 })?.darkness).toBe(8);
    // Beyond the light's reach, nothing.
    expect(darknessAt(scene, { x: 1200, y: 0 })?.darkness).toBe(10);
    // Never darker than the scene already is.
    expect(darknessAt(drawnScene({ level: 0.4, sources: [{ test: () => true, object: lamp(1) }] }), { x: 400, y: 0 })?.darkness).toBe(4);
  });

  it("leaves a light no reading knows the torch's 3, and takes the best of the lights that reach", () => {
    const plain = drawnScene({ level: 1, sources: [{ test: () => true, object: lamp() }] });
    expect(darknessAt(plain, { x: 400, y: 0 })).toMatchObject({ darkness: 3, lighting: { inLight: true } });
    const both = drawnScene({ level: 1, sources: [{ test: () => true, object: lamp(1) }, { test: () => true, object: lamp() }] });
    expect(darknessAt(both, { x: 800, y: 0 })?.darkness).toBe(3);
    expect(darknessAt(both, { x: 100, y: 0 })?.darkness).toBe(1);
  });

  it("takes the least of the registered readings, and ignores one that fails", () => {
    registerLightLevel({ module: "test-mod", key: "broken", level: () => { throw new Error("no"); } });
    registerLightLevel({ module: "test-mod", key: "floodlight", level: (_o, light) => (brightnessOf(light) === 2 ? 0 : brightnessOf(light) === 1 ? 6 : undefined) });
    const scene = drawnScene({ level: 1, sources: [{ test: () => true, object: lamp(1) }] });
    // The falloff gives 5 four yards off, the other reading 6: the least counts.
    expect(darknessAt(scene, { x: 400, y: 0 })?.darkness).toBe(5);
    expect(darknessAt(drawnScene({ level: 1, sources: [{ test: () => true, object: lamp(2) }] }), { x: 0, y: 0 })).toMatchObject({ darkness: 0, penalty: 0 });
  });

  it("reads a module's light on an area in place of its darkness cap, and passes the observer", () => {
    const seen: any[] = [];
    registerLightLevel({ module: "test-mod", key: "area-lamp", level: (observer, light, spot) => {
      if (light?.id !== "flare") return null;
      seen.push({ observer, distance: spot.distance });
      return spot.distance < 3 ? 2 : 7;
    } });
    const scene: any = drawnScene({ level: 1 });
    scene.flags = { gworld: { modifierAreas: [{ id: "flare", label: "Flare", center: { x: 0, y: 0 }, radius: null, lines: [], light: { radius: 1000, darknessCap: 3, litFor: null } }] } };
    const watcher = { name: "watcher", system: {} };
    expect(darknessAt(scene, { x: 100, y: 0 }, { observer: watcher })).toMatchObject({ darkness: 2, lighting: { inLight: true }, lightAreas: ["flare"] });
    expect(darknessAt(scene, { x: 500, y: 0 })).toMatchObject({ darkness: 7, lighting: { inLight: false }, lightAreas: ["flare"] });
    expect(seen).toEqual([{ observer: watcher, distance: 1 }, { observer: null, distance: 5 }]);
  });

  it("still counts a light only some can see only for them, and gets no light into unnatural darkness", () => {
    registerLitFor({ module: "test-mod", key: "level-uv", test: (observer) => observer?.gear === "goggles" });
    const scene = drawnScene({ level: 1, sources: [{ test: () => true, object: lamp(1, "test-mod.level-uv") }] });
    expect(darknessAt(scene, { x: 100, y: 0 }, { observer: { gear: "goggles", system: {} } })?.darkness).toBe(1);
    expect(darknessAt(scene, { x: 100, y: 0 }, { observer: { system: {} } })?.darkness).toBe(10);
    const dark = drawnScene({ level: 1, sources: [{ test: () => true, object: lamp(2) }], darknessSources: [() => true] });
    expect(darknessAt(dark, { x: 0, y: 0 })?.darkness).toBe(10);
  });

  it("is on the API as areas.registerLightLevel", () => {
    expect(createApi().areas.registerLightLevel).toBe(registerLightLevel);
  });
});
