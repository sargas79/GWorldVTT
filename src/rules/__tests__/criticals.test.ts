import { describe, expect, it } from "vitest";

import {
  CRITICAL_HEAD_BLOW,
  CRITICAL_HIT,
  CRITICAL_MISS,
  CRITICAL_MISS_UNARMED,
  MAX_DOUBLED_SHOCK,
  criticalBasicDamage,
  criticalDr,
  criticalEntry,
  criticalHitTableFor,
  criticalMissTableFor,
  criticalShock,
  type CriticalEntry,
} from "../criticals.js";

const TABLES: Array<[string, readonly CriticalEntry[]]> = [
  ["hit", CRITICAL_HIT],
  ["head blow", CRITICAL_HEAD_BLOW],
  ["miss", CRITICAL_MISS],
  ["unarmed miss", CRITICAL_MISS_UNARMED],
];

/**
 * A table with a gap in it would leave a critical with no result at all, and a
 * table with a row twice would make one of them unreachable -- both silent.
 */
describe.each(TABLES)("the %s table", (_name, table) => {
  it("covers 3 to 18 exactly once", () => {
    const covered = table.flatMap((row) => [...row.rolls]).sort((a, b) => a - b);
    expect(covered).toEqual(Array.from({ length: 16 }, (_, i) => i + 3));
  });

  it("finds a row for every roll", () => {
    for (let roll = 3; roll <= 18; roll += 1) {
      expect(table.some((row) => row.rolls.includes(roll))).toBe(true);
    }
  });
});

describe("reading a table", () => {
  it("reads the row the roll lands on", () => {
    expect(criticalEntry("hit", 3).effect).toBe("tripleDamage");
    expect(criticalEntry("hit", 10).effect).toBe("normal");
    expect(criticalEntry("hit", 18).effect).toBe("tripleDamage");
  });

  /** 12 is "as 8" and 13 is "as 7", which are two different things. */
  it("follows the armed table's back-references", () => {
    expect(criticalEntry("miss", 12).effect).toBe(criticalEntry("miss", 8).effect);
    expect(criticalEntry("miss", 13).effect).toBe(criticalEntry("miss", 7).effect);
    expect(criticalEntry("miss", 17).effect).toBe("weaponBreaks");
  });

  it("follows the unarmed table's back-references", () => {
    expect(criticalEntry("missUnarmed", 14).effect).toBe(criticalEntry("missUnarmed", 7).effect);
    expect(criticalEntry("missUnarmed", 16).effect).toBe(criticalEntry("missUnarmed", 5).effect);
    expect(criticalEntry("missUnarmed", 17).effect).toBe(criticalEntry("missUnarmed", 4).effect);
    expect(criticalEntry("missUnarmed", 18).effect).toBe("knockYourselfOut");
  });

  it("clamps a roll outside 3-18 rather than finding nothing", () => {
    expect(criticalEntry("hit", 2)).toBe(criticalEntry("hit", 3));
    expect(criticalEntry("hit", 99)).toBe(criticalEntry("hit", 18));
  });
});

describe("choosing a table", () => {
  it("sends a hit to the head to the head blow table", () => {
    for (const location of ["skull", "face", "eye"]) {
      expect(criticalHitTableFor(location)).toBe("headBlow");
    }
  });

  it("sends everything else to the ordinary table", () => {
    expect(criticalHitTableFor("torso")).toBe("hit");
    expect(criticalHitTableFor("neck")).toBe("hit");
    expect(criticalHitTableFor(undefined)).toBe("hit");
  });

  it("sends an unarmed miss to its own table", () => {
    expect(criticalMissTableFor(true)).toBe("missUnarmed");
    expect(criticalMissTableFor(false)).toBe("miss");
  });
});

describe("what a critical does to damage", () => {
  it("multiplies what was rolled", () => {
    expect(criticalBasicDamage({ rolled: 7, maximum: 18, damage: { multiplier: 3 } })).toBe(21);
  });

  it("substitutes the maximum for the roll", () => {
    expect(criticalBasicDamage({ rolled: 7, maximum: 18, damage: { maximum: true } })).toBe(18);
  });

  it("leaves an ordinary hit alone", () => {
    expect(criticalBasicDamage({ rolled: 7, maximum: 18 })).toBe(7);
    expect(criticalBasicDamage({ rolled: 7, maximum: 18, damage: {} })).toBe(7);
  });

  it("halves DR the way each table rounds it", () => {
    expect(criticalDr(5, { halfDr: "roundDown" })).toBe(2);
    expect(criticalDr(5, { halfDr: "roundUp" })).toBe(3);
    expect(criticalDr(5, { ignoreDr: true })).toBe(0);
    expect(criticalDr(5)).toBe(5);
  });

  /** Ordinary shock stops at -4; a critical's doubled shock stops at -8. */
  it("doubles shock past the usual floor", () => {
    expect(criticalShock(-4, { shockMultiplier: 2 })).toBe(MAX_DOUBLED_SHOCK);
    expect(criticalShock(-3, { shockMultiplier: 2 })).toBe(-6);
    expect(criticalShock(-4)).toBe(-4);
    expect(criticalShock(0, { shockMultiplier: 2 })).toBe(0);
  });
});
