import { describe, expect, it } from "vitest";

import { SPLIT_AGAINST as rules } from "../armor.js";
// The parser is plain JavaScript run by node, but it holds the same table, and
// the two silently diverging would put pack data out of step with the rules that
// read it. Importing it here is the only thing that actually keeps them equal.
import { SPLIT_AGAINST as parser } from "../../../tools/parse-armor.mjs";

describe("the split-DR mapping the parser writes and the rules apply", () => {
  it("names the same damage for the low-tech and barding tables", () => {
    expect([...parser.lowTech].sort()).toEqual([...rules.lowTech].sort());
  });

  it("names the same damage for the high- and ultra-tech table", () => {
    expect([...parser.highTech].sort()).toEqual([...rules.highTech].sort());
  });

  it("keeps crushing in both, which is what the two footnotes agree on", () => {
    expect(rules.lowTech).toContain("cr");
    expect(rules.highTech).toContain("cr");
  });
});
