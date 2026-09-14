import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { computeInjury } from "../../rules/damage.js";

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

const context = (overrides: Record<string, unknown> = {}) => ({
  actor: { id: "a" },
  item: null,
  ranged: false,
  damageType: "cut",
  reach: "1",
  effectiveSkill: 12,
  maneuver: "attack",
  targets: [],
  chosen: {},
  ...overrides,
});

/** Combat extension points for add-on modules (sargas79/GWorldVTT#238). */
describe("registered maneuvers", () => {
  it("adds a module's maneuver beside the system's, with its allowances", async () => {
    const api = await load();
    expect(api.registerManeuver({
      module: "test-addon", key: "careful", label: "Careful Attack", movement: "step", defense: "any", attacks: true,
      options: [{ key: "a", label: "A" }],
    })).toBe("test-addon.careful");
    expect(api.maneuverKeys()).toContain("test-addon.careful");
    expect(api.maneuverKeys()).toContain("allOutAttack");
    expect(api.maneuverInfo("test-addon.careful")).toMatchObject({ movement: "step", defense: "any", attacks: true });
    expect(api.maneuverAllowsParry("test-addon.careful")).toBe(true);
    expect(api.maneuverAllowsDefense("allOutAttack")).toBe(false);
    expect(api.maneuverAllowsParry("moveAndAttack")).toBe(false);
  });

  it("reads an unknown maneuver as Do Nothing, and refuses a malformed one", async () => {
    const api = await load();
    expect(api.maneuverInfo("gone-addon.x").key).toBe("doNothing");
    expect(api.registerManeuver({ module: "test-addon", key: "bad", label: "Bad", movement: "sprint" as never, defense: "any", attacks: false })).toBeNull();
  });
});

describe("attack options", () => {
  it("offers an option only where it applies and is available, and merges what the chosen ones do", async () => {
    const api = await load();
    let switchOn = false;
    api.registerAttackOption({
      module: "test-addon", key: "careful", label: "Careful", attack: "melee",
      available: () => switchOn,
      apply: () => ({ modifiers: [{ label: "Careful", value: 4 }], defenseModifiers: [{ label: "Careful", value: 2 }], criticalSkill: 12 }),
    });
    api.registerAttackOption({
      module: "test-addon", key: "heavy", label: "Heavy", input: { type: "number", min: 0, max: 3 },
      apply: (_c, value) => ({ damageModifiers: [{ label: "Heavy", value: Number(value) }], fatigue: 1 }),
    });

    expect(api.attackOptionsFor(context()).map((o) => o.key)).toEqual(["test-addon.heavy"]);
    switchOn = true;
    expect(api.attackOptionsFor(context()).map((o) => o.key)).toEqual(["test-addon.careful", "test-addon.heavy"]);
    expect(api.attackOptionsFor(context({ ranged: true })).map((o) => o.key)).toEqual(["test-addon.heavy"]);

    const effect = api.applyAttackOptions(context(), { "test-addon.careful": true, "test-addon.heavy": 2 });
    expect(effect.modifiers).toEqual([{ label: "Careful", value: 4 }]);
    expect(effect.defenseModifiers).toEqual([{ label: "Careful", value: 2 }]);
    expect(effect.damageModifiers).toEqual([{ label: "Heavy", value: 2 }]);
    expect(effect.criticalSkill).toBe(12);
    expect(effect.fatigue).toBe(1);
  });

  it("skips a refused option even when its value was submitted, and shows it disabled with the reason", async () => {
    const api = await load();
    api.registerAttackOption({
      module: "test-addon", key: "never", label: "Never",
      refuse: () => "Not with this weapon",
      apply: () => ({ modifiers: [{ label: "Never", value: 9 }] }),
    });
    expect(api.applyAttackOptions(context(), { "test-addon.never": true }).modifiers).toEqual([]);
    expect(api.attackOptionFields(context())).toContain('disabled title="Not with this weapon"');
  });

  it("lets an option refuse because of another chosen one", async () => {
    const api = await load();
    api.registerAttackOption({ module: "test-addon", key: "a", label: "A", apply: () => ({ modifiers: [{ label: "A", value: 1 }] }) });
    api.registerAttackOption({
      module: "test-addon", key: "b", label: "B",
      refuse: (c) => ("test-addon.a" in c.chosen ? "Not with A" : null),
      apply: () => ({ modifiers: [{ label: "B", value: 1 }] }),
    });
    expect(api.applyAttackOptions(context(), { "test-addon.a": true, "test-addon.b": true }).modifiers).toEqual([{ label: "A", value: 1 }]);
  });

  it("keeps a throwing option from breaking the attack", async () => {
    const api = await load();
    api.registerAttackOption({ module: "test-addon", key: "boom", label: "Boom", apply: () => { throw new Error("boom"); } });
    expect(api.applyAttackOptions(context(), { "test-addon.boom": true }).modifiers).toEqual([]);
  });

  it("makes an offensive extra effort an attack option that costs its FP", async () => {
    const api = await load();
    expect(api.registerExtraEffort({
      module: "test-addon", key: "lunge", label: "Lunge", kind: "offense", fp: 1,
      apply: () => ({ reachBonus: 1 }),
    })).toBe("test-addon.lunge");
    const effect = api.applyAttackOptions(context(), { "test-addon.lunge": true });
    expect(effect.fatigue).toBe(1);
    expect(effect.reachBonus).toBe(1);
  });
});

