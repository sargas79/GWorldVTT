import { describe, expect, it } from "vitest";

import { fastDrawHelps, loadsByTheRound, parseShots, reloadTime, reloadTimeWith, usableAids, type ReloadAid } from "../ammunition.js";

describe("a reload's time per round, and aids used one at a time or multiplying (sargas79/GWorldVTT#652)", () => {
  const magazine = parseShots("30+1(3)");
  const revolver = parseShots("6(3i)");

  it("reads no time per round, no roll in place of the skill and no required rolls", () => {
    expect(magazine).toMatchObject({ perRoundSeconds: 0, fastDrawRoll: null, requiredRolls: [] });
    expect(loadsByTheRound(magazine)).toBe(false);
    expect(loadsByTheRound(revolver)).toBe(true);
  });

  it("adds a time per round to the fixed one, and asks how many rounds", () => {
    const entry = { ...magazine, reloadSeconds: 2, perRoundSeconds: 1 };
    expect(loadsByTheRound(entry)).toBe(true);
    expect(reloadTime(entry, 5)).toBe(7);
    expect(reloadTime(entry, 0)).toBe(2);
    // On top of a weapon loaded shot by shot, both count per round.
    expect(reloadTime({ ...revolver, perRoundSeconds: 1 }, 2)).toBe(8);
    // Where the table gives no time, a time per round doesn't make one.
    expect(reloadTime({ ...magazine, reloadSeconds: null, perRoundSeconds: 1 }, 5)).toBeNull();
  });

  it("uses one aid of an exclusive group, the first ticked", () => {
    const aids: ReloadAid[] = [
      { id: "a", label: "A", seconds: -1, exclusiveGroup: "hands" },
      { id: "b", label: "B", seconds: -2, exclusiveGroup: "hands" },
      { id: "c", label: "C", seconds: 1 },
    ];
    expect(usableAids(aids).map((aid) => aid.id)).toEqual(["a", "c"]);
    expect(reloadTimeWith({ entry: magazine, seconds: 5, rounds: 31, aids }).seconds).toBe(5);
  });

  it("multiplies the time once the aids' seconds are in, rounding up, before the skill's saving", () => {
    const half: ReloadAid = { id: "half", label: "Half", multiplier: 0.5 };
    expect(reloadTimeWith({ entry: magazine, seconds: 3, rounds: 31, aids: [half] }).seconds).toBe(2);
    expect(reloadTimeWith({ entry: magazine, seconds: 5, rounds: 31, aids: [half, { id: "x", label: "X", seconds: 1 }] }).seconds).toBe(3);
    expect(reloadTimeWith({ entry: magazine, seconds: 30, rounds: 31, aids: [{ id: "tenth", label: "Tenth", multiplier: 0.1 }] }).seconds).toBe(3);
    expect(reloadTimeWith({ entry: magazine, seconds: 3, rounds: 31, aids: [half, half] }).seconds).toBe(1);
    expect(reloadTimeWith({ entry: magazine, seconds: 3, rounds: 31, aids: [{ id: "double", label: "Double", multiplier: 2 }] }).seconds).toBe(6);
    expect(reloadTimeWith({ entry: magazine, seconds: 8, rounds: 31, aids: [half], fastDraw: true })).toEqual({ seconds: 3, saved: 1 });
    expect(fastDrawHelps({ entry: magazine, seconds: 3, rounds: 31, aids: [{ id: "third", label: "Third", multiplier: 0.3 }] })).toBe(false);
  });
});
