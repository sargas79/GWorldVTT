import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** Registries are module-level state, so each test loads a fresh copy. */
async function load() {
  vi.resetModules();
  return import("../roll-extensions.js");
}

const globals = globalThis as Record<string, unknown>;
const warn = vi.fn();

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  warn.mockReset();
  globals.ui = { notifications: { warn } };
});

afterEach(() => {
  delete globals.ui;
  vi.restoreAllMocks();
});

const hero = { name: "Hero" };

/** Roll and casting extension points for add-on modules (sargas79/GWorldVTT#244). */
describe("point pools", () => {
  it("lists a module's pools for a use, tidied, and puts spending in play", async () => {
    const api = await load();
    expect(api.anyPointPools()).toBe(false);
    expect(api.registerPointPool({
      module: "test-addon", key: "luck", label: "Luck",
      pools: (_actor, use, roll) => [
        { id: "all", label: "Luck", available: 3 },
        ...(use === "buySuccess" && roll.skill === "Stealth" ? [{ id: "stealth", label: "Stealth luck", available: Number.NaN, gmCheck: true }] : []),
      ],
      pay: () => true,
    })).toBe("test-addon.luck");
    expect(api.anyPointPools()).toBe(true);
    expect(api.registeredPointPools(hero, "buySuccess", { skill: "Stealth" })).toEqual([
      { id: "all", label: "Luck", available: 3, gmCheck: false, registration: "test-addon.luck" },
      { id: "stealth", label: "Stealth luck", available: 0, gmCheck: true, registration: "test-addon.luck" },
    ]);
    expect(api.registeredPointPools(hero, "guidance").map((p) => p.id)).toEqual(["all"]);
  });

  it("pays from the pool chosen, after its own check, and shows why it refused", async () => {
    const api = await load();
    const pay = vi.fn(async () => true);
    api.registerPointPool({
      module: "test-addon", key: "luck", label: "Luck",
      pools: () => [{ id: "all", label: "Luck", available: 3 }],
      canPay: ({ cost }) => (cost <= 3 ? true : "Not that much luck"),
      pay,
    });
    expect(await api.payFromPointPool(hero, { pool: "test-addon.luck", id: "all" }, 2, "Bought", "buySuccess")).toBe(true);
    expect(pay).toHaveBeenCalledWith(expect.objectContaining({ actor: hero, cost: 2, note: "Bought", pool: expect.objectContaining({ id: "all" }) }));
    expect(await api.payFromPointPool(hero, { pool: "test-addon.luck", id: "all" }, 5, "Bought", "buySuccess")).toBe(false);
    expect(warn).toHaveBeenCalledWith("Not that much luck");
    expect(await api.payFromPointPool(hero, { pool: "test-addon.luck", id: "gone" }, 1, "Bought", "buySuccess")).toBe(false);
    expect(await api.payFromPointPool(hero, { pool: "gone.luck", id: "all" }, 1, "Bought", "buySuccess")).toBe(false);
    expect(pay).toHaveBeenCalledTimes(1);
  });

  it("keeps a throwing pool from breaking the list or the payment", async () => {
    const api = await load();
    api.registerPointPool({ module: "test-addon", key: "boom", label: "Boom", pools: () => { throw new Error("boom"); }, pay: () => true });
    api.registerPointPool({ module: "test-addon", key: "flaky", label: "Flaky", pools: () => [{ id: "a", label: "A", available: 1 }], pay: () => { throw new Error("flaky"); } });
    expect(api.registeredPointPools(hero, "buySuccess").map((p) => p.registration)).toEqual(["test-addon.flaky"]);
    expect(await api.payFromPointPool(hero, { pool: "test-addon.flaky", id: "a" }, 1, "", "buySuccess")).toBe(false);
  });

  it("offers nothing, and puts nothing in play, while a pool isn't available (#260)", async () => {
    const api = await load();
    let on = false;
    const pools = vi.fn(() => [{ id: "all", label: "Luck", available: 3 }]);
    api.registerPointPool({ module: "test-addon", key: "luck", label: "Luck", available: () => on, pools, pay: () => true });
    expect(api.anyPointPools()).toBe(false);
    expect(api.registeredPointPools(hero, "buySuccess")).toEqual([]);
    expect(pools).not.toHaveBeenCalled();
    on = true;
    expect(api.anyPointPools()).toBe(true);
    expect(api.registeredPointPools(hero, "buySuccess").map((p) => p.id)).toEqual(["all"]);
  });

  it("refuses a pool with no pay function, or a key used twice", async () => {
    const api = await load();
    expect(api.registerPointPool({ module: "test-addon", key: "a", label: "A", pools: () => [] } as never)).toBeNull();
    expect(api.registerPointPool({ module: "test-addon", key: "a", label: "A", pools: () => [], pay: () => true })).toBe("test-addon.a");
    expect(api.registerPointPool({ module: "test-addon", key: "a", label: "A", pools: () => [], pay: () => true })).toBeNull();
  });
});

