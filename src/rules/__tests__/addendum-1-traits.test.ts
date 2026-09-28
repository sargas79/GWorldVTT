import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { impulseAfterSessionStart, impulsePayment, sessionPools } from "../bonus-points.js";
import { computeInjury } from "../damage.js";
import { heroicAimBonus, heroicArcherWeapon, heroicHalvedPenalty, quickReadyPenalty } from "../heroic-archer.js";
import { injuryToleranceFrom, noInjuryTolerance, reducedInjury } from "../injury-tolerance.js";
import { reactionSources } from "../social.js";
import { talentBonusFor, talentBonuses } from "../talents.js";
import { traitEffects } from "../trait-effects.js";

/** Basic Set Revised, Addendum 1 (pp. 325-327). */
interface Doc {
  name: string;
  system: { points: number; pointsPerLevel: number; maxLevels: number; talentSkills: string[]; reference: string };
}
const records = JSON.parse(
  readFileSync(join(import.meta.dirname, "../../../packs-src/advantages/basic-set-addendum-advantages.json"), "utf8"),
) as Doc[];
const record = (name: string): Doc => {
  const found = records.find((r) => r.name === name);
  if (!found) throw new Error(`no record ${name}`);
  return found;
};

describe("the ten Talents", () => {
  const talents: Array<[string, number]> = [
    ["Born Entertainer", 5], ["Born to be Wired", 5], ["Born War-Leader", 5], ["Circuit Sense", 5],
    ["Craftiness", 5], ["Driver's Reflexes", 5], ["Natural Athlete", 10], ["Natural Scientist", 10],
    ["Social Scientist", 10], ["Street-Smart", 5],
  ];

  it.each(talents)("%s costs %i points a level, to four levels, with skills listed", (name, cost) => {
    const doc = record(name);
    expect(doc.system.pointsPerLevel).toBe(cost);
    expect(doc.system.maxLevels).toBe(4);
    expect(doc.system.talentSkills.length).toBeGreaterThanOrEqual(4);
  });

  it("adds its levels to each of its skills, by the record's own list", () => {
    const bonuses = talentBonuses([{ name: "Natural Athlete", levels: 2, talentSkills: record("Natural Athlete").system.talentSkills }]);
    expect(talentBonusFor("Running", bonuses)).toBe(2);
    expect(talentBonusFor("Sports (Baseball)", bonuses)).toBe(2);
    expect(talentBonusFor("Stealth", bonuses)).toBe(0);
  });

  it("gives a reaction bonus from those who notice, but not Craftiness", () => {
    const of = (name: string) => reactionSources([{ name, levels: 2 }]).map((s) => s.value);
    expect(of("Street-Smart")).toEqual([2]);
    expect(of("Natural Scientist")).toEqual([2]);
    expect(of("Craftiness")).toEqual([]);
  });
});

describe("the other records", () => {
  it("prices the language advantages, Heroic Archer and the pools", () => {
    expect(record("Universal Translator").system.points).toBe(30);
    expect(record("Omnilingual").system.points).toBe(40);
    expect(record("Xeno-Omnilingual").system.points).toBe(80);
    expect(record("Heroic Archer").system.points).toBe(20);
    expect(record("Impulse Points").system.pointsPerLevel).toBe(5);
    expect(record("Jack of All Trades").system.pointsPerLevel).toBe(10);
    expect(record("Jack of All Trades").system.maxLevels).toBe(3);
    expect(record("Foresight").system.pointsPerLevel).toBe(10);
    expect(record("Foresight (Limited Type)").system.pointsPerLevel).toBe(5);
  });

  it("prices Damage Reduction 50, 75, 100, 125, 150 and 300", () => {
    const cost = (d: number) => record(`Injury Tolerance (Damage Reduction ${d})`).system.points;
    expect([2, 3, 4, 5, 10, 100].map(cost)).toEqual([50, 75, 100, 125, 150, 300]);
  });
});

