import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** Registries are module-level state, so each test loads a fresh copy. */
async function load() {
  vi.resetModules();
  return import("../data-extensions.js");
}

const globals = globalThis as Record<string, unknown>;

/** Just enough of Foundry's SchemaField for a registration to build one. */
class FakeSchemaField {
  constructor(public fields: Record<string, { initial: unknown }>) {}
  getInitialValue() {
    return Object.fromEntries(Object.entries(this.fields).map(([k, f]) => [k, f.initial]));
  }
  /**
   * Cleans the way Foundry's SchemaField does where it matters here: a field a
   * partial change leaves out is filled in only when there is no source.
   */
  clean(value: Record<string, unknown>, options: { partial?: boolean }, state: { source?: unknown } = {}) {
    const out = { ...value };
    for (const [key, field] of Object.entries(this.fields)) {
      if (key in out || (options.partial && state.source)) continue;
      out[key] = field.initial;
    }
    return out;
  }
}

/** Foundry's ObjectField, as far as the extensions field builds on it. */
class FakeObjectField {
  parent: unknown = null;
  constructor(public options: { initial?: unknown }) {}
  getInitialValue() {
    const { initial } = this.options;
    return typeof initial === "function" ? initial() : initial;
  }
  _cleanType(data: unknown) {
    return data;
  }
}

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  globals.foundry = { data: { fields: { SchemaField: FakeSchemaField, ObjectField: FakeObjectField } } };
});

afterEach(() => {
  delete globals.Hooks;
  delete globals.foundry;
  vi.restoreAllMocks();
});

/** Data extension points for add-on modules (sargas79/GWorldVTT#239). */
describe("module fields on system documents", () => {
  it("registers a module's fields for the types it names, and refuses a second overlapping one", async () => {
    const api = await load();
    expect(api.registerDataExtension({ module: "test-addon", documentName: "Item", types: ["equipment"], schema: { capacity: { initial: 3 } } })).toBe("test-addon");
    expect(api.extensionsFor("Item", "equipment").map((e) => e.module)).toEqual(["test-addon"]);
    expect(api.extensionsFor("Item", "skill")).toEqual([]);
    expect(api.extensionsFor("Actor", "equipment")).toEqual([]);
    expect(api.registerDataExtension({ module: "test-addon", documentName: "Item", types: "*", schema: {} })).toBeNull();
    expect(api.registerDataExtension({ module: "test-addon", documentName: "Scene" as never, types: "*", schema: {} })).toBeNull();
  });

  it("keeps the fields a partial update leaves out, and fills a new document's (#262)", async () => {
    const api = await load();
    api.registerDataExtension({ module: "test-addon", documentName: "Actor", types: "*", schema: { destiny: { initial: null }, wildcard: { initial: [] } } });
    const field = api.extensionsField("Actor");
    Object.defineProperty(field, "gworldType", { get: () => "character" });
    const stored = { "test-addon": { destiny: 1, wildcard: [{ skill: "Sneak!", value: 2 }] } };
    const partial = field._cleanType({ "test-addon": { wildcard: [{ skill: "Sneak!", value: 1 }] } }, { partial: true }, { source: stored });
    expect(partial["test-addon"]).toEqual({ wildcard: [{ skill: "Sneak!", value: 1 }] });
    const created = field._cleanType({}, {}, {});
    expect(created["test-addon"]).toEqual({ destiny: null, wildcard: [] });
  });

  it("gives each new document its own extensions object, and never writes into the one it cleans (#266)", async () => {
    const api = await load();
    api.registerDataExtension({ module: "test-addon", documentName: "Item", types: ["equipment"], schema: { holy: { initial: false } } });
    const field = api.extensionsField("Item");
    Object.defineProperty(field, "gworldType", { get: () => "equipment" });
    const first = field.getInitialValue();
    const second = field.getInitialValue();
    expect(first).not.toBe(second);

    const one = field._cleanType(first, {}, {});
    const two = field._cleanType(second, {}, {});
    one["test-addon"].holy = true;
    expect(first).toEqual({});
    expect(two["test-addon"]).toEqual({ holy: false });
    expect(field.getInitialValue()).toEqual({});

    const stored = { "test-addon": { holy: true } };
    const cleaned = field._cleanType(stored, {}, {});
    expect(cleaned).not.toBe(stored);
    expect(cleaned["test-addon"]).not.toBe(stored["test-addon"]);
  });

  it("reads a module's data over its fields' initial values", async () => {
    const api = await load();
    api.registerDataExtension({ module: "test-addon", documentName: "Item", types: ["equipment"], schema: { capacity: { initial: 3 }, charged: { initial: false } } });
    const item = { documentName: "Item", type: "equipment", system: { extensions: { "test-addon": { capacity: 7 } } } };
    expect(api.getExtension(item, "test-addon")).toEqual({ capacity: 7, charged: false });
    expect(api.getExtension({ documentName: "Item", type: "skill", system: {} }, "test-addon")).toEqual({});
  });
});

