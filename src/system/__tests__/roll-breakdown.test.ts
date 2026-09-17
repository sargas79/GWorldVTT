import { describe, expect, it } from "vitest";

import { rollBreakdown, signed } from "../roll-breakdown.js";

const manual = (...modifiers: Array<{ label: string; value: number }>) =>
  ({ modifiers, automatic: false }) as const;
const auto = (...modifiers: Array<{ label: string; value: number }>) =>
  ({ modifiers, automatic: true }) as const;

describe("the pre-roll breakdown", () => {
  it("adds the modifiers to the base to reach the effective level", () => {
    // The issue's example: a firearm attack at 14, aimed, at range, in the dark.
    const breakdown = rollBreakdown(14, [
      auto({ label: "Shock", value: -2 }),
      manual({ label: "Speed/Range", value: -4 }, { label: "Aimed", value: 3 }),
    ]);
    expect(breakdown.base).toBe(14);
    expect(breakdown.total).toBe(11);
    expect(breakdown.effective).toBe(11);
  });

  it("keeps the lines in the order they were gathered", () => {
    const breakdown = rollBreakdown(10, [
      auto({ label: "Posture", value: -2 }),
      manual({ label: "Situational", value: 1 }),
    ]);
    expect(breakdown.lines.map((l) => l.label)).toEqual(["Posture", "Situational"]);
  });

  it("says which lines are automatic and which were entered", () => {
    // The distinction the issue asks for: which numbers are the player's to
    // change, and which follow from the character's state.
    const breakdown = rollBreakdown(12, [
      auto({ label: "Shock", value: -1 }),
      manual({ label: "Situational", value: -3 }),
    ]);
    expect(breakdown.lines).toEqual([
      { label: "Shock", value: -1, automatic: true },
      { label: "Situational", value: -3, automatic: false },
    ]);
  });

  it("drops a modifier worth nothing", () => {
    // A line that changes nothing explains nothing.
    const breakdown = rollBreakdown(12, [manual({ label: "Cover", value: 0 })]);
    expect(breakdown.lines).toEqual([]);
    expect(breakdown.effective).toBe(12);
  });

  it("drops a malformed value rather than showing NaN for the whole roll", () => {
    const breakdown = rollBreakdown(12, [
      manual({ label: "Broken", value: Number.NaN }, { label: "Real", value: -2 }),
    ]);
    expect(breakdown.lines.map((l) => l.label)).toEqual(["Real"]);
    expect(breakdown.effective).toBe(10);
  });

  it("ignores a missing modifier in a group", () => {
    const breakdown = rollBreakdown(12, [
      { modifiers: [null, undefined, { label: "Real", value: -1 }], automatic: true },
    ]);
    expect(breakdown.effective).toBe(11);
  });

  it("holds the effective level at a cap, and still shows the uncapped total", () => {
    // A Move and Attack cannot be rolled above 9 however good the fighter.
    const breakdown = rollBreakdown(16, [manual({ label: "Situational", value: -1 })], { cap: 9 });
    expect(breakdown.total).toBe(15);
    expect(breakdown.cap).toBe(9);
    expect(breakdown.effective).toBe(9);
  });

  it("caps a Wild Swing as well as a Move and Attack", () => {
    // Both hold skill to 9 (pp. 365, 388), and the roll caps on either -- so a
    // preview that only knew about Move and Attack showed a level above 9 that
    // the roll would not use.
    const swing = rollBreakdown(16, [manual({ label: "Wild Swing", value: -5 })], { cap: 9 });
    expect(swing.total).toBe(11);
    expect(swing.effective).toBe(9);
  });

  it("leaves a total already under the cap alone", () => {
    const breakdown = rollBreakdown(10, [manual({ label: "Range", value: -4 })], { cap: 9 });
    expect(breakdown.effective).toBe(6);
  });

  it("copes with no modifiers at all", () => {
    expect(rollBreakdown(13, [])).toMatchObject({ base: 13, lines: [], total: 13, effective: 13 });
  });

  it("treats a missing base as zero rather than NaN", () => {
    expect(rollBreakdown(Number.NaN, [manual({ label: "x", value: 2 })]).effective).toBe(2);
  });
});

describe("how a modifier is written", () => {
  it("always carries its sign, so a bonus cannot be read as a total", () => {
    expect(signed(3)).toBe("+3");
    expect(signed(-4)).toBe("-4");
    expect(signed(0)).toBe("0");
  });
});
