import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const globals = globalThis as Record<string, unknown>;

/**
 * An unlinked token's actor: its own copy of a directory actor, whose items
 * are the base's plus those the token's delta holds.
 */
function tokenActor(options: { type?: string; items?: any[]; delta?: { system?: object; items?: object[] } } = {}) {
  const items = options.items ?? [];
  return {
    id: "a1",
    type: options.type ?? "character",
    isToken: true,
    items: Object.assign([...items], { get: (id: string) => items.find((i) => i.id === id) }),
    token: { delta: { _source: { system: options.delta?.system ?? {}, items: options.delta?.items ?? [] } } },
    update: vi.fn(async () => {}),
    updateEmbeddedDocuments: vi.fn(async () => {}),
    reset: vi.fn(),
    sheet: { rendered: true, render: vi.fn() },
  };
}

afterEach(() => {
  for (const key of ["game", "Item", "Actor", "ui", "foundry", "CONFIG", "Hooks", "canvas"]) delete globals[key];
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** Migrations, campaign refresh and mana redraws skip unlinked tokens' actors (sargas79/GWorldVTT#659). */
describe("migrating an unlinked token's actor", () => {
  async function load(token: ReturnType<typeof tokenActor>, directory: any[] = []) {
    vi.resetModules();
    const settings = new Map<string, unknown>([["gworld.migrations", {}]]);
    globals.game = {
      user: { isGM: true },
      settings: {
        get: (scope: string, key: string) => settings.get(`${scope}.${key}`),
        set: vi.fn(async (scope: string, key: string, value: unknown) => { settings.set(`${scope}.${key}`, value); }),
      },
      items: [],
      actors: directory,
      scenes: [{ tokens: [{ actorLink: false, actor: token }, { actorLink: true, actor: directory[0] }] }],
      combats: [],
      packs: [],
      i18n: { format: (key: string) => key, localize: (key: string) => key },
    };
    globals.Item = { updateDocuments: vi.fn(async () => {}) };
    globals.Actor = { updateDocuments: vi.fn(async () => {}) };
    globals.ui = { notifications: { info: vi.fn(), warn: vi.fn() } };
    globals.foundry = {
      data: { operators: { ForcedReplacement: { create: (value: unknown) => ({ replaced: value }) } } },
      utils: {
        deepClone: (value: unknown) => JSON.parse(JSON.stringify(value)),
        getProperty: (object: any, path: string) => path.split(".").reduce((v, k) => v?.[k], object),
      },
    };
    return import("../migration.js");
  }

  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("turns the items the token holds of its own, and leaves those it inherits to the directory actor", async () => {
    const own = { id: "i1", type: "oldType", _source: { system: { power: 2 } } };
    const inherited = { id: "i2", type: "oldType", _source: { system: { power: 7 } } };
    const token = tokenActor({ items: [own, inherited], delta: { items: [{ _id: "i1" }, { _id: "i3", _tombstone: true }] } });
    const api = await load(token);
    const result = await api.migrateItemType({ module: "test-addon", fromType: "oldType", toType: "test-addon.charm", mapData: (s) => ({ power: s.power * 2 }) });
    expect(result).toEqual({ skipped: false, changed: 1, failed: 0 });
    expect(token.updateEmbeddedDocuments).toHaveBeenCalledWith("Item", [{ _id: "i1", type: "test-addon.charm", system: { replaced: { power: 4 } } }]);
  });

  it("copies only the fields the token's delta overrides, through the token", async () => {
    const base = { id: "a1", type: "character", _source: { system: { reserve: 4 } } };
    const token = tokenActor({ delta: { system: { reserve: 9 } } });
    const bare = tokenActor({ delta: { system: {} } });
    const api = await load(token, [base]);
    (globals.game as any).scenes[0].tokens.push({ actorLink: false, actor: bare });
    const result = await api.moveFields({ module: "test-addon", documentName: "Actor", types: ["character"], fields: { reserve: "reserve" } });
    expect(result).toEqual({ skipped: false, changed: 2, failed: 0 });
    expect((globals.Actor as any).updateDocuments).toHaveBeenCalledWith([{ _id: "a1", "system.extensions.test-addon.reserve": 4 }]);
    expect(token.update).toHaveBeenCalledWith({ "system.extensions.test-addon.reserve": 9 });
    expect(bare.update).not.toHaveBeenCalled();
  });

  it("warns about deprecated data only a token's copy holds", async () => {
    const token = tokenActor({ items: [{ id: "i1", type: "oldType", _source: { type: "oldType", system: {} } }] });
    const api = await load(token);
    globals.CONFIG = { GWORLD: { deprecatedData: [{ id: "old-type", label: "old items", install: "the add-on", itemType: "oldType" }] } };
    api.warnUncoveredData();
    expect((globals.ui as any).notifications.warn).toHaveBeenCalledTimes(1);
  });
});

describe("a campaign setting's change", () => {
  it("prepares an unlinked token's character again, and no NPC", async () => {
    vi.resetModules();
    vi.useFakeTimers();
    const onChanges: Array<() => void> = [];
    const token = tokenActor();
    const npc = tokenActor({ type: "npc" });
    globals.game = {
      user: { isGM: true },
      actors: [],
      scenes: [{ tokens: [{ actorLink: false, actor: token }, { actorLink: false, actor: npc }] }],
      combats: [],
      settings: { register: (_scope: string, _key: string, config: any) => onChanges.push(config.onChange), get: () => null },
    };
    globals.foundry = { data: { fields: { NumberField: class {} } }, applications: { instances: new Map() } };
    globals.Hooks = { callAll: vi.fn() };
    const { registerCampaignSettings } = await import("../campaign.js");
    registerCampaignSettings();
    onChanges[0]!();
    vi.advanceTimersByTime(100);
    expect(token.reset).toHaveBeenCalled();
    expect(npc.reset).not.toHaveBeenCalled();
  });
});

describe("a mana level's change", () => {
  it("redraws an unlinked token's open sheet", async () => {
    vi.resetModules();
    const token = tokenActor();
    globals.game = {
      user: { isGM: true },
      actors: [],
      scenes: [{ tokens: [{ actorLink: false, actor: token }] }],
      combats: [],
      settings: { get: () => "normal", set: vi.fn(async () => {}) },
      i18n: { localize: (key: string) => key },
    };
    globals.canvas = { scene: null };
    globals.foundry = { applications: { api: { DialogV2: { prompt: async () => ({ scene: null, world: "high" }) } } }, utils: { escapeHTML: (s: string) => s } };
    const { promptForMana } = await import("../casting.js");
    await promptForMana();
    expect(token.sheet.render).toHaveBeenCalled();
  });
});
