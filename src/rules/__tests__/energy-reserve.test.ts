import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  drainsReserve,
  energyReserves,
  originKey,
  payFromReserve,
  rechargeInterval,
  rechargeReserve,
  reserveValue,
} from "../energy-reserve.js";

/** Basic Set Revised p. 326. */
describe("Energy Reserve", () => {
  it("is a reserve per origin, its levels added up", () => {
    const reserves = energyReserves([
      { name: "Energy Reserve", levels: 10, specialty: "Magical" },
      { name: "Energy Reserve (Magic)", levels: 5 },
      { name: "Energy Reserve", levels: 4, specialty: "Chi" },
      { name: "Magery", levels: 3 },
    ]);
    expect(reserves.map((r) => [r.key, r.max])).toEqual([["magical", 15], ["chi", 4]]);
  });

  it("recharges a point in ten minutes, an hour or a day", () => {
    expect(rechargeInterval([])).toBe(600);
    expect(rechargeInterval(["Slow Recharge (1 ER/hour)"])).toBe(3600);
    expect(rechargeInterval(["Slow Recharge (1 ER/day)"])).toBe(86400);
    expect(rechargeInterval(["Special Recharge (energy theft only)"])).toBeNull();
    expect(rechargeInterval(["Special Recharge (accessibility, half value)"])).toBe(600);
  });

  it("pays what it holds and leaves the rest as FP", () => {
    expect(payFromReserve(3, 10)).toEqual({ reserve: 3, rest: 0 });
    expect(payFromReserve(6, 4)).toEqual({ reserve: 4, rest: 2 });
    expect(payFromReserve(2, 0)).toEqual({ reserve: 0, rest: 2 });
    expect(reserveValue(10, 3)).toBe(7);
    expect(reserveValue(10, 30)).toBe(0);
  });

  it("is drained only by a power of its own origin", () => {
    expect(drainsReserve("Magical", "magic")).toBe(true);
    expect(drainsReserve("Chi", "magical")).toBe(false);
    expect(drainsReserve("Magical", "")).toBe(false);
    expect(drainsReserve("Magical", undefined)).toBe(false);
    expect(originKey(" Psi ")).toBe("psionic");
  });

  it("recharges a point for each whole interval, carrying the rest", () => {
    expect(rechargeReserve({ spent: 5, carry: 0 }, 600, 1500)).toEqual({ spent: 3, carry: 300, gained: 2 });
    expect(rechargeReserve({ spent: 5, carry: 300 }, 600, 300)).toEqual({ spent: 4, carry: 0, gained: 1 });
    expect(rechargeReserve({ spent: 1, carry: 0 }, 600, 6000)).toEqual({ spent: 0, carry: 0, gained: 1 });
    expect(rechargeReserve({ spent: 5, carry: 0 }, null, 99999).gained).toBe(0);
    expect(rechargeReserve({ spent: 0, carry: 200 }, 600, 900).carry).toBe(0);
  });

  it("has records at 3 points a level and the limitations of the page", () => {
    const root = join(import.meta.dirname, "../../../packs-src");
    const adv = JSON.parse(readFileSync(join(root, "advantages/basic-set-addendum-advantages.json"), "utf8")) as Array<{ name: string; system: { pointsPerLevel: number; needsSpecialty: boolean; value: number } }>;
    const er = adv.find((r) => r.name === "Energy Reserve");
    expect(er?.system.pointsPerLevel).toBe(3);
    expect(er?.system.needsSpecialty).toBe(true);
    const mods = JSON.parse(readFileSync(join(root, "modifiers/basic-set-addendum-modifiers.json"), "utf8")) as Array<{ name: string; system: { pointsPerLevel: number; needsSpecialty: boolean; value: number } }>;
    expect(mods.slice(0, 4).map((m) => m.system.value)).toEqual([-20, -60, -70, -5]);
  });
});
