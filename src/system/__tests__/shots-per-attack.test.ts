import { describe, expect, it, vi } from "vitest";

vi.mock("../optional-rules.js", () => ({ isRuleOn: () => true }));
vi.mock("../cinematic.js", () => ({ hasInfiniteAmmunition: (actor: any) => actor?.infinite === true }));

import { burstShots } from "../../rules/ranged.js";
import { asAttackEffect, mergeAttackEffects } from "../combat-extensions.js";
import { refundShots } from "../ammunition.js";

/** Shots per attack: a minimum burst and its step, and rounds given back (sargas79/GWorldVTT#648). */
describe("burstShots", () => {
  it("holds the shots asked for between one and the Rate of Fire", () => {
    expect(burstShots({ asked: 0, rateOfFire: 10 })).toBe(1);
    expect(burstShots({ asked: 4, rateOfFire: 10 })).toBe(4);
    expect(burstShots({ asked: 40, rateOfFire: 10 })).toBe(10);
  });

  it("raises a burst to its minimum, as a weapon that fires only on full auto", () => {
    // RoF 20 with a least burst of a quarter of it (Characters p. 270).
    expect(burstShots({ asked: 1, rateOfFire: 20, minShots: 5 })).toBe(5);
    expect(burstShots({ asked: 12, rateOfFire: 20, minShots: 5 })).toBe(12);
  });

  it("brings a count between steps down to the step below, never under the minimum", () => {
    expect(burstShots({ asked: 8, rateOfFire: 12, step: 3 })).toBe(6);
    expect(burstShots({ asked: 2, rateOfFire: 12, step: 3 })).toBe(3);
    expect(burstShots({ asked: 12, rateOfFire: 13, minShots: 3, step: 3 })).toBe(12);
    // A minimum between steps is met by the step above it.
    expect(burstShots({ asked: 1, rateOfFire: 12, minShots: 4, step: 3 })).toBe(6);
  });

  it("can't fire a burst the Rate of Fire can't reach", () => {
    expect(burstShots({ asked: 5, rateOfFire: 4, minShots: 5 })).toBeNull();
    expect(burstShots({ asked: 5, rateOfFire: 5, step: 3, minShots: 4 })).toBeNull();
  });
});

describe("an option's minimum burst and step", () => {
  it("takes the higher of two settings", () => {
    const merged = mergeAttackEffects([{ minShots: 5, shotsStep: 2 }, { minShots: 3, shotsStep: 4 }]);
    expect(merged.minShots).toBe(5);
    expect(merged.shotsStep).toBe(4);
  });

  it("holds nothing where no option set them, and drops nonsense", () => {
    expect(mergeAttackEffects([{ shots: 1 }])).toMatchObject({ minShots: 0, shotsStep: 1 });
    expect(mergeAttackEffects([{ minShots: -2, shotsStep: 0 }, { minShots: Number.NaN }])).toMatchObject({ minShots: 0, shotsStep: 1 });
  });

  it("survives being merged again, beside what an effect leaves out", () => {
    const once = mergeAttackEffects([{ minShots: 4, shotsStep: 2, rateOfFire: 8 }]);
    const again = asAttackEffect(once);
    expect(again).not.toHaveProperty("recoil");
    expect(mergeAttackEffects([again, { rateOfFire: 10 }])).toMatchObject({ minShots: 4, shotsStep: 2, rateOfFire: 10 });
  });
});

/** A rifle with a 30-round magazine, and a second mode sharing it. */
function rifle(loaded: number, actor: any = {}) {
  const item: any = {
    isOwner: true,
    actor,
    system: { rangedModes: [{ shots: "30(3)", loaded }, { shots: "30(3)", loaded }] },
    update: vi.fn(async (data: any) => { item.system.rangedModes = data["system.rangedModes"]; }),
  };
  return item;
}

describe("refundShots", () => {
  it("gives rounds back to the mode and the magazine it shares, up to its capacity", async () => {
    const item = rifle(20);
    expect(await refundShots(item, 0, 5)).toBe(25);
    expect(item.system.rangedModes.map((m: any) => m.loaded)).toEqual([25, 25]);
    expect(await refundShots(item, 1, 99)).toBe(30);
  });

  it("gives nothing back where Infinite Ammunition kept the count", async () => {
    const item = rifle(20, { infinite: true });
    expect(await refundShots(item, 0, 5)).toBe(20);
    expect(item.update).not.toHaveBeenCalled();
  });

  it("refuses a mode that keeps no count, or an item the user doesn't own", async () => {
    const item = rifle(20);
    expect(await refundShots(item, 3, 5)).toBeNull();
    expect(await refundShots({ ...item, isOwner: false }, 0, 5)).toBeNull();
  });
});
