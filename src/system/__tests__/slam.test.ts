import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const globals = globalThis as Record<string, unknown>;

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  globals.game = { settings: { get: () => ({}) }, user: { targets: new Set() } };
});

afterEach(() => {
  delete globals.Hooks;
  delete globals.game;
  vi.restoreAllMocks();
});

/** Slams and shoves a module adds (sargas79/GWorldVTT#324). */
describe("registerSlam (since 1.31.0)", () => {
  it("takes a slam or shove with a prepare function, once per key", async () => {
    vi.resetModules();
    const { registerSlam } = await import("../slam.js");
    const prepare = () => ({ skill: { name: "Spear", level: 14 } });
    expect(registerSlam({ module: "test-addon", key: "pole-slam", label: "Pole slam", kind: "slam", prepare })).toBe("test-addon.pole-slam");
    expect(registerSlam({ module: "test-addon", key: "pole-slam", label: "Again", kind: "slam", prepare })).toBeNull();
    expect(registerSlam({ module: "test-addon", key: "bad", label: "Bad", kind: "grab" as never, prepare })).toBeNull();
    expect(registerSlam({ module: "test-addon", key: "none", label: "None", kind: "shove" } as never)).toBeNull();
  });
});

/** What may be struck at on a foe (sargas79/GWorldVTT#324). */
describe("weaponTargetsFor (since 1.31.0)", () => {
  it("offers the weapons in hand, and what a listener adds or changes", async () => {
    vi.resetModules();
    const { weaponTargetsFor } = await import("../weapon-damage.js");
    const items = new Map([["sword", { id: "sword", name: "Broadsword" }], ["shield", { id: "shield", name: "Medium Shield" }]]);
    const foe = { items: { get: (id: string) => items.get(id) }, system: { derived: { melee: [{ itemId: "sword", name: "Broadsword", reach: "1" }], ranged: [] } } };
    expect(weaponTargetsFor({}, foe)).toEqual([{ id: "sword", name: "Broadsword", penalty: -4, canDisarm: true, noParry: false, noDefenseBonus: false, disarmPenaltyForAll: false }]);
    globals.Hooks = {
      callAll: (_event: string, context: any) => {
        context.targets.push({ id: "shield", name: "Medium Shield", penalty: -2, canDisarm: false, noParry: true, noDefenseBonus: true }, { id: "missing", name: "Nothing", penalty: 0 });
      },
    };
    expect(weaponTargetsFor({}, foe).map((t) => [t.id, t.penalty, t.canDisarm, t.noParry, t.noDefenseBonus])).toEqual([
      ["sword", -4, true, false, false],
      ["shield", -2, false, true, true],
    ]);
  });
});
