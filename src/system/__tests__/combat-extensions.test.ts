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

  it("gives an option with a number its value, in apply and in chosen (since 1.25.0)", async () => {
    const api = await load();
    let seen: unknown = null;
    api.registerDefenseOption({
      module: "test-addon", key: "riposte", label: "Riposte", defenses: ["parry"], input: { type: "number", min: 0, max: 6 },
      apply: (context, value) => {
        seen = { value, chosen: context.chosen, shot: context.calledShot };
        return { modifiers: [{ label: "Riposte", value: -Number(value) }] };
      },
    });
    const applied = api.applyDefenseOptions(defense({ calledShot: { hitLocation: "leg", addonLocation: null } }), { "test-addon.riposte": 3 });
    expect(applied.modifiers).toEqual([{ label: "Riposte", value: -3 }]);
    expect(seen).toEqual({ value: 3, chosen: { "test-addon.riposte": 3 }, shot: { hitLocation: "leg", addonLocation: null } });
    expect(api.applyDefenseOptions(defense(), {}).modifiers).toEqual([]);
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
    expect(api.locationOverrides("test-addon.artery", "cut", 12)).toEqual({ woundingModifier: 2, cripplingThreshold: null, extraDr: 1, knockdown: -1, shockKnockdown: false, majorWoundKnockdown: null });
    expect(api.locationOverrides("test-addon.artery", "imp", 12)?.woundingModifier).toBeNull();
  });

  it("takes a location's miss-by-1 fallback, arcs and knockdown rules (since 1.22.0)", async () => {
    const api = await load();
    api.registerHitLocation({ module: "test-addon", key: "joint", label: "Joint", parent: "arm", penalty: -5, missFallback: "arm" });
    api.registerHitLocation({ module: "test-addon", key: "ear", label: "Ear", parent: "face", penalty: -7, missFallback: "test-addon.joint", majorWoundKnockdown: 0 });
    api.registerHitLocation({ module: "test-addon", key: "spine", label: "Spine", parent: "torso", penalty: -8, arcs: ["back"], shockKnockdown: true, knockdownFor: (type) => (type === "cr" ? -1 : 0) });
    api.registerHitLocation({ module: "test-addon", key: "vein", label: "Vein", parent: "neck", penalty: -8, missFallback: null });
    const torsoRule = (location: string) => ["eye", "skull", "face", "groin", "neck", "vitals"].includes(location);
    expect(api.missFallbackFor({ hitLocation: "arm", addonLocation: "test-addon.joint" }, torsoRule)).toEqual({ hitLocation: "arm", addonLocation: null });
    expect(api.missFallbackFor({ hitLocation: "face", addonLocation: "test-addon.ear" }, torsoRule)).toEqual({ hitLocation: "arm", addonLocation: "test-addon.joint" });
    expect(api.missFallbackFor({ hitLocation: "neck", addonLocation: "test-addon.vein" }, torsoRule)).toBeNull();
    expect(api.missFallbackFor({ hitLocation: "torso", addonLocation: "test-addon.spine" }, torsoRule)).toBeNull();
    expect(api.missFallbackFor({ hitLocation: "skull" }, torsoRule)).toEqual({ hitLocation: "torso", addonLocation: null });
    expect(api.registeredLocationAllowsArc("test-addon.spine", "front")).toBe(false);
    expect(api.registeredLocationAllowsArc("test-addon.spine", "back")).toBe(true);
    expect(api.registeredLocationAllowsArc("test-addon.spine", null)).toBe(true);
    expect(api.registeredLocationAllowsArc("test-addon.joint", "front")).toBe(true);
    expect(api.locationOverrides("test-addon.spine", "cr", 12)).toMatchObject({ knockdown: -1, shockKnockdown: true, majorWoundKnockdown: null });
    expect(api.locationOverrides("test-addon.ear", "cut", 12)).toMatchObject({ knockdown: 0, majorWoundKnockdown: 0 });
  });

  it("gives a random-location listener the damage type, the arc and a die (since 1.22.0)", async () => {
    const api = await load();
    let seen: any = null;
    globals.Hooks = { callAll: (_event: string, context: any) => { seen = { type: context.damageType, arc: context.arc, die: context.d6() }; } };
    globals.CONFIG = { Dice: { randomUniform: () => 0.01 } };
    api.randomLocationWithHooks(10, "torso", {}, { damageType: "cr", arc: "back" });
    expect(seen).toEqual({ type: "cr", arc: "back", die: 6 });
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

describe("a module's own defenses (#268)", () => {
  it("offers each choice a module lists for this defender, and runs the one chosen", async () => {
    const api = await load();
    const run = vi.fn();
    expect(api.registerDefense({
      module: "test-addon", key: "ward", label: "Ward",
      choices: (defender: { name: string }, attack: string) => (defender.name === "Mage" ? [{ id: "a", label: `Ward vs ${attack}` }, { id: "", label: "" } as never] : []),
      run,
    })).toBe("test-addon.ward");
    expect(api.registerDefense({ module: "test-addon", key: "ward", label: "Again", choices: () => [], run })).toBeNull();
    expect(api.registerDefense({ module: "test-addon", key: "bad", label: "Bad", run } as never)).toBeNull();
    api.registerDefense({ module: "test-addon", key: "broken", label: "Broken", choices: () => { throw new Error("no"); }, run });

    expect(api.moduleDefensesFor({ name: "Fighter" }, "Broadsword swing")).toEqual([]);
    const offered = api.moduleDefensesFor({ name: "Mage" }, "Broadsword swing");
    expect(offered.map((d) => [d.defense, d.id, d.label])).toEqual([["test-addon.ward", "a", "Ward vs Broadsword swing"]]);
    await offered[0]!.run({ id: "message" });
    expect(run).toHaveBeenCalledWith({ defender: { name: "Mage" }, attack: "Broadsword swing", choice: { id: "a", label: "Ward vs Broadsword swing" }, message: { id: "message" } });
  });
});

describe("an item's attack rows (#270)", () => {
  const basis = { st: 12, damage: "1d+1", damageType: "cut", armorDivisor: 1, halfDamageRange: 0, maxRange: 0, accuracy: 0, malfunction: null };
  const entries = () => [
    { kind: "melee" as const, mode: { damageBase: "sw" }, row: { skillLevel: 12, damage: "1d+1", damageRollable: true }, basis },
    { kind: "ranged" as const, mode: { damageBase: "thr", rangeIsStMultiple: true }, row: { skillLevel: 11, damage: "1d", accuracy: 2, halfDamageRange: 15, maxRange: 20, range: "15 / 20", damageRollable: true }, basis: { ...basis, halfDamageRange: 15, maxRange: 20, accuracy: 2 } },
  ];
  const helpers = {
    damageAt: (_entry: unknown, st: number) => (st > 12 ? "1d+2" : "1d+1"),
    rangeAt: (_entry: unknown, st: number) => ({ halfDamageRange: st * 1.5, maxRange: st * 2 }),
    addToDamage: (formula: string, bonus: number) => `${formula}+${bonus}`,
    isRollable: (entry: { row: { damage: string } }) => entry.row.damage !== "—",
  };

  it("lets a listener change the rows, then works out the range text, notes, follow-up and rollability again", async () => {
    const api = await load();
    const rows = entries();
    globals.Hooks = {
      callAll: (_event: string, context: any) => {
        const [sword, bow] = context.rows;
        sword.row.skillLevel += 1;
        sword.row.damage = context.addToDamage(sword.basis.damage, 2);
        sword.row.notes = [{ label: "Balanced", hint: "+1 to skill" }, { label: "" }];
        const range = context.rangeAt(bow, bow.basis.st + 2);
        Object.assign(bow.row, { damage: context.damageAt(bow, 14), accuracy: 3, ...range, followUp: { damage: "1d-1", damageType: "cr", explosive: true } });
      },
    };
    api.adjustWeaponAttacks({ actor: {}, item: {}, rows: rows as never, ...helpers } as never);
    expect(rows[0]!.row).toMatchObject({ skillLevel: 13, damage: "1d+1+2", notes: [{ label: "Balanced", hint: "+1 to skill" }], followUp: null, damageRollable: true });
    expect(rows[1]!.row).toMatchObject({ damage: "1d+2", accuracy: 3, halfDamageRange: 21, maxRange: 28, range: "21 / 28", notes: [], followUp: { damage: "1d-1", damageType: "cr", explosive: true } });
  });

  it("lets a listener change a row's reach, Parry and hands (since 1.21.0), kept to their shapes", async () => {
    const api = await load();
    const rows = entries();
    Object.assign(rows[0]!.row, { reach: "1", parry: 9, parryModifier: 0, twoHanded: false });
    globals.Hooks = {
      callAll: (_event: string, context: any) => {
        Object.assign(context.rows[0].row, { reach: "C", parry: "7", twoHanded: true });
        Object.assign(context.rows[1].row, { parry: "none" });
      },
    };
    api.adjustWeaponAttacks({ actor: {}, item: {}, rows: rows as never, ...helpers } as never);
    expect(rows[0]!.row).toMatchObject({ reach: "C", parry: 7, parryModifier: -2, twoHanded: true });
    expect(rows[1]!.row).toMatchObject({ parry: null, twoHanded: false });
  });

  it("offers a Feint from melee rows and not ranged ones until a listener says otherwise (since 1.28.0)", async () => {
    const api = await load();
    globals.Hooks = { callAll: () => undefined };
    const plain = entries();
    api.adjustWeaponAttacks({ actor: {}, item: {}, rows: plain as never, ...helpers } as never);
    expect([(plain[0]!.row as any).feint, (plain[1]!.row as any).feint]).toEqual([true, false]);
    const changed = entries();
    globals.Hooks = { callAll: (_event: string, context: any) => { context.rows[0].row.feint = "no"; context.rows[1].row.feint = true; } };
    api.adjustWeaponAttacks({ actor: {}, item: {}, rows: changed as never, ...helpers } as never);
    expect([(changed[0]!.row as any).feint, (changed[1]!.row as any).feint]).toEqual([false, true]);
  });

  it("gives a feint the lines modules add, and their refusal (since 1.28.0)", async () => {
    const api = await load();
    globals.Hooks = { callAll: (_event: string, context: any) => { context.modifiers.push({ label: "Range", value: -3 }, { label: "Bad", value: "1" }); } };
    expect(api.feintModifiers({ actor: {}, foe: {}, item: null, mode: { index: 0, ranged: true }, ranged: true })).toEqual({ modifiers: [{ label: "Range", value: -3 }], refusal: null });
    globals.Hooks = { callAll: (_event: string, context: any) => { context.refusal = " Out of range "; } };
    expect(api.feintModifiers({ actor: {}, foe: {}, item: null, mode: null, ranged: false }).refusal).toBe("Out of range");
  });

  it("puts the rows back as they were when a listener throws", async () => {
    const api = await load();
    const rows = entries();
    globals.Hooks = { callAll: (_event: string, context: any) => { context.rows[0].row.skillLevel = 99; context.rows[1].row.damage = "9d"; throw new Error("listener"); } };
    api.adjustWeaponAttacks({ actor: {}, item: {}, rows: rows as never, ...helpers } as never);
    expect(rows[0]!.row.skillLevel).toBe(12);
    expect(rows[1]!.row.damage).toBe("1d");
  });

  it("adds a module's lines to an equipment failure roll's target", async () => {
    const api = await load();
    globals.Hooks = { callAll: (_event: string, context: any) => { context.modifiers.push({ label: "Rugged", value: 2 }, { label: "Bad", value: "3" }); } };
    expect(api.equipmentFailureModifiers({}, {}, 12)).toEqual({ target: 14, modifiers: [{ label: "Rugged", value: 2 }] });
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

/** Defenses a module refuses, and the weapons it lets parry (sargas79/GWorldVTT#280). */
describe("defense choices and parry weapons", () => {
  /** Hooks whose listeners run straight away, as Foundry's callAll does. */
  function hooks(listeners: Record<string, (context: any) => void>) {
    globals.Hooks = { callAll: (event: string, context: unknown) => listeners[event]?.(context) };
  }
  const offered = [
    { key: "dodge" as const, available: true },
    { key: "parry" as const, available: true },
    { key: "block" as const, available: false },
  ];

  it("takes a module's refusals of a defense, Retreat and Feverish Defense, but never offers what the system refused", async () => {
    const api = await load();
    hooks({
      "gworld.defenseChoices": (context) => {
        for (const choice of context.choices) {
          choice.available = choice.key === "dodge";
          choice.refusal = "Not after that attack";
        }
        context.retreat.available = false;
        context.retreat.refusal = "No retreat";
      },
    });
    const refused = api.moduleDefenseRefusals({ defender: {}, attack: "Axe", delivery: "melee", damageType: "cut", choices: offered });
    expect([...refused.choices.entries()]).toEqual([["parry", "Not after that attack"]]);
    expect(refused.retreat).toBe("No retreat");
    expect(refused.feverish).toBeNull();
  });

  it("changes nothing with no listener", async () => {
    const api = await load();
    const refused = api.moduleDefenseRefusals({ defender: {}, attack: "Axe", delivery: "melee", damageType: "cut", choices: offered });
    expect(refused.choices.size).toBe(0);
    expect([refused.retreat, refused.feverish]).toEqual([null, null]);
    expect(refused.parriesFlail).toBe(false);
  });

  it("gives a listener the arc and both weapons, and lets it say a parry may meet a flail (since 1.21.0)", async () => {
    const api = await load();
    let seen: any = null;
    hooks({
      "gworld.defenseChoices": (context) => {
        seen = { arc: context.arc, attack: context.attackWeapon?.skill, parry: context.parryWeapon?.skill };
        if (context.parryWeapon?.isFencing) context.parryWeapon.parriesFlail = true;
      },
    });
    const parryWeapon = { itemId: "rapier", twoHanded: false, natural: false, skill: "Rapier", isFencing: true, parriesFlail: false };
    const refused = api.moduleDefenseRefusals({
      defender: {}, attack: "Morningstar", delivery: "melee", damageType: "cr", choices: offered,
      arc: "side", attackWeapon: { skill: "Flail", flail: "flail" }, parryWeapon,
    });
    expect(seen).toEqual({ arc: "side", attack: "Flail", parry: "Rapier" });
    expect(refused.parriesFlail).toBe(true);
    expect(parryWeapon.parriesFlail).toBe(false);
  });

  const rows = [
    { itemId: "axe", modeIndex: 0, name: "Axe", unbalanced: true, parry: 9 },
    { itemId: "sword", modeIndex: 0, name: "Sword", unbalanced: false, parry: 10 },
  ];

  it("leaves out an unbalanced weapon on a turn it attacked, unless a module lets it back in", async () => {
    const api = await load();
    expect(api.parryWeaponRows({}, rows, true).map((r) => r.itemId)).toEqual(["sword"]);
    expect(api.parryWeaponRows({}, rows, false).map((r) => r.itemId)).toEqual(["axe", "sword"]);
    hooks({
      "gworld.parryWeapons": (context) => {
        for (const candidate of context.candidates) {
          if (candidate.itemId === "axe") candidate.excluded = false;
          if (candidate.itemId === "sword") Object.assign(candidate, { excluded: true, reason: "It just attacked" });
        }
      },
    });
    expect(api.parryWeaponRows({}, rows, true).map((r) => r.itemId)).toEqual(["axe"]);
  });
});

/** All-Out Attack options, maneuver allowances and a cap on skill (sargas79/GWorldVTT#282). */
describe("maneuver extension points", () => {
  function hooks(listeners: Record<string, (context: any) => void>) {
    globals.Hooks = { callAll: (event: string, context: unknown) => listeners[event]?.(context) };
  }

  it("offers a module's All-Out Attack option and applies only its own effect", async () => {
    const api = await load();
    expect(api.registerAllOutAttackOption({ module: "test-addon", key: "long", label: "Long", available: (actor) => actor.on, attack: () => ({ reachBonus: 1 }) })).toBe("test-addon.long");
    expect(api.registerAllOutAttackOption({ module: "test-addon", key: "long", label: "Again" })).toBeNull();
    expect(api.MODULE_KEY.test("test-addon.long")).toBe(true);
    expect(api.MODULE_KEY.test("determined")).toBe(false);
    const actor = { on: true, system: { maneuver: "allOutAttack", allOutAttackOption: "test-addon.long" } };
    expect(api.allOutAttackOptionsFor(actor)).toEqual([{ key: "test-addon.long", label: "Long" }]);
    expect(api.allOutAttackOptionEffect(context({ actor }) as never)).toEqual({ reachBonus: 1 });
    expect(api.allOutAttackOptionEffect(context({ actor: { ...actor, on: false } }) as never)).toBeNull();
    expect(api.allOutAttackOptionEffect(context({ actor: { on: true, system: { maneuver: "attack", allOutAttackOption: "test-addon.long" } } }) as never)).toBeNull();
  });

  it("lets a listener change a maneuver's movement and defenses, keeping the maneuver's own for anything unknown", async () => {
    const api = await load();
    expect(api.maneuverAllowancesFor({}, "moveAndAttack", "")).toEqual({ movement: "full", defense: "dodgeAndBlockOnly" });
    hooks({ "gworld.maneuverAllowances": (c) => { if (c.maneuver === "moveAndAttack") c.defense = "any"; if (c.option === "slam") c.movement = "full"; } });
    expect(api.maneuverAllowancesFor({}, "moveAndAttack", "")).toEqual({ movement: "full", defense: "any" });
    expect(api.maneuverAllowancesFor({}, "allOutAttack", "slam")).toEqual({ movement: "full", defense: "none" });
    hooks({ "gworld.maneuverAllowances": (c) => { c.movement = "sideways"; } });
    expect(api.maneuverAllowancesFor({}, "attack", "").movement).toBe("step");
  });

  it("holds effective skill to a cap once every modifier is in", async () => {
    const api = await load();
    expect(api.skillCapLine(15, [{ value: -4 }], 9, "cap")).toEqual({ label: "cap", value: -2 });
    expect(api.skillCapLine(12, [{ value: -4 }], 9, "cap")).toBeNull();
    expect(api.skillCapLine(15, [{ value: -4 }], null, "cap")).toBeNull();
  });
});
