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
    expect(api.hooks).toEqual({ registerRules: REGISTER_RULES_HOOK, ready: READY_HOOK, partyChanged: "gworld.partyChanged", campaignChanged: "gworld.campaignChanged" });
  });

  it("reaches the party: whose it is, its members and the campaign's terms (since 1.68.0)", () => {
    const api = createApi();
    expect(Object.keys(api.party).sort()).toEqual(["addMembers", "campaignTerms", "membersOf", "of", "removeMember"]);
    // Nothing is in a party where there is no world.
    expect(api.party.of({ uuid: "Actor.nobody", type: "character" })).toBeNull();
    // Since 1.82.0 the terms are the world's: a character in no party still has them.
    expect(api.party.campaignTerms({ uuid: "Actor.nobody", type: "character" })).toEqual({ party: null, tl: null, startingPoints: null, disadvantageLimit: null });
    expect(api.party.campaignTerms({ uuid: "Actor.monster", type: "npc" })).toBeNull();
    expect(api.world.campaignTerms()).toEqual({ tl: null, startingPoints: null, disadvantageLimit: null });
  });

  it("reaches the hazards: shocks and radiation (since 1.63.0)", () => {
    const api = createApi();
    expect(typeof api.hazards.shock).toBe("function");
    expect(typeof api.hazards.irradiate).toBe("function");
  });

  it("gives armour back spent ablative DR, never below none (since 1.59.0)", async () => {
    const api = createApi();
    const piece = (drLost: number, extra: Record<string, unknown> = {}) => {
      const item = { type: "armor", isOwner: true, system: { drLost }, update: vi.fn(async (change: Record<string, number>) => { item.system.drLost = change["system.drLost"]!; }), ...extra };
      return item;
    };
    const screen = piece(12);
    expect(await api.items.restoreDr(screen, 5)).toBe(7);
    expect(await api.items.restoreDr(screen, 50)).toBe(0);
    expect(screen.system.drLost).toBe(0);
    const whole = piece(0);
    expect(await api.items.restoreDr(whole, 3)).toBe(0);
    expect(whole.update).not.toHaveBeenCalled();
    expect(await api.items.restoreDr(piece(4, { isOwner: false }), 1)).toBeNull();
    expect(await api.items.restoreDr(piece(4, { type: "equipment" }), 1)).toBeNull();
  });

  it("wears armour's DR down for good, never below none (since 1.99.0)", async () => {
    const api = createApi();
    const piece = (system: Record<string, unknown>, extra: Record<string, unknown> = {}) => {
      const item = {
        id: "vest", type: "armor", isOwner: true, system: { dr: 6, drLost: 0, locations: [], ...system } as Record<string, any>,
        update: vi.fn(async (change: Record<string, number>) => { item.system.drLost = change["system.drLost"]!; }),
        ...extra,
      };
      return item;
    };
    const vest = piece({ locations: ["torso", "vitals"] });
    expect(await api.items.wearDr(vest, 2, { location: "torso", reason: "Acid" }))
      .toEqual({ itemId: "vest", from: 0, to: 2, location: "torso", reason: "Acid" });
    expect(vest.system.drLost).toBe(2);
    // No further than the DR it has.
    expect(await api.items.wearDr(vest, 10)).toEqual({ itemId: "vest", from: 2, to: 6, location: "", reason: "" });
    vest.update.mockClear();
    expect((await api.items.wearDr(vest, 1))?.to).toBe(6);
    expect(vest.update).not.toHaveBeenCalled();
    // restoreDr gives back what wearDr took.
    expect(await api.items.restoreDr(vest, 6)).toBe(0);

    // A place the piece doesn't cover wears nothing; a field covers everything.
    expect(await api.items.wearDr(vest, 1, { location: "skull" })).toBeNull();
    const field = piece({ locations: ["torso"], forceField: true });
    expect((await api.items.wearDr(field, 1, { location: "skull" }))?.to).toBe(1);
    // A place the piece armours differently wears to its own figure.
    const suit = piece({ dr: 4, drByLocation: [{ locations: ["torso"], dr: 8 }] });
    expect((await api.items.wearDr(suit, 20, { location: "torso" }))?.to).toBe(8);

    expect(await api.items.wearDr(piece({}), 0)).toBeNull();
    expect((await api.items.wearDr(piece({}), 1.9))?.to).toBe(1);
    expect(await api.items.wearDr(piece({}, { isOwner: false }), 1)).toBeNull();
    expect(await api.items.wearDr(piece({}, { type: "equipment" }), 1)).toBeNull();
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

  it("carries every rules module, slam damage included (sargas79/GWorldVTT#284)", () => {
    const api = createApi();
    expect(api.rules.slamDamage(18, 12)).toEqual({ dice: 2, modifier: 0 });
    expect(api.rules.fragmentationRadius(2)).toBe(10);
    expect(typeof api.rules.blastRadius).toBe("function");
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
