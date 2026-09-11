import { afterEach, describe, expect, it } from "vitest";

import {
  OPTIONAL_RULES,
  RULE_GROUPS,
  activeRules,
  allRuleKeys,
  defaultRuleState,
  isImplemented,
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

  it("has a default for every rule and no others", () => {
    expect(Object.keys(defaultRuleState()).sort()).toEqual(allRuleKeys().sort());
  });

  /**
   * A rule is on out of the box unless the book itself says it is extra work.
   * Bleeding is the one that does -- "these rules add realism... but they also
   * require extra record keeping, so they are optional" -- so a table opts into
   * it rather than out of it.
   */
  it("starts with everything in play but the ones the book marks optional", () => {
    const off = Object.entries(defaultRuleState())
      .filter(([, on]) => !on)
      .map(([key]) => key);
    expect(off).toEqual(["bleeding"]);
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

/**
 * Named rather than hardcoded, because a rule stops being an example of this
 * the day it is built -- which is the point of the flag. When the catalogue is
 * finished there is no example left, and these say so instead of failing.
 */
const PENDING = Object.values(OPTIONAL_RULES)
  .flat()
  .filter((rule) => rule.implemented === false);

describe("rules that are listed but not built", () => {
  /**
   * They are shown greyed rather than hidden, so the page maps the whole
   * ruleset. But nothing reads them, so they must not report as in play --
   * flipping `implemented` is the one switch that brings a rule into use.
   */
  it("reads as off however the state is stored", () => {
    for (const rule of PENDING) {
      globals.game = { settings: { get: () => ({ [rule.key]: true }) } };
      expect(isRuleOn(rule.key), rule.key).toBe(false);
      expect(isImplemented(rule.key), rule.key).toBe(false);
    }
  });

  it("reads an implemented rule normally", () => {
    expect(isImplemented("slams")).toBe(true);
    expect(isRuleOn("slams")).toBe(true);
  });

  /**
   * A template asking `rules.x` is asking whether a control should be shown,
   * which is the question isRuleOn answers -- so the map handed to a sheet has
   * to agree with it rather than reporting the raw stored state.
   */
  it("is off in the map the sheets read, whatever is stored", () => {
    const stored: Record<string, boolean> = { slams: false };
    for (const rule of PENDING) stored[rule.key] = true;

    globals.game = { settings: { get: () => stored } };
    const active = activeRules();

    expect(active.slams).toBe(false);
    expect(active.explosions).toBe(true);
    for (const rule of PENDING) expect(active[rule.key], rule.key).toBe(false);
    for (const key of allRuleKeys()) expect(active[key], key).toBe(isRuleOn(key));
  });

  it("treats an unlisted key as implemented, matching isRuleOn", () => {
    expect(isImplemented("somethingNobodyRegistered")).toBe(true);
  });

  it("still cites a page for one that is not built", () => {
    // The catalogue's own checks cover every rule; this pins that a pending
    // one is not exempt from them.
    for (const rule of PENDING) expect(rule.reference, rule.key).toBeTruthy();
  });
});
