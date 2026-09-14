import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

async function load() {
  vi.resetModules();
  return import("../migration.js");
}

const globals = globalThis as Record<string, unknown>;

/** A world with settings in a map, one loose item, and an actor holding items. */
function world(options: { rules?: Record<string, boolean> } = {}) {
  const settings = new Map<string, unknown>([["gworld.migrations", {}], ["gworld.optionalRules", options.rules ?? {}]]);
  const looseUpdates: object[][] = [];
  const embeddedUpdates: object[][] = [];
  const loose = { id: "i1", uuid: "Item.i1", type: "oldType", _source: { system: { power: 3 } } };
  const held = { id: "i2", uuid: "Actor.a1.Item.i2", type: "oldType", _source: { system: { power: 5 } } };
  const other = { id: "i3", uuid: "Actor.a1.Item.i3", type: "skill", _source: { system: { points: 1 } } };
  const actor = {
    id: "a1", type: "character", items: [held, other], _source: { system: { reserve: 4 } },
    updateEmbeddedDocuments: vi.fn(async (_name: string, changes: object[]) => { embeddedUpdates.push(changes); }),
  };
  globals.game = {
    user: { isGM: true },
    settings: {
      get: (scope: string, key: string) => settings.get(`${scope}.${key}`),
      set: vi.fn(async (scope: string, key: string, value: unknown) => { settings.set(`${scope}.${key}`, value); }),
    },
    items: [loose],
    actors: [actor],
    packs: [],
    i18n: { format: (key: string) => key, localize: (key: string) => key },
  };
  globals.Item = { updateDocuments: vi.fn(async (changes: object[]) => { looseUpdates.push(changes); }) };
  globals.Actor = { updateDocuments: vi.fn(async () => {}) };
  globals.ui = { notifications: { info: vi.fn(), warn: vi.fn() } };
  globals.foundry = {
    data: { operators: { ForcedReplacement: { create: (value: unknown) => ({ replaced: value }) } } },
    utils: {
      deepClone: (value: unknown) => JSON.parse(JSON.stringify(value)),
      getProperty: (object: any, path: string) => path.split(".").reduce((v, k) => v?.[k], object),
    },
  };
  return { settings, looseUpdates, embeddedUpdates, actor, loose, held };
}

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  for (const key of ["game", "Item", "Actor", "ui", "foundry", "CONFIG"]) delete globals[key];
  vi.restoreAllMocks();
});

/** Migration helpers for add-on modules (sargas79/GWorldVTT#241). */
describe("migrateItemType", () => {
  it("turns every item of a type into another, loose and embedded, keeping ids, and runs once", async () => {
    const api = await load();
    const w = world();
    const result = await api.migrateItemType({ module: "test-addon", fromType: "oldType", toType: "test-addon.charm", mapData: (source) => ({ power: source.power * 2 }) });
    expect(result).toEqual({ skipped: false, changed: 2, failed: 0 });
    expect(w.looseUpdates).toEqual([[{ _id: "i1", type: "test-addon.charm", system: { replaced: { power: 6 } } }]]);
    expect(w.embeddedUpdates).toEqual([[{ _id: "i2", type: "test-addon.charm", system: { replaced: { power: 10 } } }]]);
    expect(api.hasMigrated("test-addon", "itemType:oldType")).toBe(true);
    expect(await api.migrateItemType({ module: "test-addon", fromType: "oldType", toType: "test-addon.charm", mapData: () => ({}) })).toEqual({ skipped: true, changed: 0, failed: 0 });
  });

  it("leaves the step unrecorded when a document fails, so it can run again", async () => {
    const api = await load();
    const w = world();
    w.actor.updateEmbeddedDocuments.mockRejectedValueOnce(new Error("nope"));
    const result = await api.migrateItemType({ module: "test-addon", fromType: "oldType", toType: "test-addon.charm", mapData: (s) => s });
    expect(result).toEqual({ skipped: false, changed: 1, failed: 1 });
    expect(api.hasMigrated("test-addon", "itemType:oldType")).toBe(false);
  });

  it("only lets the GM migrate", async () => {
    const api = await load();
    world();
    (globals.game as any).user.isGM = false;
    expect(await api.migrateItemType({ module: "test-addon", fromType: "oldType", toType: "x.y", mapData: (s) => s })).toEqual({ skipped: false, changed: 0, failed: 0 });
  });
});

