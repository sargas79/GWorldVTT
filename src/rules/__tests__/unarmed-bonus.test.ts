import { describe, expect, it } from "vitest";

import { naturalAttacks, unarmedDamageBonusPerDie } from "../natural-attacks.js";

/**
 * Bonus damage for skill at unarmed combat (GURPS Basic Set: Characters
 * pp. 182, 203): Brawling +1 per die at DX+2; Boxing +1 per die at DX+1 and
 * +2 at DX+2; Karate +1 per die at DX and +2 at DX+1.
 */
describe("unarmedDamageBonusPerDie", () => {
  it("rewards Brawling only from DX+2", () => {
    expect(unarmedDamageBonusPerDie("Brawling", 13, 12)).toBe(0);
    expect(unarmedDamageBonusPerDie("Brawling", 14, 12)).toBe(1);
    expect(unarmedDamageBonusPerDie("Brawling", 18, 12)).toBe(1);
  });

  it("rewards Boxing from DX+1", () => {
    expect(unarmedDamageBonusPerDie("Boxing", 12, 12)).toBe(0);
    expect(unarmedDamageBonusPerDie("Boxing", 13, 12)).toBe(1);
    expect(unarmedDamageBonusPerDie("Boxing", 14, 12)).toBe(2);
  });

  it("rewards Karate from DX itself", () => {
    expect(unarmedDamageBonusPerDie("Karate", 11, 12)).toBe(0);
    expect(unarmedDamageBonusPerDie("Karate", 12, 12)).toBe(1);
    expect(unarmedDamageBonusPerDie("Karate", 13, 12)).toBe(2);
  });

  it("gives nothing for DX alone", () => {
    expect(unarmedDamageBonusPerDie("DX", 14, 12)).toBe(0);
  });
});

describe("natural attacks with the bonus", () => {
  /** ST 13 thrusts 1d: a punch at Karate DX+1 is 1d-1+2, a kick 1d+2. */
  it("adds the bonus per die of thrust to both punch and kick", () => {
    const [punch, kick] = naturalAttacks({ st: 13, dx: 12, skills: { Karate: 13 } });
    expect(punch?.damage).toEqual({ dice: 1, adds: 1 });
    expect(kick?.damage).toEqual({ dice: 1, adds: 2 });
  });

  it("scales with the dice: ST 17 thrusts 1d+2, ST 19 thrusts 2d-1", () => {
    const [strong] = naturalAttacks({ st: 17, dx: 12, skills: { Boxing: 14 } });
    expect(strong?.damage).toEqual({ dice: 1, adds: 2 - 1 + 2 });
    const [stronger] = naturalAttacks({ st: 19, dx: 12, skills: { Boxing: 14 } });
    expect(stronger?.damage).toEqual({ dice: 2, adds: -1 - 1 + 4 });
  });

  it("gives an untrained fighter no bonus", () => {
    const [punch] = naturalAttacks({ st: 13, dx: 12, skills: {} });
    expect(punch?.damage).toEqual({ dice: 1, adds: -1 });
  });
});
