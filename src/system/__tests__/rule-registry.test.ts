import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The registry is module-level state, so each test loads a fresh copy of it
 * and of the rule state that reads it.
 */
async function load() {
  vi.resetModules();
  const registry = await import("../rule-registry.js");
  const rules = await import("../optional-rules.js");
  return { ...registry, ...rules };
}

const globals = globalThis as Record<string, unknown>;

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  delete globals.game;
  delete globals.Hooks;
  vi.restoreAllMocks();
});

/** A module registering a group with one switch on by default and one off. */
async function withTestModule() {
  const api = await load();
  expect(api.registerRuleGroup({ module: "test-addon", id: "book", label: "Test Book" })).toBe("test-addon.book");
  expect(
    api.registerRule({ module: "test-addon", group: "book", key: "alpha", name: "Alpha", reference: "Test Book p. 1", default: true }),
  ).toBe("test-addon.alpha");
  expect(
    api.registerRule({ module: "test-addon", group: "book", key: "beta", name: "Beta", reference: "Test Book p. 2", default: false }),
  ).toBe("test-addon.beta");
  return api;
}

describe("registering a module's rules (sargas79/GWorldVTT#236)", () => {
  it("namespaces a module's group and keys by its id", async () => {
    const api = await withTestModule();
    expect(api.registeredRuleGroups()).toEqual([{ id: "test-addon.book", module: "test-addon", label: "Test Book" }]);
    expect(api.registeredRules("test-addon.book").map((rule) => rule.key)).toEqual(["test-addon.alpha", "test-addon.beta"]);
    expect(api.isAddonRuleKey("test-addon.alpha")).toBe(true);
    expect(api.isAddonRuleKey("slams")).toBe(false);
  });

  it("adds the module's rules to the defaults and the key list, after the system's", async () => {
    const api = await withTestModule();
    const defaults = api.defaultRuleState();
    expect(defaults["test-addon.alpha"]).toBe(true);
    expect(defaults["test-addon.beta"]).toBe(false);
    expect(api.allRuleKeys().slice(-2)).toEqual(["test-addon.alpha", "test-addon.beta"]);
  });

  it("reads a module's switch from the stored state, falling back to its default", async () => {
    const api = await withTestModule();
    expect(api.isRuleOn("test-addon.alpha")).toBe(true);
    expect(api.isRuleOn("test-addon.beta")).toBe(false);
    globals.game = { settings: { get: () => ({ "test-addon.alpha": false, "test-addon.beta": true }) } };
    expect(api.isRuleOn("test-addon.alpha")).toBe(false);
    expect(api.isRuleOn("test-addon.beta")).toBe(true);
  });

  /**
   * An unknown system key reads as on, because it is a rule someone forgot to
   * list. A module's key nobody registered belongs to a module that is not
   * running, and that is not in play.
   */
  it("treats a module key that is not registered as off", async () => {
    const api = await load();
    globals.game = { settings: { get: () => ({ "gone-addon.alpha": true }) } };
    expect(api.isRuleOn("gone-addon.alpha")).toBe(false);
    expect(api.isRuleOn("somethingNobodyRegistered")).toBe(true);
  });

  it("keeps a switched-off module's stored choices when the page is saved", async () => {
    const api = await withTestModule();
    const stored = { slams: false, "gone-addon.alpha": true, "test-addon.alpha": false, junk: "x" };
    const saved = api.mergeStoredRules(stored, { slams: true, "test-addon.alpha": true, "test-addon.beta": false });
    expect(saved).toEqual({ "gone-addon.alpha": true, slams: true, "test-addon.alpha": true, "test-addon.beta": false });
  });

  it("marks a module's rule it does not read yet as not implemented, and off", async () => {
    const api = await load();
    api.registerRuleGroup({ module: "test-addon", id: "book", label: "Test Book" });
    api.registerRule({ module: "test-addon", group: "book", key: "later", name: "Later", reference: "p. 3", default: true, implemented: false });
    expect(api.isImplemented("test-addon.later")).toBe(false);
    expect(api.isRuleOn("test-addon.later")).toBe(false);
  });

  it("refuses, with a warning and nothing registered, what it cannot accept", async () => {
    const api = await load();
    const warn = vi.mocked(console.warn);
    expect(api.registerRuleGroup({ module: "", id: "book", label: "X" })).toBeNull();
    expect(api.registerRuleGroup({ module: "test-addon", id: "has.dot", label: "X" })).toBeNull();
    expect(api.registerRuleGroup({ module: "test-addon", id: "book", label: "" })).toBeNull();
    expect(api.registerRuleGroup({ module: "test-addon", id: "book", label: "Book" })).toBe("test-addon.book");
    expect(api.registerRuleGroup({ module: "test-addon", id: "book", label: "Book again" })).toBeNull();
    // A group from another module is not this module's to fill.
    expect(api.registerRule({ module: "other-addon", group: "book", key: "a", name: "A", reference: "p. 1", default: true })).toBeNull();
    expect(api.registerRule({ module: "test-addon", group: "book", key: "a", name: "A", reference: "", default: true })).toBeNull();
    expect(api.registerRule({ module: "test-addon", group: "book", key: "a", name: "A", reference: "p. 1", default: "yes" as unknown as boolean })).toBeNull();
    expect(api.registerRule({ module: "test-addon", group: "book", key: "a", name: "A", reference: "p. 1", default: true })).toBe("test-addon.a");
    expect(api.registerRule({ module: "test-addon", group: "book", key: "a", name: "A", reference: "p. 1", default: true })).toBeNull();
    expect(api.registeredRules()).toHaveLength(1);
    expect(warn).toHaveBeenCalledTimes(8);
  });

  it("closes registration at setup", async () => {
    const api = await load();
    api.closeRuleRegistration();
    expect(api.registerRuleGroup({ module: "test-addon", id: "book", label: "Book" })).toBeNull();
    expect(api.registeredRuleGroups()).toEqual([]);
  });

  it("hands the registry to the modules' hook listeners", async () => {
    const api = await load();
    const callAll = vi.fn((_event: string, registry: { registerRuleGroup: (r: unknown) => unknown }) => {
      registry.registerRuleGroup({ module: "test-addon", id: "book", label: "Book" });
      return true;
    });
    globals.Hooks = { callAll };
    api.openRuleRegistration();
    expect(callAll).toHaveBeenCalledWith(api.REGISTER_RULES_HOOK, expect.any(Object));
    expect(api.registeredRuleGroups().map((group) => group.id)).toEqual(["test-addon.book"]);
  });
});
