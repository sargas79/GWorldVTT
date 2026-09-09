import { describe, expect, it } from "vitest";

import { formatDiceAdds, parseDiceAdds } from "../dice.js";
import {
  MAX_TABULATED_ST,
  applyDamageFloor,
  computeInjury,
  effectiveStrengthForWeapon,
  halveDamage,
  swingDamage,
  tabulatedDamage,
  thrustDamage,
  weaponDamage,
} from "../damage.js";

describe("the printed Damage Table (GURPS Lite p. 6)", () => {
  it("reproduces every row of the table for ST 1-20", () => {
    for (let st = 1; st <= MAX_TABULATED_ST; st++) {
      const printed = tabulatedDamage(st);
      expect(printed, `ST ${st} should be tabulated`).not.toBeNull();
      expect(formatDiceAdds(thrustDamage(st)), `thrust at ST ${st}`).toBe(printed!.thrust);
      expect(formatDiceAdds(swingDamage(st)), `swing at ST ${st}`).toBe(printed!.swing);
    }
  });

  it("gives the average human ST 10 thrust 1d-2 and swing 1d", () => {
    expect(formatDiceAdds(thrustDamage(10))).toBe("1d-2");
    expect(formatDiceAdds(swingDamage(10))).toBe("1d");
  });

  it("matches the ST 13 example printed on the character sheet as 1d/2d-1", () => {
    expect(formatDiceAdds(thrustDamage(13))).toBe("1d");
    expect(formatDiceAdds(swingDamage(13))).toBe("2d-1");
  });

  it("clamps ST below 1 to the bottom row rather than going negative", () => {
    expect(formatDiceAdds(thrustDamage(0))).toBe("1d-6");
    expect(formatDiceAdds(thrustDamage(-5))).toBe("1d-6");
  });

  it("extrapolates above the table without skipping a step", () => {
    // ST 21-23 continue the printed progression.
    expect(formatDiceAdds(thrustDamage(21))).toBe("2d");
    expect(formatDiceAdds(swingDamage(21))).toBe("4d-1");
    expect(formatDiceAdds(swingDamage(22))).toBe("4d");
    expect(formatDiceAdds(swingDamage(23))).toBe("4d+1");
  });
});

describe("weapon damage", () => {
  it("gives a ST 11 spear (thr+2) 1d+1, as worked through on p. 19", () => {
    expect(formatDiceAdds(weaponDamage(11, "thr", 2))).toBe("1d+1");
  });

  it("caps effective ST at triple the weapon's minimum ST", () => {
    // A large knife has minimum ST 6, so its maximum ST is 18 (p. 20).
    expect(effectiveStrengthForWeapon(19, 6)).toBe(18);
    expect(effectiveStrengthForWeapon(25, 6)).toBe(18);
    expect(formatDiceAdds(weaponDamage(25, "thr", 0, 6))).toBe(
      formatDiceAdds(thrustDamage(18)),
    );
  });

  it("leaves ST alone for natural weapons with no minimum ST", () => {
    expect(effectiveStrengthForWeapon(19, null)).toBe(19);
  });
});

describe("dice+adds parsing", () => {
  it.each([
    ["2d", { dice: 2, adds: 0 }],
    ["1d-2", { dice: 1, adds: -2 }],
    ["3d+1", { dice: 3, adds: 1 }],
    ["d", { dice: 1, adds: 0 }],
    ["4", { dice: 0, adds: 4 }],
  ])("parses %s", (input, expected) => {
    expect(parseDiceAdds(input)).toEqual(expected);
  });

  it("returns null for unparseable input instead of throwing", () => {
    expect(parseDiceAdds("")).toBeNull();
    expect(parseDiceAdds("swing")).toBeNull();
    expect(parseDiceAdds("2d+")).toBeNull();
  });

  it("round-trips through formatting", () => {
    for (const formula of ["1d-6", "1d", "2d+2", "5d-1"]) {
      expect(formatDiceAdds(parseDiceAdds(formula)!)).toBe(formula);
    }
  });
});

describe("damage floors", () => {
  it("lets crushing damage fall to 0 but nothing else below 1", () => {
    expect(applyDamageFloor(-2, "cr")).toBe(0);
    expect(applyDamageFloor(-2, "cut")).toBe(1);
    expect(applyDamageFloor(0, "imp")).toBe(1);
  });

  it("halves damage beyond 1/2D range, rounding down", () => {
    expect(halveDamage(7, "cr")).toBe(3);
    expect(halveDamage(1, "cr")).toBe(0);
    expect(halveDamage(1, "cut")).toBe(1);
  });
});

describe("the penetration and wounding pipeline (GURPS Lite p. 29)", () => {
  it("matches the worked mail example: 6 damage vs DR 4 leaves 2 penetrating", () => {
    const result = computeInjury({ basicDamage: 6, dr: 4, type: "cr" });
    expect(result.penetrating).toBe(2);
    expect(result.injury).toBe(2);
  });

  it("stops an attack that fails to exceed DR", () => {
    const result = computeInjury({ basicDamage: 4, dr: 4, type: "cut" });
    expect(result.penetrating).toBe(0);
    expect(result.injury).toBe(0);
  });

  it.each([
    ["cr", 1, 4],
    ["burn", 1, 4],
    ["pi", 1, 4],
    ["cut", 1.5, 6],
    ["pi+", 1.5, 6],
    ["imp", 2, 8],
    ["pi-", 0.5, 2],
  ] as const)("applies the %s wounding modifier of x%s", (type, modifier, expected) => {
    const result = computeInjury({ basicDamage: 8, dr: 4, type });
    expect(result.penetrating).toBe(4);
    expect(result.woundingModifier).toBe(modifier);
    expect(result.injury).toBe(expected);
  });

  it("rounds injury down but never below 1 once DR is penetrated", () => {
    // 1 penetrating point of small piercing is 0.5, which floors to 1, not 0.
    expect(computeInjury({ basicDamage: 5, dr: 4, type: "pi-" }).injury).toBe(1);
    // 3 penetrating points of cutting is 4.5, which rounds down to 4.
    expect(computeInjury({ basicDamage: 7, dr: 4, type: "cut" }).injury).toBe(4);
  });

  it("divides DR by an armor divisor before subtracting", () => {
    const result = computeInjury({ basicDamage: 10, dr: 12, type: "pi", armorDivisor: 2 });
    expect(result.effectiveDr).toBe(6);
    expect(result.penetrating).toBe(4);
  });

  it("treats a zero or missing armor divisor as 1", () => {
    expect(computeInjury({ basicDamage: 10, dr: 4, type: "cr", armorDivisor: 0 }).effectiveDr).toBe(
      4,
    );
  });
});
