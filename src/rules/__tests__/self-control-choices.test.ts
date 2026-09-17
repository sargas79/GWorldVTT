import { describe, expect, it } from "vitest";

import {
  DEFAULT_SELF_CONTROL,
  modifiedPoints,
  selfControlChoices,
} from "../traits.js";

/** The value each option would submit, in the order the select renders them. */
const order = (selfControl: number | null | undefined) =>
  selfControlChoices(selfControl).map((option) => option.value);

/** The option the select shows as chosen. */
const chosen = (selfControl: number | null | undefined, category = "") =>
  selfControlChoices(selfControl, { category }).find((option) => option.selected)?.value;

describe("the self-control dropdown's options", () => {
  it("puts None first, ahead of the numbers", () => {
    // The bug this replaces: keyed "6", "9", "12", "15" and "", an object
    // iterates its integer-like keys first and None came last.
    expect(order(null)).toEqual(["", "6", "9", "12", "15"]);
  });

  it("selects None for a trait with no self-control roll", () => {
    // Left to the browser, an unmatched value shows the first option. That is
    // why the order above matters: None now, 6 before.
    expect(chosen(null)).toBe("");
    expect(chosen(undefined)).toBe("");
  });

  it("selects the number a trait actually holds", () => {
    expect(chosen(6)).toBe("6");
    expect(chosen(9)).toBe("9");
    expect(chosen(12)).toBe("12");
    expect(chosen(15)).toBe("15");
  });

  it("selects exactly one option, whatever the value", () => {
    for (const value of [null, undefined, 6, 9, 12, 15, 7, 0]) {
      const selected = selfControlChoices(value).filter((option) => option.selected);
      expect(selected).toHaveLength(1);
    }
  });

  it("falls back to None for a number that is not on the table", () => {
    // None prices at x1, so an unrecognised value lands on the multiplier that
    // changes nothing rather than on one nobody chose.
    expect(chosen(7)).toBe("");
    expect(chosen(0)).toBe("");
  });

  it("marks 12 as the standard for a disadvantage, and nothing else", () => {
    const standard = selfControlChoices(null, { category: "disadvantage" })
      .filter((option) => option.standard)
      .map((option) => option.value);
    expect(standard).toEqual([String(DEFAULT_SELF_CONTROL)]);
  });

  it("marks no standard on a trait that takes no self-control roll", () => {
    for (const category of ["advantage", "perk", "quirk", ""]) {
      expect(selfControlChoices(null, { category }).some((o) => o.standard)).toBe(false);
    }
  });

  it("gives every option a label and a tooltip", () => {
    for (const option of selfControlChoices(null)) {
      expect(option.label).toMatch(/^GWORLD\.Trait\./);
      expect(option.hint).toMatch(/^GWORLD\.Trait\./);
    }
  });

  it("leaves the cost alone for None and for the standard", () => {
    // The point of both: -10 stays -10. The 6 that used to be saved by
    // accident would have made it -20.
    expect(modifiedPoints(-10, [], null)).toBe(-10);
    expect(modifiedPoints(-10, [], DEFAULT_SELF_CONTROL)).toBe(-10);
    expect(modifiedPoints(-10, [], 6)).toBe(-20);
  });
});
