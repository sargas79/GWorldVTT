import { describe, expect, it } from "vitest";

import {
  backfireEnergy,
  finalOutcome,
  gatheringOutcome,
  gatheringSeconds,
  gatheringStreakPenalty,
  hurriedGatheringPenalty,
  nonAdeptPenalties,
  ritualResistance,
  sacrifice,
  sitePotencyBonus,
  tapping,
  type CastingConditions,
} from "../ritual-casting.js";

const succeed = (margin: number, critical = false) => ({ success: true, margin, criticalSuccess: critical, criticalFailure: false });
const fail = (margin: number, critical = false) => ({ success: false, margin, criticalSuccess: false, criticalFailure: critical });

const adept: CastingConditions = { adept: true, magery: 5, connected: true, consecration: "none", adeptTimes: false };
const sage: CastingConditions = { adept: false, magery: 0, connected: true, consecration: "consecrated", adeptTimes: false };

describe("Home Security, played through (Monster Hunters 1 p. 37)", () => {
  it("reaches 25 energy in sixteen seconds with one quirk", () => {
    // Path of Undead-15, adept: 6, then 4, then a failure, then 14 from the reserve.
    const rolls = [succeed(6), succeed(4), fail(1)];
    let energy = 0;
    let seconds = 0;
    let quirks = 0;
    rolls.forEach((roll, index) => {
      expect(gatheringStreakPenalty(index + 1)).toBe(index === 2 ? -1 : 0);
      const outcome = gatheringOutcome(roll);
      energy += outcome.energy;
      quirks += outcome.quirk ? 1 : 0;
      seconds += gatheringSeconds(adept);
    });
    expect(energy).toBe(11);
    const tap = tapping(adept);
    expect(tap.roll).toBe(false);
    energy += 14;
    seconds += tap.seconds;
    expect({ energy, seconds, quirks }).toEqual({ energy: 25, seconds: 16, quirks: 1 });
    expect(finalOutcome(succeed(2)).kind).toBe("success");
  });
});

describe("gathering ambient energy (p. 35)", () => {
  it("takes a cumulative -1 at every third attempt", () => {
    expect([1, 2, 3, 4, 5, 6, 9].map(gatheringStreakPenalty)).toEqual([0, 0, -1, -1, -1, -2, -3]);
  });

  it("takes -1 per second saved, down to one second", () => {
    expect([5, 4, 1, 0].map(hurriedGatheringPenalty)).toEqual([0, -1, -4, -4]);
    expect(gatheringSeconds(adept, { hurriedTo: 2 })).toBe(2);
  });

  it("yields the margin, at least 1; a failure 1 and a quirk; a critical failure a backfire", () => {
    expect(gatheringOutcome(succeed(0))).toMatchObject({ energy: 1, quirk: false });
    expect(gatheringOutcome(fail(3))).toMatchObject({ energy: 1, quirk: true });
    expect(gatheringOutcome(fail(8, true))).toMatchObject({ energy: 0, backfire: true });
    expect(gatheringOutcome(succeed(9, true))).toMatchObject({ energy: 9, quick: true });
  });

  it("makes the next attempt one second after a critical success, even for a non-adept", () => {
    expect(gatheringSeconds(sage, { quick: true })).toBe(1);
    expect(gatheringSeconds(sage)).toBe(300);
  });

  it("turns double the energy on a caster who fails horribly, or 20 below 10", () => {
    expect(backfireEnergy(4)).toBe(20);
    expect(backfireEnergy(12)).toBe(24);
  });

  it("gives +1 to +5 for a place of long use (p. 36)", () => {
    expect([0, 20, 49, 50, 100, 500, 1000, 5000].map(sitePotencyBonus)).toEqual([0, 1, 1, 2, 3, 4, 5, 5]);
  });
});

describe("tapping energy sources (p. 36)", () => {
  it("turns 6 FP and 2 HP into 3 energy", () => {
    expect(sacrifice({ hp: 2, fp: 6 })).toEqual({ energy: 3, hp: 2, fp: 6 });
  });

  it("spends nothing that does not make a whole point", () => {
    expect(sacrifice({ hp: 3, fp: 5 })).toEqual({ energy: 2, hp: 2, fp: 3 });
  });

  it("takes a minute for a non-adept, or a second and a roll at an adept's speed", () => {
    expect(tapping(sage)).toEqual({ seconds: 60, roll: false });
    expect(tapping({ ...sage, adeptTimes: true })).toEqual({ seconds: 1, roll: true });
  });
});

describe("non-adepts (p. 36)", () => {
  it("stack every penalty: -20 for a mage-less stranger in the field at speed", () => {
    const penalties = nonAdeptPenalties({ adept: false, magery: null, connected: false, consecration: "none", adeptTimes: true });
    expect(penalties.reduce((sum, p) => sum + p.value, 0)).toBe(-20);
  });

  it("take only -1 in a hasty circle, and nothing for Magery 0", () => {
    expect(nonAdeptPenalties({ ...sage, consecration: "hasty" })).toEqual([{ key: "hasty", value: -1 }]);
  });

  it("do not apply to an adept", () => {
    expect(nonAdeptPenalties({ ...adept, magery: null, connected: false })).toEqual([]);
  });
});

describe("the final roll (pp. 36-37)", () => {
  it("delays a failure by its margin", () => {
    expect(finalOutcome(fail(3))).toMatchObject({ kind: "retry", retrySeconds: 3 });
  });

  it("backfires on a critical failure, and refills the reserve on a critical success", () => {
    expect(finalOutcome(fail(2, true)).kind).toBe("backfire");
    expect(finalOutcome(succeed(8, true)).refillReserve).toBe(true);
  });

  it("lies about information when the GM fails by 5 or critically", () => {
    // Sabrina's divination "fails by 5! He lies" (p. 37).
    expect(finalOutcome(fail(5), { information: true })).toMatchObject({ kind: "lie", lie: true });
    expect(finalOutcome(fail(2, true), { information: true }).kind).toBe("lie");
    expect(finalOutcome(fail(4), { information: true }).kind).toBe("retry");
  });

  it("is resisted with the better of HT or Will, plus Magic Resistance", () => {
    expect(ritualResistance({ ht: 12, will: 10, magicResistance: 3 })).toBe(15);
  });
});