describe("Injury Tolerance (Damage Reduction) (p. 325)", () => {
  it("reads the divisor from the trait's name and Cosmic, Rounds down from its modifiers", () => {
    expect(injuryToleranceFrom(["Injury Tolerance (Damage Reduction 4)"]).damageDivisor).toBe(4);
    expect(injuryToleranceFrom(["Injury Tolerance (Damage Reduction /10)"]).damageDivisor).toBe(10);
    const cosmic = injuryToleranceFrom(["Injury Tolerance (Damage Reduction 2)", "Cosmic, Rounds down"]);
    expect(cosmic.roundsDown).toBe(true);
  });

  it("divides the injury, rounding up with a least injury of 1", () => {
    const tolerance = injuryToleranceFrom(["Injury Tolerance (Damage Reduction 3)"]);
    expect(reducedInjury(10, tolerance)).toBe(4);
    expect(reducedInjury(2, tolerance)).toBe(1);
    expect(reducedInjury(0, tolerance)).toBe(0);
    expect(reducedInjury(10, noInjuryTolerance())).toBe(10);
  });

  it("rounds down, to nothing if need be, for Cosmic, Rounds down", () => {
    const tolerance = injuryToleranceFrom(["Injury Tolerance (Damage Reduction 4)", "Cosmic, Rounds down"]);
    expect(reducedInjury(10, tolerance)).toBe(2);
    expect(reducedInjury(3, tolerance)).toBe(0);
  });

  it("applies after DR and the wounding modifier", () => {
    const tolerance = injuryToleranceFrom(["Injury Tolerance (Damage Reduction 2)"]);
    const hit = computeInjury({ basicDamage: 13, dr: 3, type: "cut", tolerance } as never);
    // 10 penetrating x 1.5 = 15, halved and rounded up.
    expect(hit.injury).toBe(8);
  });
});

describe("Jack of All Trades, Foresight, Impulse Points and Heroic Archer as trait effects", () => {
  it("caps Jack of All Trades at three levels", () => {
    expect(traitEffects([{ name: "Jack of All Trades", levels: 2 }]).jackOfAllTrades).toBe(2);
    expect(traitEffects([{ name: "Jack of All Trades", levels: 5 }]).jackOfAllTrades).toBe(3);
  });

  it("counts Impulse Points and Foresight by level, whole or limited", () => {
    const effects = traitEffects([
      { name: "Impulse Points", levels: 4 },
      { name: "Foresight", levels: 1 },
      { name: "Foresight (Ambushes)", levels: 3 },
    ]);
    expect(effects.impulsePoints).toBe(4);
    expect(effects.foresight).toBe(4);
  });

  it("reads Heroic Archer", () => {
    expect(traitEffects([{ name: "Heroic Archer" }]).heroicArcher).toBe(true);
    expect(traitEffects([]).heroicArcher).toBe(false);
  });
});

describe("Impulse Points (p. 327)", () => {
  it("keep what a session has spent from the pool", () => {
    expect(sessionPools({ impulseMax: 5, impulseSpent: 2, foresightMax: 3, foresightUsed: 1 })).toEqual({
      impulseMax: 5, impulse: 3, foresightMax: 3, foresight: 2,
    });
  });

  it("pay first and never go below none, character points making up the rest", () => {
    expect(impulsePayment(3, 5, 10)).toEqual({ impulse: 3, unspent: 0, short: 0 });
    expect(impulsePayment(3, 1, 10)).toEqual({ impulse: 1, unspent: 2, short: 0 });
    expect(impulsePayment(3, 1, 1)).toEqual({ impulse: 1, unspent: 1, short: 1 });
  });

  it("regain one at the start of a session", () => {
    expect(impulseAfterSessionStart(3)).toBe(2);
    expect(impulseAfterSessionStart(0)).toBe(0);
  });
});

describe("Heroic Archer (p. 327)", () => {
  it("covers Bow, with or without a specialty, and nothing else", () => {
    expect(heroicArcherWeapon({ heroicArcher: true, skill: "Bow" })).not.toBeNull();
    expect(heroicArcherWeapon({ heroicArcher: true, skill: "Crossbow" })).toBeNull();
    expect(heroicArcherWeapon({ heroicArcher: false, skill: "Bow" })).toBeNull();
  });

  it("readies at -3, or -1 for a Weapon Master (Bow)", () => {
    expect(quickReadyPenalty(false)).toBe(-3);
    expect(quickReadyPenalty(true)).toBe(-1);
  });

  it("adds +1 for a second of Aim and +2 for two or more", () => {
    expect([0, 1, 2, 5].map(heroicAimBonus)).toEqual([0, 1, 2, 2]);
  });

  it("halves Fast-Draw and stunt penalties in the archer's favour", () => {
    expect(heroicHalvedPenalty(-4)).toBe(-2);
    expect(heroicHalvedPenalty(-1)).toBe(0);
  });
});
