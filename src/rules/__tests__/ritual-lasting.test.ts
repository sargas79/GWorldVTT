import { describe, expect, it } from "vitest";

import {
  CHARM_WORKSPACES,
  conditionalLimit,
  extensionEnergy,
  hangConditional,
  mayBeConditional,
  ritualDurationSeconds,
  sharedEffects,
  stackingSurvivor,
} from "../ritual-lasting.js";

describe("duration and extension (Monster Hunters 1 pp. 35, 37)", () => {
  it("reads the table's durations in seconds", () => {
    expect(ritualDurationSeconds({ step: 0 })).toBe(0);
    expect(ritualDurationSeconds({ step: 9 })).toBe(7 * 86400);
    expect(ritualDurationSeconds({ step: 11, extraMonths: 1 })).toBe(60 * 86400);
  });

  it("extends a week-long ward a week at a time, for 9 energy each", () => {
    const week = ritualDurationSeconds({ step: 9 });
    expect(extensionEnergy({ originalSeconds: week, addedStep: 9 })).toBe(9);
    expect(extensionEnergy({ originalSeconds: week, addedStep: 11 })).toBe(null);
    expect(extensionEnergy({ originalSeconds: week, addedStep: 7 })).toBe(7);
  });
});

describe("conditional rituals (p. 38)", () => {
  it("need a Lesser Control Magic effect", () => {
    expect(mayBeConditional([{ path: "Magic", effect: "control", greater: false }, { path: "Spirit", effect: "control", greater: false }])).toBe(true);
    expect(mayBeConditional([{ path: "Spirit", effect: "control", greater: false }])).toBe(false);
  });

  it("hang at most Thaumatology + Magery: the sage's 18", () => {
    expect(conditionalLimit({ thaumatology: 15, magery: 3 })).toBe(18);
    expect(conditionalLimit({ thaumatology: 12, magery: null })).toBe(12);
  });

  it("defuse the oldest when a 19th is cast", () => {
    const hanging = Array.from({ length: 18 }, (_, i) => i + 1);
    const result = hangConditional(hanging, 19, 18);
    expect(result.defused).toEqual([1]);
    expect(result.hanging).toHaveLength(18);
    expect(result.hanging.at(-1)).toBe(19);
    expect(hangConditional([1, 2], 3, 18)).toEqual({ hanging: [1, 2, 3], defused: [] });
  });
});

describe("stacking (p. 37)", () => {
  it("collides the same effect, but not a Greater with a Lesser", () => {
    const st = [{ path: "Body" as const, effect: "strengthen" as const, greater: false }];
    expect(sharedEffects(st, st)).toEqual(["Lesser Strengthen Body"]);
    expect(sharedEffects(st, [{ path: "Body", effect: "strengthen", greater: true }])).toEqual([]);
  });

  it("keeps the ritual that took more energy", () => {
    expect(stackingSurvivor(12, 20)).toBe("new");
    expect(stackingSurvivor(20, 12)).toBe("existing");
  });
});

describe("charms (p. 39)", () => {
  it("take -5 in the field and +2 in a fine workspace", () => {
    expect(CHARM_WORKSPACES.none).toBe(-5);
    expect(CHARM_WORKSPACES.fine).toBe(2);
  });
});
