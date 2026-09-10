import { describe, expect, it } from "vitest";

import {
  FRAGMENTATION_SKILL,
  blastAt,
  blastRadius,
  collateralDamage,
  fragmentationRadius,
} from "../explosions.js";

describe("blastRadius", () => {
  /** The book's own example: 6dx2 is twelve dice, so 24 yards. */
  it("reaches twice its dice of damage, counting a multiplier", () => {
    expect(blastRadius(12)).toBe(24);
    expect(blastRadius(6)).toBe(12);
  });

  it("reaches nowhere with no dice", () => {
    expect(blastRadius(0)).toBe(0);
  });
});

describe("fragmentationRadius", () => {
  /** "that [2d] attack would throw fragments out to 5 x 2 = 10 yards". */
  it("throws fragments five times its dice", () => {
    expect(fragmentationRadius(2)).toBe(10);
    expect(fragmentationRadius(3)).toBe(15);
  });
});

describe("collateralDamage", () => {
  it("divides by three times the distance, rounding down", () => {
    expect(collateralDamage(20, 1)).toBe(6);
    expect(collateralDamage(20, 2)).toBe(3);
    expect(collateralDamage(20, 3)).toBe(2);
  });

  it("gives the whole figure to someone struck directly", () => {
    expect(collateralDamage(20, 0)).toBe(20);
  });

  it("falls to nothing rather than a fraction", () => {
    expect(collateralDamage(5, 4)).toBe(0);
  });
});

describe("blastAt", () => {
  const grenade = { rolledDamage: 24, diceOfDamage: 6, armorDivisor: 1 };

  it("gives the target struck the listed damage as is", () => {
    const hit = blastAt({ ...grenade, distanceYards: 0 });
    expect(hit).toMatchObject({ damage: 24, direct: true, outOfRange: false });
  });

  it("divides for everyone else", () => {
    expect(blastAt({ ...grenade, distanceYards: 2 }).damage).toBe(4);
    expect(blastAt({ ...grenade, distanceYards: 4 }).damage).toBe(2);
  });

  it("does nothing past the blast radius", () => {
    // 6 dice reaches 12 yards.
    const far = blastAt({ ...grenade, distanceYards: 13 });
    expect(far.damage).toBe(0);
    expect(far.outOfRange).toBe(true);
  });

  /**
   * "If an explosive attack has an armor divisor, it does not apply to the
   * collateral damage." A shaped charge at (10) strips the DR of what it hits
   * and nobody else's -- crediting bystanders' armour at a tenth would kill
   * people standing behind cover.
   */
  it("keeps the armour divisor for a direct hit and drops it for the blast", () => {
    const shaped = { rolledDamage: 30, diceOfDamage: 6, armorDivisor: 10 };
    expect(blastAt({ ...shaped, distanceYards: 0 }).armorDivisor).toBe(10);
    expect(blastAt({ ...shaped, distanceYards: 3 }).armorDivisor).toBe(1);
  });

  it("defaults to no divisor when the attack has none", () => {
    expect(blastAt({ rolledDamage: 10, diceOfDamage: 3, distanceYards: 0 }).armorDivisor).toBe(1);
  });
});

describe("fragmentation", () => {
  it("attacks a bystander at the skill the book prints", () => {
    expect(FRAGMENTATION_SKILL).toBe(15);
  });
});
