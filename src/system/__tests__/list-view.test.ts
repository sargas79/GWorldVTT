import { describe, expect, it } from "vitest";

import { asSortMode, firstLine, groupRows, matchesSearch, selectedKey, sortRows } from "../sheet-v2/list-view.js";

const rows = [
  { name: "Tracking", level: 13, points: 2 },
  { name: "Stealth", level: 15, points: 4 },
  { name: "Observation", level: 13, points: 2 },
  { name: "Bow", level: null, points: 0 },
];

describe("sorting a list", () => {
  it("sorts by name by default", () => {
    expect(sortRows(rows, asSortMode(undefined)).map((r) => r.name)).toEqual(["Bow", "Observation", "Stealth", "Tracking"]);
  });

  it("sorts by level, highest first, ties by name, no level last", () => {
    expect(sortRows(rows, "level").map((r) => r.name)).toEqual(["Stealth", "Observation", "Tracking", "Bow"]);
  });

  it("sorts by points, highest first, ties by name", () => {
    expect(sortRows(rows, "points").map((r) => r.name)).toEqual(["Stealth", "Observation", "Tracking", "Bow"]);
  });

  it("reads an unknown sort as by name", () => {
    expect(asSortMode("useFrequency")).toBe("name");
  });
});

describe("grouping a list", () => {
  it("groups in the order given, unknown groups after, empty ones left out", () => {
    const groups = groupRows(
      [{ g: "IQ", n: 1 }, { g: "DX", n: 2 }, { g: "Zeta", n: 3 }, { g: "Alpha", n: 4 }, { g: "IQ", n: 5 }],
      (r) => r.g,
      ["DX", "IQ", "HT"],
    );
    expect(groups.map((g) => [g.key, g.rows.map((r) => r.n)])).toEqual([
      ["DX", [2]],
      ["IQ", [1, 5]],
      ["Alpha", [4]],
      ["Zeta", [3]],
    ]);
  });
});

describe("the selected row", () => {
  it("keeps the row wanted, or falls back to the first", () => {
    expect(selectedKey(["a", "b"], "b")).toBe("b");
    expect(selectedKey(["a", "b"], "gone")).toBe("a");
    expect(selectedKey([], "a")).toBeNull();
  });
});

describe("search and summaries", () => {
  it("matches a name case-insensitively, and everything for an empty search", () => {
    expect(matchesSearch("Stealth", "steal")).toBe(true);
    expect(matchesSearch("Stealth", "  ")).toBe(true);
    expect(matchesSearch("Stealth", "bow")).toBe(false);
  });

  it("takes a description's first line, cut at a word", () => {
    expect(firstLine("<p>Move quietly &amp; unseen.</p><p>More.</p>")).toBe("Move quietly & unseen.");
    expect(firstLine("<p>This is the ability to hide and to move silently anywhere at all</p>", 30)).toBe("This is the ability to hide…");
    expect(firstLine("")).toBe("");
  });
});
