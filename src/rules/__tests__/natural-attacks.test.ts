import { describe, expect, it } from "vitest";

import { KICK_PENALTY, naturalAttacks } from "../natural-attacks.js";

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
