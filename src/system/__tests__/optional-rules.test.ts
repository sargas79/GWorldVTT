import { afterEach, describe, expect, it } from "vitest";

import {
  OPTIONAL_RULES,
  RULE_GROUPS,
  allRuleKeys,
  defaultRuleState,
  isRuleOn,
  ruleState,
} from "../optional-rules.js";

const globals = globalThis as Record<string, unknown>;

afterEach(() => {
  delete globals.game;
});

describe("the rule catalogue", () => {
  it("has a group for every listed set of rules, and no empty ones", () => {
    for (const group of RULE_GROUPS) {
      expect(OPTIONAL_RULES[group.id]).toBeDefined();
      expect(OPTIONAL_RULES[group.id].length).toBeGreaterThan(0);
    }
    expect(Object.keys(OPTIONAL_RULES).sort()).toEqual(RULE_GROUPS.map((g) => g.id).sort());
  });

  it("names each rule once", () => {
    const keys = allRuleKeys();
    expect(new Set(keys).size).toBe(keys.length);
  });

  /** Every rule cites the page it comes from, so a ruling can be checked. */
  it("cites a book and page for every rule", () => {
    for (const group of Object.values(OPTIONAL_RULES)) {
      for (const rule of group) {
        expect(rule.reference).toMatch(/^(Campaigns|Characters|GURPS Lite) pp?\. /);
      }
    }
  });

  it("starts with everything in play", () => {
    const state = defaultRuleState();
    expect(Object.values(state).every(Boolean)).toBe(true);
    expect(Object.keys(state).sort()).toEqual(allRuleKeys().sort());
  });
});

describe("reading the state", () => {
  /**
   * Asked before the settings are registered, or outside Foundry entirely,
   * this must be the defaults. A rule reading as off because the registry was
   * not ready yet is a rule silently missing from a fight.
   */
  it("falls back to the defaults with no settings registry", () => {
    expect(ruleState()).toEqual(defaultRuleState());
    expect(isRuleOn("slams")).toBe(true);
  });

  it("reads what is stored", () => {
    globals.game = { settings: { get: () => ({ slams: false }) } };
    expect(isRuleOn("slams")).toBe(false);
    expect(isRuleOn("evading")).toBe(true);
  });

  /**
   * A world saved by an earlier version has no entry for a rule added since,
   * and that rule must read as its default rather than as off.
   */
  it("fills a key the stored state has never heard of from the defaults", () => {
    globals.game = { settings: { get: () => ({ slams: false }) } };
    const state = ruleState();
    expect(Object.keys(state).sort()).toEqual(allRuleKeys().sort());
    expect(state.explosions).toBe(true);
  });

  it("ignores a stored value that is not a boolean", () => {
    globals.game = { settings: { get: () => ({ slams: "no thanks" }) } };
    expect(isRuleOn("slams")).toBe(true);
  });

  /** An unlisted key is a rule someone forgot to register, not one turned off. */
  it("treats an unknown rule as in play", () => {
    expect(isRuleOn("somethingNobodyRegistered")).toBe(true);
  });
});