describe("energy sources", () => {
  const spell = { name: "Test bolt" };

  it("offers each source with what it holds and its multiplier", async () => {
    const api = await load();
    api.registerEnergySource({
      module: "test-addon", key: "crystal", label: "Crystal",
      sources: () => [{ id: "c1", label: "Blue crystal", available: 10, multiplier: 2 }, { id: "c2", label: "Red crystal", available: 4 }],
      pay: () => true,
    });
    expect(api.energySourcesFor(hero, spell).map((o) => [o.value, o.label, o.source.multiplier])).toEqual([
      ["test-addon.crystal|c1", "Blue crystal (10, ×2)", 2],
      ["test-addon.crystal|c2", "Red crystal (4)", 1],
    ]);
  });

  it("covers what the source can at its multiplier, leaving the rest to the caster", async () => {
    const api = await load();
    const option = { source: { id: "c1", label: "Blue", available: 7, multiplier: 2 } };
    expect(api.energyCovered(option, 5)).toEqual({ energy: 3, points: 6 });
    expect(api.energyCovered(option, 2)).toEqual({ energy: 2, points: 4 });
    expect(api.energyCovered({ source: { id: "x", label: "X", available: 1, multiplier: 2 } }, 4)).toEqual({ energy: 0, points: 0 });
  });

  it("draws energy after the source's check, and nothing when it refuses", async () => {
    const api = await load();
    const pay = vi.fn(() => true);
    api.registerEnergySource({
      module: "test-addon", key: "crystal", label: "Crystal",
      sources: () => [{ id: "c1", label: "Blue crystal", available: 10, multiplier: 2 }],
      canPay: ({ energy }) => (energy <= 4 ? true : "Too much for one crystal"),
      pay,
    });
    expect(await api.drawEnergy(hero, spell, "test-addon.crystal|c1", 3)).toEqual({ energy: 3, points: 6, label: "Blue crystal" });
    expect(pay).toHaveBeenCalledWith(expect.objectContaining({ points: 6, energy: 3 }));
    expect(await api.drawEnergy(hero, spell, "test-addon.crystal|c1", 5)).toEqual({ energy: 0, points: 0, label: "" });
    expect(warn).toHaveBeenCalledWith("Too much for one crystal");
    expect(await api.drawEnergy(hero, spell, "gone|c1", 3)).toEqual({ energy: 0, points: 0, label: "" });
  });

  it("tells a source whether the spell is cast through a magic item, so it can offer itself for one and not the other", async () => {
    const api = await load();
    const pay = vi.fn(() => true);
    api.registerEnergySource({
      module: "test-addon", key: "set", label: "Set stone",
      sources: (_actor, _spell, casting) => (casting.castThrough?.itemId === "wand" ? [{ id: "s1", label: "Wand stone", available: 5 }] : []),
      pay,
    });
    const wand = { castThrough: { itemId: "wand", itemName: "Wand of Fire" } };
    expect(api.energySourcesFor(hero, spell)).toEqual([]);
    expect(api.energySourcesFor(hero, spell, { castThrough: null })).toEqual([]);
    expect(api.energySourcesFor(hero, spell, wand).map((o) => o.value)).toEqual(["test-addon.set|s1"]);
    expect(await api.drawEnergy(hero, spell, "test-addon.set|s1", 2)).toEqual({ energy: 0, points: 0, label: "" });
    expect(await api.drawEnergy(hero, spell, "test-addon.set|s1", 2, wand)).toEqual({ energy: 2, points: 2, label: "Wand stone" });
    expect(pay).toHaveBeenCalledWith(expect.objectContaining({ castThrough: wand.castThrough }));
  });
});