describe("moveFields and moveRuleState", () => {
  it("copies fields into the module's extension data", async () => {
    const api = await load();
    const w = world();
    (globals.Actor as any).updateDocuments = vi.fn(async (changes: object[]) => { w.looseUpdates.push(changes); });
    const result = await api.moveFields({ module: "test-addon", documentName: "Actor", types: ["character"], fields: { reserve: "reserve", missing: "gone" } });
    expect(result).toEqual({ skipped: false, changed: 1, failed: 0 });
    expect(w.looseUpdates).toEqual([[{ _id: "a1", "system.extensions.test-addon.reserve": 4 }]]);
  });

  it("carries a stored switch to the module's key once, without overwriting one it already has", async () => {
    const api = await load();
    const w = world({ rules: { oldRule: true } });
    expect((await api.moveRuleState({ module: "test-addon", fromKey: "oldRule", toKey: "test-addon.rule" })).changed).toBe(1);
    expect(w.settings.get("gworld.optionalRules")).toEqual({ oldRule: true, "test-addon.rule": true });
    expect((await api.moveRuleState({ module: "test-addon", fromKey: "oldRule", toKey: "test-addon.rule" })).skipped).toBe(true);
    expect((await api.moveRuleState({ module: "test-addon", fromKey: "oldRule", toKey: "other.rule" })).changed).toBe(0);
  });

  it("switches the old key off when asked, so the rule isn't in play twice", async () => {
    const api = await load();
    const w = world({ rules: { oldRule: true } });
    expect((await api.moveRuleState({ module: "test-addon", fromKey: "oldRule", toKey: "test-addon.rule", turnOff: true })).changed).toBe(1);
    expect(w.settings.get("gworld.optionalRules")).toEqual({ oldRule: false, "test-addon.rule": true });
  });
});

describe("the data flagged ahead of removal", () => {
  it("names each piece once, by an id a module can declare, and one kind of data per entry", async () => {
    const api = await load();
    const ids = new Set(api.DEPRECATED_DATA.map((e) => e.id));
    expect([...ids].sort()).toEqual(["bonus-points", "gear-options", "holy-items", "ritual-items", "ritual-path", "rule-switches"]);
    for (const entry of api.DEPRECATED_DATA) {
      expect([entry.itemType, entry.field, entry.rule].filter(Boolean)).toHaveLength(1);
      expect(entry.label).toBeTruthy();
      expect(entry.install).toBeTruthy();
    }
  });
});

describe("coverage", () => {
  const entries = [
    { id: "old-type", label: "old items", install: "the add-on", itemType: "oldType" },
    { id: "old-field", label: "old reserve", install: "the add-on", field: { documentName: "Actor" as const, types: ["character"], path: "reserve" } },
    { id: "old-rule", label: "old rule", install: "the add-on", rule: "oldRule" },
  ];

  it("finds deprecated data the world holds and no active module migrates", async () => {
    const api = await load();
    const w = world();
    const state = { items: [w.loose], actors: [w.actor], storedRules: { oldRule: false } };
    expect(api.uncoveredData(entries, state, []).map((e) => e.id)).toEqual(["old-type", "old-field"]);
    expect(api.uncoveredData(entries, state, [{ active: true, flags: { gworld: { migrates: ["old-type"] } } }]).map((e) => e.id)).toEqual(["old-field"]);
    expect(api.uncoveredData(entries, state, [{ active: false, flags: { gworld: { migrates: ["old-type", "old-field"] } } }]).map((e) => e.id)).toEqual(["old-type", "old-field"]);
    expect(api.uncoveredData(entries, { items: [], actors: [], storedRules: { oldRule: true } }, []).map((e) => e.id)).toEqual(["old-rule"]);
  });

  it("counts items kept out of their collection as invalid, as those of a type no longer registered are", async () => {
    const api = await load();
    world();
    const stored = { id: "i9", type: "base", _source: { type: "oldType", system: {} } };
    const items = Object.assign([], { invalidDocumentIds: new Set(["i9"]), getInvalid: (id: string) => (id === "i9" ? stored : undefined) });
    expect(api.withInvalid(items)).toEqual([stored]);
    expect(api.uncoveredData(entries, { items: api.withInvalid(items), actors: [], storedRules: {} }, []).map((e) => e.id)).toEqual(["old-type"]);
    const actor = { type: "character", items: Object.assign([], { invalidDocumentIds: new Set(["i9"]), getInvalid: () => stored }), _source: { system: {} } };
    expect(api.uncoveredData(entries, { items: [], actors: [actor], storedRules: {} }, []).map((e) => e.id)).toEqual(["old-type"]);
  });

  it("warns the GM permanently, and saves nothing", async () => {
    const api = await load();
    const w = world();
    globals.CONFIG = { GWORLD: { deprecatedData: entries } };
    api.warnUncoveredData();
    const warn = (globals.ui as any).notifications.warn;
    // Both come from the same module, so they share one notice.
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][1]).toEqual({ permanent: true });
    expect(w.looseUpdates).toEqual([]);
    expect((globals.game as any).settings.set).not.toHaveBeenCalled();
  });
});
