import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fullAutoMinimum } from "../../rules/ranged.js";

// Full-auto minimum bursts, required attack options, and a stun set on the
// token reaching the sheet (sargas79/GWorldVTT#668).

const globals = globalThis as Record<string, unknown>;

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  delete globals.game;
  delete globals.Hooks;
  vi.restoreAllMocks();
});

describe('a RoF marked "!" (Characters p. 270)', () => {
  it("fires no less than a quarter of the listed RoF, rounded up", () => {
    expect(fullAutoMinimum(20, "!")).toBe(5);
    expect(fullAutoMinimum(10, "!")).toBe(3);
    expect(fullAutoMinimum(3, "!")).toBe(1);
    expect(fullAutoMinimum(15, " ! ")).toBe(4);
  });

  it("holds any other weapon to one shot", () => {
    expect(fullAutoMinimum(20, "")).toBe(1);
    expect(fullAutoMinimum(3, "×9")).toBe(1);
  });
});

describe("a burst from a weapon that fires only on full auto", () => {
  async function roll() {
    vi.resetModules();
    vi.doMock("../optional-rules.js", async (original) => ({ ...(await original<object>()), isRuleOn: () => true }));
    return import("../roll.js");
  }
  const none = { minShots: 0, shotsStep: 1 };

  it("is raised to the weapon's least burst", async () => {
    const { optionShots } = await roll();
    const gun = { rateOfFire: 20, fullAutoOnly: true };
    expect(optionShots(1, 20, none, gun)).toBe(5);
    expect(optionShots(12, 20, none, gun)).toBe(12);
    // Without the mark, one shot is one shot.
    expect(optionShots(1, 20, none, { rateOfFire: 20 })).toBe(1);
  });

  it("fires what is left where that is less than the least burst", async () => {
    const { optionShots } = await roll();
    expect(optionShots(1, 3, none, { rateOfFire: 20, fullAutoOnly: true })).toBe(3);
  });

  it("takes the higher of the weapon's minimum and an option's", async () => {
    const { burstLimits, optionShots } = await roll();
    const gun = { rateOfFire: 20, fullAutoOnly: true };
    expect(burstLimits({ minShots: 8, shotsStep: 1 }, 20, gun).minShots).toBe(8);
    expect(burstLimits({ minShots: 2, shotsStep: 1 }, 20, gun).minShots).toBe(5);
    // An option's own minimum still refuses a burst the weapon can't reach.
    expect(optionShots(1, 6, { minShots: 8, shotsStep: 1 }, gun)).toBeNull();
  });

  it("reads the mark off the attack button", async () => {
    const { weaponFromDataset } = await roll();
    expect(weaponFromDataset(null, { rateOfFire: "20", fullAutoOnly: "1" }).fullAutoOnly).toBe(true);
    expect(weaponFromDataset(null, { rateOfFire: "20", fullAutoOnly: "" }).fullAutoOnly).toBe(false);
  });
});