describe("running-spell actions (sargas79/GWorldVTT#278)", () => {
  const rain = { id: "r1", system: { classes: ["area"] } };
  const owner = { isOwner: true, items: { get: (id: string) => (id === "r1" ? rain : null) } };
  const active = { id: "a1", itemId: "r1", energy: 3 };

  it("shows a module's button on the rows it takes, to the character's owner only", async () => {
    const api = await load();
    expect(api.registerActiveSpellAction({ module: "test-addon", key: "fall", label: "Fall", hint: "A second of it", visible: ({ spell }) => spell?.system?.classes?.includes("area"), run: () => {} })).toBe("test-addon.fall");
    expect(api.registerActiveSpellAction({ module: "test-addon", key: "fall", label: "Again", run: () => {} })).toBeNull();
    expect(api.registerActiveSpellAction({ module: "test-addon", key: "norun", label: "No run" } as never)).toBeNull();
    expect(api.activeSpellActionsFor(owner, active)).toEqual([{ id: "test-addon.fall", label: "Fall", hint: "A second of it" }]);
    expect(api.activeSpellActionsFor(owner, { ...active, itemId: "gone" })).toEqual([]);
    expect(api.activeSpellActionsFor({ ...owner, isOwner: false }, active)).toEqual([]);
  });

  it("runs the action with the context it is handed, and not for a row it doesn't take", async () => {
    const api = await load();
    const run = vi.fn();
    api.registerActiveSpellAction({ module: "test-addon", key: "fall", label: "Fall", visible: ({ active: a }) => a.energy > 0, run });
    const context = { actor: owner, spell: rain, active, energy: 3, rollAttack: vi.fn(), rollDamage: vi.fn() };
    await api.runActiveSpellAction("test-addon.fall", context as never);
    expect(run).toHaveBeenCalledWith(context);
    await api.runActiveSpellAction("test-addon.fall", { ...context, active: { ...active, energy: 0 } } as never);
    await api.runActiveSpellAction("test-addon.gone", context as never);
    expect(run).toHaveBeenCalledTimes(1);
  });
});

describe("spell attacks", () => {
  const spell = (classes: string[], attack: Record<string, unknown>) => ({ name: "Test", system: { classes, attack } });

  it("finds the behavior a spell names, or one that takes it, but never for a Missile or Melee spell", async () => {
    const api = await load();
    api.registerSpellAttack({ module: "test-addon", key: "bolt", label: "Bolt", cast: () => {} });
    api.registerSpellAttack({ module: "test-addon", key: "burst", label: "Burst", applies: (s) => Boolean(s.system.attack.area), cast: () => {} });
    expect(api.spellAttackFor(spell(["regular"], { damage: "1d", behavior: "test-addon.bolt" }))?.id).toBe("test-addon.bolt");
    expect(api.spellAttackFor(spell(["area"], { damage: "1d", area: true }))?.id).toBe("test-addon.burst");
    expect(api.spellAttackFor(spell(["regular"], { damage: "1d" }))).toBeNull();
    expect(api.spellAttackFor(spell(["regular"], { behavior: "gone.bolt", damage: "1d" }))).toBeNull();
    expect(api.spellAttackFor(spell(["missile"], { damage: "1d", behavior: "test-addon.bolt" }))).toBeNull();
    expect(api.spellAttackFor(spell(["regular"], {}))).toBeNull();
  });

  it("keeps a throwing behavior from breaking the casting", async () => {
    const api = await load();
    api.registerSpellAttack({ module: "test-addon", key: "boom", label: "Boom", cast: () => { throw new Error("boom"); } });
    const behavior = api.spellAttackFor(spell(["regular"], { damage: "1d", behavior: "test-addon.boom" }))!;
    await expect(api.deliverSpellAttack(behavior, {} as never)).resolves.toBeUndefined();
  });
});