describe("defense options", () => {
  const defense = (overrides: Record<string, unknown> = {}) => ({
    defender: {}, defense: "parry" as const, attack: "Sword", damageType: "cut", delivery: "melee", retreating: false, chosen: {},
    ...overrides,
  });

  it("applies a ticked option to the defenses it names, and hears the outcome", async () => {
    const api = await load();
    const after = vi.fn();
    api.registerDefenseOption({
      module: "test-addon", key: "guard", label: "Guard", defenses: ["parry"],
      apply: () => ({ modifiers: [{ label: "Guard", value: 1 }] }),
      after,
    });
    expect(api.defenseOptionsFor(defense({ defense: "dodge" }))).toEqual([]);
    const applied = api.applyDefenseOptions(defense(), ["test-addon.guard"]);
    expect(applied.modifiers).toEqual([{ label: "Guard", value: 1 }]);
    await applied.chosen[0]!.after(defense(), { success: true, margin: 2 });
    expect(after).toHaveBeenCalledWith(defense(), { success: true, margin: 2 });
  });

  it("puts an attack's lines on the defenses they name", async () => {
    const api = await load();
    const lines = [{ label: "All", value: 2 }, { label: "Dodge only", value: -1, defenses: ["dodge" as const] }];
    expect(api.defenseModifiersFor(lines, "parry")).toEqual([{ label: "All", value: 2 }]);
    expect(api.defenseModifiersFor(lines, "dodge")).toEqual([{ label: "All", value: 2 }, { label: "Dodge only", value: -1 }]);
  });
});

describe("hit locations", () => {
  it("registers a location on a Basic Set parent, and reads a card value back to both", async () => {
    const api = await load();
    let on = true;
    expect(api.registerHitLocation({
      module: "test-addon", key: "artery", label: "Artery", parent: "arm", penalty: -5,
      damageTypes: ["cut", "imp"], wounding: (type) => (type === "cut" ? 2 : null), cripplingDivisor: null,
      extraDr: 1, knockdown: -1, available: () => on,
    })).toBe("test-addon.artery");
    expect(api.hitLocationsFor({ damageType: "cut" }).map((l) => l.key)).toEqual(["test-addon.artery"]);
    expect(api.hitLocationsFor({ damageType: "cr" })).toEqual([]);
    on = false;
    expect(api.hitLocationsFor({ damageType: "cut" })).toEqual([]);
    expect(api.readLocationValue("addon:test-addon.artery")).toEqual({ hitLocation: "arm", addonLocation: "test-addon.artery" });
    expect(api.readLocationValue("skull")).toEqual({ hitLocation: "skull", addonLocation: null });
    expect(api.readLocationValue("addon:gone.x")).toBeNull();
    expect(api.locationOverrides("test-addon.artery", "cut", 12)).toEqual({ woundingModifier: 2, cripplingThreshold: null, extraDr: 1, knockdown: -1 });
    expect(api.locationOverrides("test-addon.artery", "imp", 12)?.woundingModifier).toBeNull();
  });

  it("refuses a location whose parent isn't a Basic Set location", async () => {
    const api = await load();
    expect(api.registerHitLocation({ module: "test-addon", key: "x", label: "X", parent: "tail" as never, penalty: -3 })).toBeNull();
  });

  it("uses a registered location's own wounding and crippling in the injury rule", () => {
    // A cut to an arm is x1.5 and cripples above HP/2; the override says x2 and never cripples.
    const plain = computeInjury({ basicDamage: 10, dr: 0, type: "cut", hitLocation: "arm", maxHp: 10 });
    expect(plain.crippled).toBe(true);
    expect(plain.injury).toBe(5);
    const artery = computeInjury({ basicDamage: 10, dr: 0, type: "cut", hitLocation: "arm", maxHp: 10, woundingOverride: 2, cripplingThreshold: null });
    expect(artery.woundingModifier).toBe(2);
    expect(artery.injury).toBe(20);
    expect(artery.crippled).toBe(false);
    // A joint that cripples above HP/3.
    const joint = computeInjury({ basicDamage: 6, dr: 0, type: "cr", hitLocation: "arm", maxHp: 12, cripplingThreshold: 4 });
    expect(joint).toMatchObject({ injury: 4, excessLost: 2, crippled: true });
  });

  it("lets a random-location hook move a blow to a registered location", async () => {
    const api = await load();
    api.registerHitLocation({ module: "test-addon", key: "spine", label: "Spine", parent: "torso", penalty: -8 });
    globals.Hooks = { callAll: (_event: string, context: { addonLocation: string | null }) => { context.addonLocation = "test-addon.spine"; } };
    expect(api.randomLocationWithHooks(10, "torso")).toEqual({ hitLocation: "torso", addonLocation: "test-addon.spine" });
  });
});

describe("hooks and state", () => {
  it("survives a listener that throws", async () => {
    const api = await load();
    globals.Hooks = { callAll: () => { throw new Error("listener"); } };
    const context = { modifiers: [] as unknown[] };
    expect(api.callCombatHook(api.COMBAT_HOOKS.attackModifiers, context)).toBe(context);
  });

  it("clears only the state whose lifetime a boundary ends", async () => {
    const api = await load();
    const state = {
      "test-addon": { parries: { lifetime: "turn" }, riposte: { lifetime: "round" }, feud: { lifetime: "combat" } },
    };
    expect(api.expiringState(state, ["turn"])).toEqual(["combatState.test-addon.parries"]);
    expect(api.expiringState(state, ["round", "turn"]).sort()).toEqual(["combatState.test-addon.parries", "combatState.test-addon.riposte"]);
    expect(api.expiringState(null, ["combat"])).toEqual([]);
  });
});
