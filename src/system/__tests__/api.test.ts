import { afterEach, describe, expect, it, vi } from "vitest";

import { API_VERSION, READY_HOOK, createApi, warnIncompatibleModules } from "../api.js";
import { incompatibleModules, parseVersion, satisfiesApiRange } from "../api-version.js";
import { REGISTER_RULES_HOOK } from "../rule-registry.js";

const globals = globalThis as Record<string, unknown>;

afterEach(() => {
  delete globals.game;
  delete globals.ui;
  delete globals.canvas;
  vi.restoreAllMocks();
});

/** The public API for add-on modules (sargas79/GWorldVTT#237). */
describe("the add-on API", () => {
  it("carries a semver version and the hook names", () => {
    const api = createApi();
    expect(parseVersion(api.version)).not.toBeNull();
    expect(api.version).toBe(API_VERSION);
    expect(api.hooks).toEqual({ registerRules: REGISTER_RULES_HOOK, ready: READY_HOOK });
  });

  it("is frozen, so a module can't swap out part of it", () => {
    const api = createApi();
    expect(Object.isFrozen(api)).toBe(true);
    expect(Object.isFrozen(api.roll)).toBe(true);
    expect(Object.isFrozen(api.registry)).toBe(true);
  });

  it("rolls a success roll and works out a wound from the pure rules, with nothing imported", () => {
    const api = createApi();
    // A 10 against skill 12 succeeds by 2.
    const outcome = api.rules.resolveSuccess(10, 12);
    expect(outcome.success).toBe(true);
    expect(outcome.margin).toBe(2);
    // Six points of injury on a 10 HP character is a major wound.
    expect(api.rules.isMajorWound(6, 10)).toBe(true);
  });

  it("reads a character's attributes, skill levels and Basic Lift from what the system worked out", () => {
    const api = createApi();
    const actor = {
      system: { derived: { attributes: { ST: 12, DX: 13, IQ: 10, HT: 11 }, will: 11, per: 12, basicLift: 29 } },
      items: [
        { type: "skill", name: "Guns/TL8 (Pistol)", system: { derived: { level: 14 } } },
        { type: "trait", name: "Guns (Pistol)", system: {} },
      ],
    };
    expect(api.actors.attribute(actor, "DX")).toBe(13);
    expect(api.actors.attribute(actor, "Will")).toBe(11);
    expect(api.actors.skillLevel(actor, "Guns (Pistol)")).toBe(14);
    expect(api.actors.skillLevel(actor, "Swimming")).toBeNull();
    expect(api.actors.basicLift(actor)).toBe(29);
    expect(api.actors.attribute({}, "ST")).toBeNull();
  });

  it("says the mana where spells are cast: the scene's over the world's, and normal with the rule off (sargas79/GWorldVTT#276)", () => {
    const api = createApi();
    const world = (rules: Record<string, boolean>, sceneLevel: string | null) => {
      const settings: Record<string, unknown> = { "gworld.manaLevel": "low", "gworld.optionalRules": rules };
      globals.canvas = undefined;
      globals.game = {
        settings: { get: (scope: string, key: string) => settings[`${scope}.${key}`] },
        scenes: { active: { getFlag: () => sceneLevel } },
      };
    };
    world({}, null);
    expect(api.magic.manaLevel()).toEqual({ level: "low", inPlay: true });
    world({}, "high");
    expect(api.magic.manaLevel()).toEqual({ level: "high", inPlay: true });
    world({ manaLevels: false }, "high");
    expect(api.magic.manaLevel()).toEqual({ level: "normal", inPlay: false });
  });

  it("puts an owned actor in one of the system's postures, and nothing else (sargas79/GWorldVTT#282)", async () => {
    const api = createApi();
    const update = vi.fn(async () => {});
    const actor = { isOwner: true, system: { posture: "standing" }, update };
    expect(await api.actors.setPosture(actor, "crouching")).toBe(true);
    expect(update).toHaveBeenCalledWith({ "system.posture": "crouching" });
    expect(await api.actors.setPosture(actor, "floating")).toBe(false);
    expect(await api.actors.setPosture({ ...actor, isOwner: false }, "kneeling")).toBe(false);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("answers whether it satisfies a range", () => {
    const api = createApi();
    expect(api.satisfies("^1.0.0")).toBe(true);
    expect(api.satisfies(">=2.0.0")).toBe(false);
  });
});

describe("API version ranges", () => {
  it.each([
    ["1.0.0", "1.0.0", true],
    ["1.2.3", "^1.0.0", true],
    ["2.0.0", "^1.0.0", false],
    ["0.2.5", "^0.2.0", true],
    ["0.3.0", "^0.2.0", false],
    ["1.2.9", "~1.2.0", true],
    ["1.3.0", "~1.2.0", false],
    ["1.4.0", ">=1.2.0 <2.0.0", true],
    ["2.0.0", ">=1.2.0 <2.0.0", false],
    ["1.7.1", "1.x", true],
    ["1.7.1", "1.6.x", false],
    ["3.0.0", "^1.0.0 || ^3.0.0", true],
    ["1.0.0", "*", true],
    ["1.0.0", "", false],
    ["1.0.0", "whenever", false],
  ])("%s against %s is %s", (version, range, expected) => {
    expect(satisfiesApiRange(version, range)).toBe(expected);
  });

  it("names the active modules whose declared range isn't met, and ignores the rest", () => {
    const modules = [
      { id: "ok", title: "OK", active: true, flags: { gworld: { apiVersion: "^1.0.0" } } },
      { id: "too-new", title: "Too New", active: true, flags: { gworld: { apiVersion: "^2.0.0" } } },
      { id: "off", title: "Off", active: false, flags: { gworld: { apiVersion: "^9.0.0" } } },
      { id: "silent", title: "Silent", active: true },
    ];
    expect(incompatibleModules("1.0.0", modules)).toEqual([{ id: "too-new", title: "Too New", range: "^2.0.0" }]);
  });

  it("warns the GM once per incompatible module, and players not at all", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const warn = vi.fn();
    const modules = new Map([["too-new", { id: "too-new", title: "Too New", active: true, flags: { gworld: { apiVersion: "^9.0.0" } } }]]);
    globals.ui = { notifications: { warn } };
    globals.game = { user: { isGM: false }, modules, i18n: { format: (key: string) => key } };
    warnIncompatibleModules();
    expect(warn).not.toHaveBeenCalled();
    (globals.game as { user: { isGM: boolean } }).user.isGM = true;
    warnIncompatibleModules();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith("GWORLD.Api.Incompatible", { permanent: true });
  });
});
