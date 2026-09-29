import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { pulledFormula } from "../pulled-blow.js";

/** Registries are module-level state, so each test loads a fresh copy. */
async function load() {
  vi.resetModules();
  return import("../combat-extensions.js");
}

const globals = globalThis as Record<string, unknown>;

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  delete globals.Hooks;
  vi.restoreAllMocks();
});

/** The pieces #912 and #917 left over, in the registry (API 1.187.0). */
describe("a location that lists burn takes tight-beam burning only", () => {
  it("matches a burn only when it is, or is not known not to be, tight-beam", async () => {
    const api = await load();
    expect(api.damageTypeMatches(["cr", "burn"], "burn", true)).toBe(true);
    expect(api.damageTypeMatches(["cr", "burn"], "burn", false)).toBe(false);
    // Where the caller doesn't say, any burn matches, as it did before.
    expect(api.damageTypeMatches(["cr", "burn"], "burn")).toBe(true);
    expect(api.damageTypeMatches(["cr", "burn"], "cr", false)).toBe(true);
    expect(api.damageTypeMatches(["cr"], "burn", true)).toBe(false);
  });

  it("offers the location for a laser and not for a torch", async () => {
    const api = await load();
    api.registerHitLocation({ module: "test-addon", key: "joint", label: "Joint", parent: "arm", penalty: -5, damageTypes: ["cr", "burn"] });
    expect(api.hitLocationsFor({ damageType: "burn", tightBeam: true }).map((l) => l.key)).toEqual(["test-addon.joint"]);
    expect(api.hitLocationsFor({ damageType: "burn", tightBeam: false })).toEqual([]);
    expect(api.hitLocationsFor({ damageType: "burn" }).map((l) => l.key)).toEqual(["test-addon.joint"]);
    expect(api.hitLocationsFor({ damageType: "cr", tightBeam: false }).map((l) => l.key)).toEqual(["test-addon.joint"]);
  });

  it("hands the random-hit listeners whether the blow is a tight-beam burn", async () => {
    const api = await load();
    let seen: unknown = null;
    globals.Hooks = { callAll: (_event: string, context: { tightBeam: boolean }) => { seen = context.tightBeam; } };
    api.randomLocationWithHooks(10, "torso", {}, { damageType: "burn", tightBeam: true });
    expect(seen).toBe(true);
    api.randomLocationWithHooks(10, "torso", {}, { damageType: "burn" });
    expect(seen).toBe(false);
  });
});

describe("a miss by one on a location whose fallback has its switch off", () => {
  it("lands on the parent, not on the row that isn't offered", async () => {
    const api = await load();
    let split = false;
    api.registerHitLocation({ module: "test-addon", key: "chest", label: "Chest", parent: "torso", penalty: 0, available: () => split });
    api.registerHitLocation({ module: "test-addon", key: "ear", label: "Ear", parent: "face", penalty: -7, missFallback: "test-addon.chest" });
    const none = () => false;
    expect(api.missFallbackFor({ hitLocation: "face", addonLocation: "test-addon.ear" }, none)).toEqual({ hitLocation: "torso", addonLocation: null });
    split = true;
    expect(api.missFallbackFor({ hitLocation: "face", addonLocation: "test-addon.ear" }, none)).toEqual({ hitLocation: "torso", addonLocation: "test-addon.chest" });
  });
});

describe("a crippling divisor that reads the body's limbs", () => {
  it("is given the arms and legs", async () => {
    const api = await load();
    api.registerHitLocation({
      module: "test-addon", key: "joint", label: "Joint", parent: "arm", penalty: -5,
      cripplingDivisor: (_type, limbs) => (limbs?.arms ?? 2) + 1,
    });
    expect(api.locationOverrides("test-addon.joint", "cr", 12)).toMatchObject({ cripplingThreshold: 4 });
    expect(api.locationOverrides("test-addon.joint", "cr", 12, { arms: 4, legs: 2 })).toMatchObject({ cripplingThreshold: 12 / 5 });
  });
});

describe("a pulled Head Butt or Stamp Kick", () => {
  const base = { strength: 16, chosen: 10, stBased: true, damageBase: "thr", damageModifier: 0, minSt: null, dx: 12, skills: { Brawling: 12 } };

  it("re-reads its damage at the pulled ST", () => {
    // ST 10 thrusts 1d-2: a butt is thrust-1 on it, and a stamp kick thrust+1.
    expect(pulledFormula({ ...base, naturalKey: "headButt" })).toBe("1d-3");
    expect(pulledFormula({ ...base, naturalKey: "stampKick" })).toBe("1d-1");
  });

  it("adds a rigid helm's +1 to the butt", () => {
    expect(pulledFormula({ ...base, naturalKey: "headButt", rigidHelm: true })).toBe("1d-2");
  });

  it("keeps the close-combat swing penalty a weapon's row carries in its modifier", () => {
    // ST 10 swings 1d; a greatsword's -2 for its reach 2 is in the row's modifier.
    expect(pulledFormula({ ...base, damageBase: "sw", damageModifier: -2, naturalKey: "" })).toBe("1d-2");
  });
});
