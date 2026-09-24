import { describe, expect, it } from "vitest";

import { KICK_PENALTY, naturalAttacks, weaponUnarmedBonus } from "../natural-attacks.js";

describe("natural attacks", () => {
  /** ST 10 thrusts for 1d-2, so a punch is 1d-3 and a kick 1d-2. */
  it("prices a punch at thrust-1 and a kick at thrust", () => {
    const [punch, kick] = naturalAttacks({ st: 10, dx: 10, skills: {} });
    expect(punch?.damage).toEqual({ dice: 1, adds: -3 });
    expect(kick?.damage).toEqual({ dice: 1, adds: -2 });
  });

  it("falls back to DX, with the kick at its penalty", () => {
    const [punch, kick] = naturalAttacks({ st: 10, dx: 12, skills: {} });
    expect(punch).toMatchObject({ skillName: "DX", skillLevel: 12 });
    expect(kick).toMatchObject({ skillName: "DX", skillLevel: 12 + KICK_PENALTY });
    expect(KICK_PENALTY).toBe(-2);
  });

  it("uses the best unarmed skill the character has", () => {
    const [punch, kick] = naturalAttacks({
      st: 11,
      dx: 12,
      skills: { Brawling: 13, Karate: 15 },
    });
    expect(punch).toMatchObject({ skillName: "Karate", skillLevel: 15 });
    expect(kick).toMatchObject({ skillName: "Karate", skillLevel: 13 });
  });

  /** Boxing is fists only: it improves the punch and does nothing for the kick. */
  it("does not kick with Boxing", () => {
    const [punch, kick] = naturalAttacks({ st: 10, dx: 11, skills: { Boxing: 14 } });
    expect(punch).toMatchObject({ skillName: "Boxing", skillLevel: 14 });
    expect(kick).toMatchObject({ skillName: "DX", skillLevel: 9 });
  });

  it("ignores a skill known below DX", () => {
    const [punch] = naturalAttacks({ st: 10, dx: 14, skills: { Brawling: 12 } });
    expect(punch).toMatchObject({ skillName: "DX", skillLevel: 14 });
  });

  it("lets a punch parry and a kick not", () => {
    const [punch, kick] = naturalAttacks({ st: 10, dx: 10, skills: {} });
    expect(punch?.canParry).toBe(true);
    expect(kick?.canParry).toBe(false);
    expect(punch?.reach).toBe("C");
    expect(kick?.reach).toBe("C, 1");
  });
});

/**
 * A weapon's blow that the unarmed skills hit harder with (sargas79/GWorldVTT#196):
 * "Brawling ... increases all unarmed damage; ... Karate ... improve[s] damage
 * with punches and kicks" (Characters p. 271, note 3).
 */
describe("weaponUnarmedBonus", () => {
  it("adds Karate's +2 per die at DX+1 on the dice of thrust", () => {
    // ST 19 thrusts 2d-1: two dice, +4.
    expect(weaponUnarmedBonus({ skill: "Karate", level: 13, dx: 12, st: 19 })).toBe(4);
    // At DX itself, +1 per die.
    expect(weaponUnarmedBonus({ skill: "Karate", level: 12, dx: 12, st: 19 })).toBe(2);
  });

  it("adds nothing for a blow struck with a weapon skill", () => {
    expect(weaponUnarmedBonus({ skill: "Broadsword", level: 16, dx: 12, st: 19 })).toBe(0);
  });

  it("adds Brawling's +1 per die only at DX+2, and nothing for a skill not known", () => {
    expect(weaponUnarmedBonus({ skill: "Brawling", level: 14, dx: 12, st: 10 })).toBe(1);
    expect(weaponUnarmedBonus({ skill: "Brawling", level: 13, dx: 12, st: 10 })).toBe(0);
    expect(weaponUnarmedBonus({ skill: "Brawling", level: null, dx: 12, st: 10 })).toBe(0);
  });
});

describe("a kick in boots (Characters p. 271)", () => {
  it("does thr+1, and leaves the punch alone", () => {
    const bare = naturalAttacks({ st: 10, dx: 10, skills: {} });
    const shod = naturalAttacks({ st: 10, dx: 10, skills: {}, boots: true });
    expect(bare.find((a) => a.key === "kick")?.damage).toEqual({ dice: 1, adds: -2 });
    expect(shod.find((a) => a.key === "kick")?.damage).toEqual({ dice: 1, adds: -1 });
    expect(shod.find((a) => a.key === "punch")?.damage).toEqual(bare.find((a) => a.key === "punch")?.damage);
  });

  it("adds the boots after Karate's bonus", () => {
    // ST 10 thrust 1d-2, Karate at DX+1 gives +2 per die, and the boots +1.
    const kick = naturalAttacks({ st: 10, dx: 10, skills: { Karate: 11 }, boots: true }).find((a) => a.key === "kick");
    expect(kick?.damage).toEqual({ dice: 1, adds: 1 });
  });
});
