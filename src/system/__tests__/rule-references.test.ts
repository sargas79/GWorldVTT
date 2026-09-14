import { describe, expect, it } from "vitest";

import { flaggedRule, ruleReferenceMap } from "../rule-references.js";

/** A content module's page for a rule (sargas79/GWorldVTT#189). */
describe("rule reference pages", () => {
  it("reads the rule key off any module's flags", () => {
    expect(flaggedRule({ "some-module": { book: "basic-set", rule: "highSpeed" } })).toBe("highSpeed");
    expect(flaggedRule({ "some-module": { rule: null } })).toBeNull();
    expect(flaggedRule(null)).toBeNull();
  });

  it("links only the rules an entry names", () => {
    const pages = ruleReferenceMap([
      { uuid: "Compendium.a.rules.JournalEntry.1", flags: { a: { rule: "highSpeed" } } },
      { uuid: "Compendium.a.rules.JournalEntry.2", flags: { a: { rule: null } } },
      { uuid: "Compendium.a.rules.JournalEntry.3", flags: {} },
    ]);
    expect([...pages]).toEqual([["highSpeed", "Compendium.a.rules.JournalEntry.1"]]);
  });

  it("keeps one link, the first, when two modules flag the same rule", () => {
    const pages = ruleReferenceMap([
      { uuid: "Compendium.a.rules.JournalEntry.1", flags: { a: { rule: "highSpeed" } } },
      { uuid: "Compendium.b.rules.JournalEntry.9", flags: { b: { rule: "highSpeed" } } },
    ]);
    expect(pages.size).toBe(1);
    expect(pages.get("highSpeed")).toBe("Compendium.a.rules.JournalEntry.1");
  });

  it("is empty with no module providing any", () => {
    expect(ruleReferenceMap([]).size).toBe(0);
  });
});
