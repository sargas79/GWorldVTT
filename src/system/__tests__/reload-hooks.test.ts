import { afterEach, describe, expect, it } from "vitest";

import { shotsEntryFor } from "../shots-entry.js";

const globals = globalThis as Record<string, unknown>;

afterEach(() => {
  delete globals.Hooks;
});

function listen(listener: (context: any) => void) {
  globals.Hooks = { callAll: (event: string, context: any) => { if (event === "gworld.shotsEntry") listener(context); } };
}

const rifle = () => ({ id: "rifle", name: "Rifle", system: { rangedModes: [{ shots: "30(3)", loaded: 30 }] } });

describe("gworld.shotsEntry's rolls, time per round and aids (sargas79/GWorldVTT#652)", () => {
  it("leaves the Basic Set's reload as it was with no listener", () => {
    expect(shotsEntryFor(rifle(), 0)).toMatchObject({ reloadSeconds: 3, perRoundSeconds: 0, fastDrawRoll: null, requiredRolls: [], aids: [] });
  });

  it("takes a roll in place of the skill, required rolls, a time per round and aids' groups and multipliers", () => {
    listen((context) => {
      context.entry.perRoundSeconds = 2;
      context.entry.fastDrawRoll = { skill: "Stand-in", level: "13", label: "Quick load" };
      context.entry.requiredRolls = [
        { skill: "Riding", label: "Riding", onFail: "continue" },
        { level: 11, label: "Steady" },
        { label: "no skill or level" },
        { skill: "Riding" },
      ];
      context.entry.aids = [
        { id: "a", label: "A", exclusiveGroup: "hands", multiplier: 0.5 },
        { id: "b", label: "B", exclusiveGroup: "", multiplier: "fast" },
      ];
    });
    const entry = shotsEntryFor(rifle(), 0);
    expect(entry.perRoundSeconds).toBe(2);
    expect(entry.fastDrawRoll).toEqual({ skill: "Stand-in", level: 13, label: "Quick load" });
    expect(entry.requiredRolls).toEqual([
      { skill: "Riding", label: "Riding", onFail: "continue" },
      { level: 11, label: "Steady", onFail: "abort" },
    ]);
    expect(entry.aids).toEqual([
      { id: "a", label: "A", exclusiveGroup: "hands", multiplier: 0.5, checked: false },
      { id: "b", label: "B", checked: false },
    ]);
  });

  it("drops a roll with neither skill nor level, and a time per round that isn't a number", () => {
    listen((context) => {
      context.entry.perRoundSeconds = "slow";
      context.entry.fastDrawRoll = { label: "Nothing to roll" };
      context.entry.requiredRolls = "Riding";
    });
    expect(shotsEntryFor(rifle(), 0)).toMatchObject({ perRoundSeconds: 0, fastDrawRoll: null, requiredRolls: [] });
  });
});
