import { describe, expect, it } from "vitest";

import { fastDrawHelps, parseShots, reloadTimeWith } from "../ammunition.js";
import { basedOnAnother, clearingResult, clearingRolls } from "../malfunctions.js";

describe("Fast-Draw (Ammo) and reload aids (Characters pp. 194-195)", () => {
  const magazine = parseShots("30+1(3)");
  const revolver = parseShots("6(3i)");

  it("reads a second's saving per reload unless told otherwise", () => {
    expect(magazine).toMatchObject({ fastDrawSeconds: 1, fastDrawPer: "reload", aids: [] });
  });

  it("shaves a second off a magazine, never below one", () => {
    expect(reloadTimeWith({ entry: magazine, seconds: 3, rounds: 31, fastDraw: true })).toEqual({ seconds: 2, saved: 1 });
    expect(reloadTimeWith({ entry: magazine, seconds: 3, rounds: 31, fastDraw: false })).toEqual({ seconds: 3, saved: 0 });
    expect(reloadTimeWith({ entry: { ...magazine, fastDrawSeconds: 5 }, seconds: 3, rounds: 31, fastDraw: true })).toEqual({ seconds: 1, saved: 2 });
  });

  it("saves per round where the entry says so", () => {
    const entry = { ...revolver, fastDrawPer: "round" as const };
    expect(reloadTimeWith({ entry, seconds: 18, rounds: 6, fastDraw: true })).toEqual({ seconds: 12, saved: 6 });
  });

  it("offers the roll only where it would save something", () => {
    expect(fastDrawHelps({ entry: magazine, seconds: 3, rounds: 31 })).toBe(true);
    expect(fastDrawHelps({ entry: magazine, seconds: 1, rounds: 31 })).toBe(false);
    expect(fastDrawHelps({ entry: magazine, seconds: null, rounds: 31 })).toBe(false);
    expect(fastDrawHelps({ entry: { ...magazine, fastDrawSeconds: 0 }, seconds: 3, rounds: 31 })).toBe(false);
    // Loading shot by shot, the Basic Set's second is not offered; a saving per round is.
    expect(fastDrawHelps({ entry: revolver, seconds: 18, rounds: 6 })).toBe(false);
    expect(fastDrawHelps({ entry: { ...revolver, fastDrawPer: "round" }, seconds: 18, rounds: 6 })).toBe(true);
  });

  it("adds an aid's seconds, per round for a weapon loaded shot by shot, and lets it change the saving", () => {
    const helper = { id: "helper", label: "Helper", seconds: -1, fastDrawSeconds: 2 };
    expect(reloadTimeWith({ entry: magazine, seconds: 5, rounds: 31, aids: [helper], fastDraw: false })).toEqual({ seconds: 4, saved: 0 });
    expect(reloadTimeWith({ entry: magazine, seconds: 5, rounds: 31, aids: [helper], fastDraw: true })).toEqual({ seconds: 2, saved: 2 });
    expect(reloadTimeWith({ entry: revolver, seconds: 18, rounds: 6, aids: [{ id: "loader", label: "Loader", seconds: -2 }] }).seconds).toBe(6);
    expect(reloadTimeWith({ entry: magazine, seconds: 3, rounds: 31, aids: [{ id: "x", label: "X", seconds: -9 }] }).seconds).toBe(0);
  });
});

describe("clearing a malfunction (Campaigns p. 407)", () => {
  it("clears a misfire with Armoury+2 or the IQ-based weapon skill, a stoppage with Armoury or the skill at -4", () => {
    expect(clearingRolls("misfire")).toEqual([{ skill: "armoury", modifier: 2 }, { skill: "weapon", modifier: 0 }]);
    expect(clearingRolls("stoppage")).toEqual([{ skill: "armoury", modifier: 0 }, { skill: "weapon", modifier: -4 }]);
  });

  it("fixes it on a success, not yet on a failure, and makes it worse on a critical failure", () => {
    expect(clearingResult({ success: true, criticalFailure: false }, "mechanical")).toBe("cleared");
    expect(clearingResult({ success: false, criticalFailure: false }, "mechanical")).toBe("notYet");
    expect(clearingResult({ success: false, criticalFailure: true }, "mechanical")).toBe("mechanical");
    expect(clearingResult({ success: false, criticalFailure: true }, "destroyed")).toBe("destroyed");
  });

  it("rolls a DX-based skill against IQ at the same relative level (Characters p. 172)", () => {
    expect(basedOnAnother(17, 10, 14)).toBe(21);
  });
});
