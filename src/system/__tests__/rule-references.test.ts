import { describe, expect, it } from "vitest";

import { flaggedRuleKeys, ruleReferenceMap } from "../rule-references.js";

/** A content module's page for a rule (sargas79/GWorldVTT#189). */
describe("rule reference pages", () => {
  it("reads the rule key off any module's flags", () => {
    expect(flaggedRuleKeys({ "some-module": { book: "basic-set", rule: "highSpeed" } })).toContain("highSpeed");
    expect(flaggedRuleKeys({ "some-module": { rule: null } })).toEqual([]);
    expect(flaggedRuleKeys(null)).toEqual([]);
  });

  /**
   * A module's own rules are registered as `<module>.<key>` (#236). Its page
   * may flag the short key, since the flag already sits in the module's scope,
   * or the full one.
   */
  it("links a page under the module's namespaced key as well as the flagged one", () => {
    expect(flaggedRuleKeys({ "test-addon": { rule: "alpha" } })).toEqual(["alpha", "test-addon.alpha"]);
    expect(flaggedRuleKeys({ "test-addon": { rule: "test-addon.alpha" } })).toEqual(["test-addon.alpha"]);
  });

  it("links only the rules an entry names", () => {
    const pages = ruleReferenceMap([
      { uuid: "Compendium.a.rules.JournalEntry.1", flags: { a: { rule: "highSpeed" } } },
      { uuid: "Compendium.a.rules.JournalEntry.2", flags: { a: { rule: null } } },
      { uuid: "Compendium.a.rules.JournalEntry.3", flags: {} },
    ]);
    expect([...pages]).toEqual([
      ["highSpeed", "Compendium.a.rules.JournalEntry.1"],
      ["a.highSpeed", "Compendium.a.rules.JournalEntry.1"],
    ]);
  });

  it("keeps one link, the first, when two modules flag the same rule", () => {
    const pages = ruleReferenceMap([
      { uuid: "Compendium.a.rules.JournalEntry.1", flags: { a: { rule: "highSpeed" } } },
      { uuid: "Compendium.b.rules.JournalEntry.9", flags: { b: { rule: "highSpeed" } } },
    ]);
    expect([...pages.keys()].filter((key) => key === "highSpeed")).toHaveLength(1);
    expect(pages.get("highSpeed")).toBe("Compendium.a.rules.JournalEntry.1");
  });

  it("is empty with no module providing any", () => {
    expect(ruleReferenceMap([]).size).toBe(0);
  });
});
