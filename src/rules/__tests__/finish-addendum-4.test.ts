import { describe, expect, it } from "vitest";
import {
  GREAT_LUNGE_REACH,
  HEROIC_CHARGE_FALL_PENALTY,
  HEROIC_CHARGE_TO_HIT,
  combatExtraOfKey,
  extrasAdded,
  extrasHeld,
  extrasRefused,
} from "../extra-effort-extras.js";
import {
  DAY_SECONDS,
  dayWasQuiet,
  daysEnded,
  derangementPowerModifier,
  stressShedByClock,
} from "../stress.js";
import {
  allOutConcentrateApplies,
  concentrationRunAfterTurn,
  maneuverSteps,
  slamAllowsAttackBefore,
} from "../more-maneuvers.js";
import { concentrateTurnsAfterTurn } from "../zen-archery.js";

describe("the cap of one offensive and one defensive option a round (Basic Set Revised p. 571)", () => {
  it("forgets a record from another round", () => {
    const record = { round: "c:1", extras: ["giantStep" as const] };
    expect(extrasHeld(record, "c:1")).toEqual(["giantStep"]);
    expect(extrasHeld(record, "c:2")).toEqual([]);
    expect(extrasHeld(record, null)).toEqual([]);
    expect(extrasHeld(undefined, "c:1")).toEqual([]);
  });

  it("adds to the round's record and starts again in a new round", () => {
    const first = extrasAdded(undefined, "c:1", ["flurry"]);
    expect(first).toEqual({ round: "c:1", extras: ["flurry"] });
    expect(extrasAdded(first, "c:1", ["feverishDefense", "flurry"]).extras).toEqual(["flurry", "feverishDefense"]);
    expect(extrasAdded(first, "c:2", ["greatLunge"])).toEqual({ round: "c:2", extras: ["greatLunge"] });
  });

  it("refuses a second offensive option and a second defensive one, but not the one already used", () => {
    expect(extrasRefused(["flurry"], ["giantStep"])).toEqual(["giantStep"]);
    expect(extrasRefused(["flurry"], ["flurry"])).toEqual([]);
    expect(extrasRefused(["flurry"], ["feverishDefense"])).toEqual([]);
    expect(extrasRefused(["feverishDefense"], ["rapidRecovery"])).toEqual(["rapidRecovery"]);
    expect(extrasRefused([], ["heroicCharge", "greatLunge"])).toEqual(["greatLunge"]);
  });

  it("reads the option a key stands for", () => {
    expect(combatExtraOfKey("gworld.giantStep")).toBe("giantStep");
    expect(combatExtraOfKey("heroicCharge")).toBe("heroicCharge");
    expect(combatExtraOfKey("gworld.fatigueTrade")).toBeNull();
  });

  it("has the figures of the three offensive options", () => {
    expect(GREAT_LUNGE_REACH).toBe(1);
    expect(HEROIC_CHARGE_TO_HIT).toBe(4);
    expect(HEROIC_CHARGE_FALL_PENALTY).toBe(-2);
  });
});