describe("a required attack option", () => {
  async function load() {
    vi.resetModules();
    return import("../combat-extensions.js");
  }
  const context = (overrides: Record<string, unknown> = {}) => ({
    actor: { id: "a" }, item: null, ranged: true, damageType: "pi", reach: "", effectiveSkill: 12,
    maneuver: "attack", targets: [], chosen: {}, ...overrides,
  });

  it("is what makes a plain click ask, where it is offered and not refused", async () => {
    const api = await load();
    let refused: string | null = null;
    api.registerAttackOption({ module: "test-addon", key: "plain", label: "Plain", attack: "ranged", apply: () => null });
    api.registerAttackOption({
      module: "test-addon", key: "burst", label: "Burst", attack: "ranged", required: true,
      refuse: () => refused, apply: () => ({ minShots: 3, shotsStep: 3 }),
    });
    api.registerAttackOption({
      module: "test-addon", key: "sometimes", label: "Sometimes", required: (c) => c.effectiveSkill > 14, apply: () => null,
    });
    expect(api.requiredAttackOptions(context()).map((o) => o.key)).toEqual(["test-addon.burst"]);
    expect(api.requiredAttackOptions(context({ effectiveSkill: 15 })).map((o) => o.key)).toEqual(["test-addon.burst", "test-addon.sometimes"]);
    // Not offered on a melee attack, so not asked about there.
    expect(api.requiredAttackOptions(context({ ranged: false }))).toEqual([]);
    refused = "Out of bursts";
    expect(api.requiredAttackOptions(context())).toEqual([]);
  });

  it("starts ticked in the dialog; an ordinary one doesn't", async () => {
    const api = await load();
    api.registerAttackOption({ module: "test-addon", key: "plain", label: "Plain", apply: () => null });
    api.registerAttackOption({ module: "test-addon", key: "burst", label: "Burst", required: true, apply: () => null });
    const html = api.attackOptionFields(context());
    expect(html).toMatch(/name="addon:test-addon\.burst" checked/);
    expect(html).not.toMatch(/name="addon:test-addon\.plain" checked/);
  });

  it("is never required where a function saying so throws", async () => {
    const api = await load();
    api.registerAttackOption({
      module: "test-addon", key: "broken", label: "Broken", required: () => { throw new Error("no"); }, apply: () => null,
    });
    expect(api.requiredAttackOptions(context())).toEqual([]);
  });
});

describe("the Stunned box and the stunned icon", () => {
  async function load() {
    vi.resetModules();
    return import("../conditions.js");
  }
  const actor = (box: boolean, icon: boolean) => {
    const a: any = {
      isOwner: true,
      statuses: new Set(icon ? ["stunned"] : []),
      system: { conditions: { stunned: box } },
      update: vi.fn(async (changes: Record<string, unknown>) => {
        a.system.conditions.stunned = changes["system.conditions.stunned"];
      }),
      toggleStatusEffect: vi.fn(async (id: string, { active }: { active: boolean }) => {
        if (active) a.statuses.add(id);
        else a.statuses.delete(id);
      }),
    };
    return a;
  };

  it("ticks the box when the icon goes on, and clears it when it comes off", async () => {
    const { syncStunBox } = await load();
    const stunned = actor(false, true);
    await syncStunBox(stunned, true);
    expect(stunned.system.conditions.stunned).toBe(true);
    stunned.statuses.delete("stunned");
    await syncStunBox(stunned, false);
    expect(stunned.system.conditions.stunned).toBe(false);
  });

  it("writes nothing where the box already agrees, or the actor has no box", async () => {
    const { syncStunBox } = await load();
    const same = actor(true, true);
    await syncStunBox(same, true);
    expect(same.update).not.toHaveBeenCalled();
    const vehicle: any = { isOwner: true, statuses: new Set(["stunned"]), system: {}, update: vi.fn() };
    await syncStunBox(vehicle, true);
    expect(vehicle.update).not.toHaveBeenCalled();
  });

  it("moves each way through the hooks, for the client that made the change", async () => {
    const { registerStunSync } = await load();
    const handlers: Record<string, Array<(...args: any[]) => void>> = {};
    globals.Hooks = { on: (event: string, fn: (...args: any[]) => void) => (handlers[event] ??= []).push(fn) };
    globals.game = { user: { id: "me" } };
    registerStunSync();

    // A module's applyCondition, or the token HUD: the icon goes on.
    const a = actor(false, false);
    a.statuses.add("stunned");
    handlers.createActiveEffect!.forEach((fn) => fn({ statuses: new Set(["stunned"]), parent: a }, {}, "me"));
    await vi.waitFor(() => expect(a.system.conditions.stunned).toBe(true));

    // The sheet's box: the icon follows.
    const b = actor(false, false);
    handlers.updateActor!.forEach((fn) => fn(b, { system: { conditions: { stunned: true } } }, {}, "me"));
    await vi.waitFor(() => expect(b.toggleStatusEffect).toHaveBeenCalledWith("stunned", { active: true }));

    // Somebody else's change is theirs to follow.
    const c = actor(false, false);
    handlers.updateActor!.forEach((fn) => fn(c, { system: { conditions: { stunned: true } } }, {}, "them"));
    expect(c.toggleStatusEffect).not.toHaveBeenCalled();
  });
});
