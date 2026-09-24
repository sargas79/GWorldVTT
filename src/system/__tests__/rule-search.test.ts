import { describe, expect, it } from "vitest";

import { ruleMatches, rulesInView } from "../rule-search.js";

const rules = [
  { key: "magic", text: "Magic Magery, spells learned as skills Magic" },
  { key: "manaLevels", text: "Mana levels The mana of the world decides who can cast Magic" },
  { key: "grappling", text: "Grappling Control points instead of a grip Combat options" },
];

describe("ruleMatches", () => {
  it("finds a rule by part of its name, whatever the case", () => {
    expect(ruleMatches(rules[1]!.text, "MANA")).toBe(true);
  });

  it("finds a rule by its hint", () => {
    expect(ruleMatches(rules[2]!.text, "control points")).toBe(true);
  });

  it("ignores spaces around what was typed", () => {
    expect(ruleMatches(rules[2]!.text, "  grapp ")).toBe(true);
  });

  it("matches everything when nothing is typed", () => {
    expect(ruleMatches(rules[0]!.text, "")).toBe(true);
    expect(ruleMatches(rules[0]!.text, "   ")).toBe(true);
  });

  it("does not match a rule that says nothing of it", () => {
    expect(ruleMatches(rules[2]!.text, "mana")).toBe(false);
  });
});

describe("rulesInView", () => {
  it("is every rule when there is no search", () => {
    expect(rulesInView(rules, "")).toEqual(["magic", "manaLevels", "grappling"]);
  });

  it("is only the rules the search shows", () => {
    expect(rulesInView(rules, "magic")).toEqual(["magic", "manaLevels"]);
  });

  it("is none when nothing matches", () => {
    expect(rulesInView(rules, "zzz")).toEqual([]);
  });
});