describe("Stress and Derangement on the clock (Basic Set Revised p. 573)", () => {
  it("sheds 1 Stress per 10 minutes and carries the rest", () => {
    expect(stressShedByClock(0, 599)).toEqual({ shed: 0, carry: 599 });
    expect(stressShedByClock(599, 1)).toEqual({ shed: 1, carry: 0 });
    expect(stressShedByClock(300, 1500)).toEqual({ shed: 3, carry: 0 });
    expect(stressShedByClock(0, -5)).toEqual({ shed: 0, carry: 0 });
  });

  it("finds the days that ended, by the time each began", () => {
    expect(daysEnded(0, DAY_SECONDS - 1)).toEqual([]);
    expect(daysEnded(0, DAY_SECONDS)).toEqual([0]);
    expect(daysEnded(DAY_SECONDS - 10, DAY_SECONDS * 3 + 5)).toEqual([0, DAY_SECONDS, DAY_SECONDS * 2]);
    expect(daysEnded(0, DAY_SECONDS * 100, 3)).toEqual([DAY_SECONDS * 97, DAY_SECONDS * 98, DAY_SECONDS * 99]);
    expect(daysEnded(10, 5)).toEqual([]);
  });

  it("calls a day quiet when no hardship was inflicted in it", () => {
    expect(dayWasQuiet(0, null)).toBe(true);
    expect(dayWasQuiet(DAY_SECONDS, DAY_SECONDS + 100)).toBe(false);
    expect(dayWasQuiet(DAY_SECONDS, 100)).toBe(true);
    expect(dayWasQuiet(0, DAY_SECONDS + 1)).toBe(true);
  });

  it("penalizes a focused power, and gives a bonus to use an evil one", () => {
    expect(derangementPowerModifier(5, { evil: false, resisting: false })).toBe(-3);
    expect(derangementPowerModifier(5, { evil: false, resisting: true })).toBe(0);
    expect(derangementPowerModifier(5, { evil: true, resisting: true })).toBe(-3);
    expect(derangementPowerModifier(5, { evil: true, resisting: false })).toBe(3);
    expect(derangementPowerModifier(0, { evil: true, resisting: false })).toBe(0);
  });
});

describe("All-Out Concentrate over the whole task (Basic Set Revised p. 575)", () => {
  it("keeps a run only while every turn was All-Out", () => {
    expect(concentrationRunAfterTurn(null, "allOutConcentrate")).toBe(true);
    expect(concentrationRunAfterTurn(true, "allOutConcentrate")).toBe(true);
    expect(concentrationRunAfterTurn(true, "concentrate")).toBe(false);
    expect(concentrationRunAfterTurn(false, "allOutConcentrate")).toBe(false);
    expect(concentrationRunAfterTurn(false, "attack")).toBeNull();
  });

  it("gives the +1 only on the maneuver and an unbroken run, and always on a distraction roll", () => {
    expect(allOutConcentrateApplies({ maneuver: "allOutConcentrate", allOutSoFar: null })).toBe(true);
    expect(allOutConcentrateApplies({ maneuver: "allOutConcentrate", allOutSoFar: true })).toBe(true);
    expect(allOutConcentrateApplies({ maneuver: "allOutConcentrate", allOutSoFar: false })).toBe(false);
    expect(allOutConcentrateApplies({ maneuver: "allOutConcentrate", allOutSoFar: false, distraction: true })).toBe(true);
    expect(allOutConcentrateApplies({ maneuver: "concentrate", allOutSoFar: true })).toBe(false);
  });

  it("counts a turn of either kind of concentration for a task that alternates", () => {
    expect(concentrateTurnsAfterTurn(2, "allOutConcentrate")).toBe(3);
    expect(concentrateTurnsAfterTurn(2, "concentrate")).toBe(3);
    expect(concentrateTurnsAfterTurn(2, "attack")).toBe(0);
  });
});

describe("steps and the Double's slam (Basic Set Revised pp. 571, 575-576)", () => {
  it("counts the steps of a step maneuver", () => {
    expect(maneuverSteps({ movement: "step" })).toBe(1);
    expect(maneuverSteps({ movement: "step", secondStep: true })).toBe(2);
    expect(maneuverSteps({ movement: "step", secondStep: true, giantStep: true })).toBe(3);
    expect(maneuverSteps({ movement: "step", giantStep: true })).toBe(2);
    expect(maneuverSteps({ movement: "half", giantStep: true })).toBe(0);
    expect(maneuverSteps({ movement: "none" })).toBe(0);
  });

  it("lets only a Double make another attack before its slam", () => {
    expect(slamAllowsAttackBefore("double")).toBe(true);
    expect(slamAllowsAttackBefore("strong")).toBe(false);
    expect(slamAllowsAttackBefore("determined")).toBe(false);
  });
});