describe("skill levels once all are known (#268)", () => {
  const skill = (name: string, level: number | null) => ({ name, system: { derived: { level, fromDefault: false, bonusLines: [] as unknown[] } } });

  it("writes what a listener changed, with its note in the level's breakdown", async () => {
    const api = await load();
    const lore = skill("Lore", 15);
    const craft = skill("Craft", 11);
    const levels: Record<string, number> = { Theory: 12 };
    globals.Hooks = {
      callAll: (_hook: string, context: { skills: Array<{ name: string; level: number | null; fromDefault: boolean; note?: string; source?: string }>; levelOf: (n: string) => number | null }) => {
        const ceiling = context.levelOf("Theory")!;
        for (const entry of context.skills) {
          if (entry.name === "Lore" && entry.level !== null && entry.level > ceiling) Object.assign(entry, { level: ceiling, note: "Held to Theory", source: "test-addon" });
        }
      },
    };
    api.adjustSkillLevels({}, [lore, craft], (name) => levels[name] ?? null);
    expect(lore.system.derived.level).toBe(12);
    expect(lore.system.derived.bonusLines).toEqual([{ label: "Held to Theory", value: -3, source: "test-addon" }]);
    expect(craft.system.derived).toEqual({ level: 11, fromDefault: false, bonusLines: [] });
  });

  it("changes nothing when a listener throws", async () => {
    const api = await load();
    const lore = skill("Lore", 15);
    globals.Hooks = { callAll: (_hook: string, context: { skills: Array<{ level: number | null }> }) => { context.skills[0]!.level = 1; throw new Error("boom"); } };
    api.adjustSkillLevels({}, [lore], () => null);
    expect(lore.system.derived.level).toBe(15);
  });
});

