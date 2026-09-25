import { describe, expect, it } from "vitest";

import { isUuid, proseMap, proseTargetsOf } from "../prose.js";

describe("finding a section's prose", () => {
  it("reads the section ids a journal entry's flags name, from any scope", () => {
    expect(proseTargetsOf({ "test-content": { gmScreen: "criticalHit" } })).toEqual([
      "criticalHit",
    ]);
    expect(
      proseTargetsOf({
        "test-content": { gmScreen: ["shock", " knockback "] },
        core: { other: 1 },
      }),
    ).toEqual(["shock", "knockback"]);
    expect(proseTargetsOf({ "test-content": { rule: "highSpeed" } })).toEqual([]);
    expect(proseTargetsOf(null)).toEqual([]);
  });

  it("keeps the first entry for each id, among those the user may read", () => {
    const map = proseMap([
      {
        uuid: "Compendium.a.JournalEntry.hidden",
        flags: { a: { gmScreen: "criticalHit" } },
        visible: false,
      },
      {
        uuid: "Compendium.a.JournalEntry.one",
        flags: { a: { gmScreen: ["criticalHit", "criticalMiss"] } },
        visible: true,
      },
      {
        uuid: "Compendium.b.JournalEntry.two",
        flags: { b: { gmScreen: "criticalHit" } },
        visible: true,
      },
    ]);
    expect(map.get("criticalHit")).toBe("Compendium.a.JournalEntry.one");
    expect(map.get("criticalMiss")).toBe("Compendium.a.JournalEntry.one");
    expect(map.size).toBe(2);
  });

  it("tells a document's uuid from a module's HTML", () => {
    expect(isUuid("Compendium.test-content.rules.JournalEntry.abc123")).toBe(true);
    expect(isUuid("JournalEntry.abc123.JournalEntryPage.def456")).toBe(true);
    expect(isUuid("<p>Roll 3d.</p>")).toBe(false);
  });
});