describe("module item types", () => {
  const actor = (items: unknown[]) => ({ items, get: undefined });

  it("lists a module's type on the tab it names, with its columns and the actions that apply", async () => {
    const api = await load();
    const run = vi.fn();
    expect(api.registerItemType({
      module: "test-addon", type: "test-addon.charm", label: "Charms", tab: "magic", builderStep: "spells",
      columns: (item) => [{ label: "Power", value: item.system.power }],
      actions: [
        { key: "use", label: "Use", run },
        { key: "recharge", label: "Recharge", visible: (item) => item.system.power === 0, run },
      ],
    })).toBe("test-addon.charm");
    const sections = api.itemSectionsFor(actor([
      { id: "a", name: "Luck charm", img: "x.svg", type: "test-addon.charm", system: { power: 2 } },
      { id: "b", name: "Sword", type: "equipment", system: {} },
    ]), "magic");
    expect(sections).toHaveLength(1);
    expect(sections[0]!.rows).toEqual([{
      id: "a", name: "Luck charm", img: "x.svg",
      columns: [{ label: "Power", value: 2 }],
      actions: [{ key: "use", label: "Use", icon: "fa-solid fa-play" }],
    }]);
    expect(api.itemSectionsFor(actor([]), "gear")).toEqual([]);
    expect(api.builderTypesFor("spells")).toEqual(["test-addon.charm"]);
    expect(api.builderTypesFor("gear")).toEqual([]);
  });

  it("summarises a module's compendium entry by its columns, reading the fields it names", async () => {
    const api = await load();
    api.registerItemType({
      module: "test-addon", type: "test-addon.charm", label: "Charms", tab: "magic", indexFields: ["system.power", "name"],
      columns: (item) => [{ label: "Power", value: item.system.power }, { label: "Uses", value: 3 }],
    });
    expect(api.pickerIndexFields(["test-addon.charm", "spell"])).toEqual(["system.power"]);
    expect(api.addonItemSummary({ type: "test-addon.charm", system: { power: 2 } })).toBe("Power 2 · Uses 3");
    expect(api.addonItemSummary({ type: "spell", system: {} })).toBeNull();
  });

  it("hides an unavailable list unless the actor already has one of its items", async () => {
    const api = await load();
    api.registerItemType({ module: "test-addon", type: "test-addon.charm", label: "Charms", tab: "magic", available: () => false });
    expect(api.tabHasAddonSections(actor([]), "magic")).toBe(false);
    expect(api.tabHasAddonSections(actor([{ id: "a", type: "test-addon.charm", system: {} }]), "magic")).toBe(true);
  });

  it("refuses a type that isn't the module's own, a tab that doesn't exist, or a second registration", async () => {
    const api = await load();
    expect(api.registerItemType({ module: "test-addon", type: "charm", label: "Charms", tab: "magic" })).toBeNull();
    expect(api.registerItemType({ module: "test-addon", type: "other.charm", label: "Charms", tab: "magic" })).toBeNull();
    expect(api.registerItemType({ module: "test-addon", type: "test-addon.charm", label: "Charms", tab: "grimoire" as never })).toBeNull();
    expect(api.registerItemType({ module: "test-addon", type: "test-addon.charm", label: "Charms", tab: "magic" })).toBe("test-addon.charm");
    expect(api.registerItemType({ module: "test-addon", type: "test-addon.charm", label: "Charms", tab: "gear" })).toBeNull();
  });

  it("keeps a throwing column callback from breaking the sheet", async () => {
    const api = await load();
    api.registerItemType({ module: "test-addon", type: "test-addon.charm", label: "Charms", tab: "magic", columns: () => { throw new Error("boom"); } });
    const rows = api.itemSectionsFor(actor([{ id: "a", name: "A", type: "test-addon.charm", system: {} }]), "magic")[0]!.rows;
    expect(rows[0]!.columns).toEqual([]);
  });

  it("runs a row action on the item it was clicked on", async () => {
    const api = await load();
    const run = vi.fn();
    api.registerItemType({ module: "test-addon", type: "test-addon.charm", label: "Charms", tab: "magic", actions: [{ key: "use", label: "Use", run }] });
    const item = { id: "a", type: "test-addon.charm" };
    const owner = { items: { get: (id: string) => (id === "a" ? item : undefined) } };
    await api.runItemTypeAction(owner, "a", "use");
    expect(run).toHaveBeenCalledWith(item, owner);
    await api.runItemTypeAction(owner, "a", "missing");
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("gives a type the generic sheet once the system can register it, unless the module brings its own", async () => {
    const api = await load();
    api.registerItemType({ module: "test-addon", type: "test-addon.early", label: "Early", tab: "gear" });
    const registrar = vi.fn();
    api.setGenericSheetRegistrar(registrar);
    expect(registrar).toHaveBeenCalledWith("test-addon.early");
    api.registerItemType({ module: "test-addon", type: "test-addon.late", label: "Late", tab: "gear" });
    api.registerItemType({ module: "test-addon", type: "test-addon.own", label: "Own", tab: "gear", genericSheet: false });
    expect(registrar.mock.calls.map((c) => c[0])).toEqual(["test-addon.early", "test-addon.late"]);
  });
});

describe("price modifiers", () => {
  it("applies modifiers in order on the stored figures, and says what each changed", async () => {
    const api = await load();
    api.registerPriceModifier({ module: "test-addon", key: "gilded", types: ["equipment"], apply: (_item, p) => ({ cost: p.cost * 2, label: "Gilded" }) });
    api.registerPriceModifier({ module: "test-addon", key: "light", apply: (_item, p) => ({ weight: p.weight / 2 }) });
    const sword = { type: "equipment", system: { cost: 500, weight: 3 } };
    expect(api.effectivePrice(sword)).toEqual({
      cost: 1000, weight: 1.5,
      lines: [{ label: "Gilded", cost: 500, weight: 0 }, { label: "test-addon.light", cost: 0, weight: -1.5 }],
    });
    expect(api.effectivePrice({ type: "armor", system: { cost: 100, weight: 10 } })).toMatchObject({ cost: 100, weight: 5 });
    expect(sword.system).toEqual({ cost: 500, weight: 3 });
  });

  it("reads what the item prepared, and the stored figures when no module changes prices", async () => {
    const api = await load();
    const item = { system: { cost: 10, weight: 2 }, effectivePrice: { cost: 99, weight: 9, lines: [] } };
    expect(api.effectiveCost(item)).toBe(10);
    api.registerPriceModifier({ module: "test-addon", key: "x", apply: () => null });
    expect(api.effectiveCost(item)).toBe(99);
    expect(api.effectiveWeight(item)).toBe(9);
    expect(api.effectiveWeight({ system: { weight: 4 } })).toBe(4);
  });

  it("ignores a modifier that throws or returns nonsense", async () => {
    const api = await load();
    api.registerPriceModifier({ module: "test-addon", key: "boom", apply: () => { throw new Error("boom"); } });
    api.registerPriceModifier({ module: "test-addon", key: "nan", apply: () => ({ cost: Number.NaN }) });
    expect(api.effectivePrice({ system: { cost: 5, weight: 1 } })).toEqual({ cost: 5, weight: 1, lines: [] });
  });
});

describe("technique kinds", () => {
  it("registers a kind under the module's namespace and refuses a duplicate", async () => {
    const api = await load();
    const derive = () => ({ level: 12 });
    expect(api.registerTechniqueKind({ module: "test-addon", key: "combo", label: "Combination", derive })).toBe("test-addon.combo");
    expect(api.registerTechniqueKind({ module: "test-addon", key: "combo", label: "Again", derive })).toBeNull();
    expect(api.registeredTechniqueKind("test-addon.combo")?.label).toBe("Combination");
    expect(api.registeredTechniqueKinds()).toEqual([{ key: "test-addon.combo", label: "Combination" }]);
    expect(api.registeredTechniqueKind("")).toBeUndefined();
  });
});

describe("bonus lines", () => {
  const lines = () => [
    { key: "talent", label: "Talent", value: 2, source: "system" },
    { key: "tools", label: "Equipment", value: 1, source: "system" },
  ];

  it("totals the lines a listener added to or cancelled", async () => {
    const api = await load();
    globals.Hooks = {
      callAll: (_hook: string, context: { lines: Array<{ key?: string; label: string; value: number; source: string; reason?: string }> }) => {
        const talent = context.lines.find((l) => l.key === "talent")!;
        talent.value = 0;
        talent.reason = "Not a wildcard skill";
        context.lines.push({ label: "Style familiarity", value: 1, source: "test-addon" });
      },
    };
    const result = api.totalBonusLines(api.DATA_HOOKS.skillBonuses, { lines: lines() });
    expect(result.total).toBe(2);
    expect(result.lines.find((l) => l.key === "talent")).toMatchObject({ value: 0, reason: "Not a wildcard skill" });
  });

  it("keeps the lines as they were when a listener throws, and drops malformed ones", async () => {
    const api = await load();
    globals.Hooks = { callAll: (_hook: string, context: { lines: unknown[] }) => { (context.lines[0] as { value: number }).value = 50; throw new Error("boom"); } };
    expect(api.totalBonusLines(api.DATA_HOOKS.skillBonuses, { lines: lines() }).total).toBe(3);
    globals.Hooks = { callAll: (_hook: string, context: { lines: unknown[] }) => { context.lines.push({ label: "Bad", value: "4" }); } };
    expect(api.totalBonusLines(api.DATA_HOOKS.skillBonuses, { lines: lines() }).total).toBe(3);
  });
});

describe("technique kinds in and out of play (since 1.26.0)", () => {
  it("leaves a kind whose check says no out of the choice, and finds it as out of play", async () => {
    const api = await load();
    let on = false;
    api.registerTechniqueKind({ module: "test-addon", key: "ta", label: "Targeted Attack", derive: () => ({ level: 9 }), available: () => on });
    expect(api.registeredTechniqueKinds()).toEqual([]);
    expect(api.registeredTechniqueKind("test-addon.ta")).toBeUndefined();
    expect(api.unavailableTechniqueKind("test-addon.ta")?.label).toBe("Targeted Attack");
    on = true;
    expect(api.registeredTechniqueKinds()).toEqual([{ key: "test-addon.ta", label: "Targeted Attack" }]);
    expect(api.unavailableTechniqueKind("test-addon.ta")).toBeUndefined();
  });
});

describe("Move changed by modules (since 1.42.0)", () => {
  it("multiplies, rounds down, adds and never goes below 0", async () => {
    const { applyMoveLines } = await import("../data-extensions.js");
    expect(applyMoveLines(7, [{ label: "Half", multiplier: 0.5 }])).toBe(3);
    expect(applyMoveLines(7, [{ label: "A yard short", value: -1 }])).toBe(6);
    expect(applyMoveLines(7, [{ label: "Wound", multiplier: 0.8 }, { label: "Short", value: -1 }])).toBe(4);
    expect(applyMoveLines(2, [{ label: "Crawl", value: -5 }])).toBe(0);
  });
});

describe("carried weight a module leaves out (since 1.58.0)", () => {
  const lines = () => [
    { item: { id: "suit" }, label: "Battlesuit", weight: 150, counts: true },
    { item: { id: "pack" }, label: "Pack", weight: 40, counts: true },
    { item: { id: "rope" }, label: "Rope", weight: 5, counts: true },
  ];

  it("adds up what counts and says what was left out or lowered, and why", async () => {
    const { moduleCarriedWeight } = await load();
    globals.Hooks = {
      callAll: (_hook: string, context: { lines: Array<{ item: { id: string }; weight: number; counts: boolean; reason?: string }> }) => {
        const [suit, pack] = context.lines;
        suit!.counts = false;
        suit!.reason = "Powered";
        pack!.weight = 10;
        pack!.reason = "Weightless load";
      },
    };
    const result = moduleCarriedWeight({ name: "Someone" }, lines());
    expect(result.total).toBe(15);
    expect(result.notCounted).toEqual([
      { label: "Battlesuit", weight: 150, counted: 0, reason: "Powered" },
      { label: "Pack", weight: 40, counted: 10, reason: "Weightless load" },
    ]);
  });

  it("never raises a weight, and ignores a listener that throws", async () => {
    const { moduleCarriedWeight } = await load();
    globals.Hooks = { callAll: (_hook: string, context: { lines: Array<{ weight: number }> }) => { context.lines[2]!.weight = 500; } };
    expect(moduleCarriedWeight({}, lines()).total).toBe(195);
    globals.Hooks = { callAll: (_hook: string, context: { lines: Array<{ counts: boolean }> }) => { context.lines[0]!.counts = false; throw new Error("boom"); } };
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(moduleCarriedWeight({}, lines())).toEqual({ total: 195, notCounted: [] });
  });
});

describe("trait effects a module adds (since 1.47.0)", () => {
  const effects = () => ({ sealed: false, liftingSt: 0, protectedSense: { vision: false } });

  it("keeps what a listener changed, and what it says granted it", async () => {
    const { moduleTraitEffects } = await load();
    globals.Hooks = {
      callAll: (_hook: string, context: {
        effects: { sealed: boolean; liftingSt: number };
        sources: Array<{ effect: string; label: string; value?: number }>;
      }) => {
        context.effects.sealed = true;
        context.effects.liftingSt += 10;
        context.sources.push({ effect: "sealed", label: "Power Armour" });
        context.sources.push({ effect: "liftingSt", label: "Power Armour", value: 10 });
      },
    };
    const result = moduleTraitEffects({ name: "Someone" }, effects());
    expect(result.effects.sealed).toBe(true);
    expect(result.effects.liftingSt).toBe(10);
    expect(result.sources).toEqual([
      { effect: "sealed", label: "Power Armour" },
      { effect: "liftingSt", label: "Power Armour", value: 10 },
    ]);
  });

  it("changes nothing at all when a listener throws", async () => {
    const { moduleTraitEffects } = await load();
    globals.Hooks = {
      callAll: (_hook: string, context: { effects: { sealed: boolean } }) => {
        context.effects.sealed = true;
        throw new Error("boom");
      },
    };
    const result = moduleTraitEffects({ name: "Someone" }, effects());
    expect(result.effects.sealed).toBe(false);
    expect(result.sources).toEqual([]);
  });

  it("drops a source that does not say what it is or what granted it", async () => {
    const { moduleTraitEffects } = await load();
    globals.Hooks = {
      callAll: (_hook: string, context: { sources: unknown[] }) => {
        context.sources.push({ effect: "sealed" }, { label: "Nothing" }, { effect: "sealed", label: "A Suit" });
      },
    };
    expect(moduleTraitEffects({}, effects()).sources).toEqual([{ effect: "sealed", label: "A Suit" }]);
  });

  it("leaves the effects alone where no module is listening", async () => {
    const { moduleTraitEffects } = await load();
    delete globals.Hooks;
    const result = moduleTraitEffects({}, effects());
    expect(result.effects.sealed).toBe(false);
    expect(result.sources).toEqual([]);
  });
});

