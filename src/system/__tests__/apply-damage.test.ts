import { describe, expect, it } from "vitest";

import { SPLIT_AGAINST } from "../../rules/armor.js";
import { locationDrAgainst } from "../../rules/hit-locations.js";
import { resolveDamageAgainst, wornArmor } from "../damage.js";

/**
 * A stand-in for a Foundry actor. `resolveDamageAgainst` reads a name, an HP
 * and FP pool, and the equipped armour, and writes nothing -- so the whole
 * penetration path can be checked without a Foundry document.
 */
function actor(options: {
  hp?: number;
  maxHp?: number;
  fp?: number;
  maxFp?: number;
  armor?: Array<{
    dr: number;
    drSplit?: number | null;
    drSplitAppliesTo?: readonly string[];
    locations?: string[];
    equipped?: boolean;
  }>;
}) {
  const { hp = 10, maxHp = 10, fp = 10, maxFp = 10, armor = [] } = options;
  return {
    name: "Target",
    system: { hp: { value: hp, max: maxHp }, fp: { value: fp, max: maxFp } },
    items: armor.map((piece) => ({
      type: "armor",
      system: {
        dr: piece.dr,
        drSplit: piece.drSplit ?? null,
        drSplitAppliesTo: piece.drSplitAppliesTo ?? [],
        locations: piece.locations ?? [],
        equipped: piece.equipped ?? true,
      },
    })),
  };
}

const blow = (basicDamage: number, type: string, hitLocation = "torso", armorDivisor = 1) =>
  ({ basicDamage, type, hitLocation, armorDivisor }) as never;

describe("wornArmor", () => {
  it("counts only equipped pieces", () => {
    const target = actor({
      armor: [
        { dr: 4, locations: ["torso"] },
        { dr: 9, locations: ["torso"], equipped: false },
      ],
    });
    expect(wornArmor(target)).toHaveLength(1);
    expect(wornArmor(target)[0]!.dr).toBe(4);
  });

  it("finds nothing on an actor with no items", () => {
    expect(wornArmor({ name: "Bare" })).toEqual([]);
  });
});

describe("resolveDamageAgainst", () => {
  it("subtracts DR and applies the wounding modifier", () => {
    // 8 cutting into DR 2: 6 penetrates, x1.5 for cutting, 9 injury.
    const result = resolveDamageAgainst(
      actor({ armor: [{ dr: 2, locations: ["torso", "vitals"] }] }),
      blow(8, "cut"),
    );
    expect(result.penetrating).toBe(6);
    expect(result.woundingModifier).toBe(1.5);
    expect(result.injury).toBe(9);
    expect(result.current).toBe(10 - 9);
  });

  it("stops a blow that does not get through", () => {
    const result = resolveDamageAgainst(
      actor({ armor: [{ dr: 9, locations: ["torso", "vitals"] }] }),
      blow(5, "cut"),
    );
    expect(result.penetrating).toBe(0);
    expect(result.injury).toBe(0);
    expect(result.current).toBe(10);
  });

  /**
   * The reason DR is resolved against the damage type rather than read off the
   * sheet: mail turns a blade at DR 4 and a mace at DR 2, and the sheet leads
   * with 4 for both.
   */
  it("uses the split DR that applies to the damage being dealt", () => {
    const mailed = () =>
      actor({
        maxHp: 20,
        hp: 20,
        armor: [
          {
            dr: 4,
            drSplit: 2,
            drSplitAppliesTo: SPLIT_AGAINST.lowTech,
            locations: ["torso", "vitals"],
          },
        ],
      });

    expect(resolveDamageAgainst(mailed(), blow(8, "cut")).penetrating).toBe(4);
    expect(resolveDamageAgainst(mailed(), blow(8, "cr")).penetrating).toBe(6);
  });

  it("adds the location's own DR without double-counting worn armour", () => {
    const own = locationDrAgainst("skull", "cr");
    const helmed = actor({ armor: [{ dr: 4, locations: ["skull"] }] });
    const result = resolveDamageAgainst(helmed, blow(10, "cr", "skull"));
    expect(result.wornDr).toBe(4);
    expect(result.effectiveDr).toBe(4 + own);
  });

  it("takes fatigue off FP rather than HP", () => {
    const result = resolveDamageAgainst(actor({ hp: 10, fp: 8 }), blow(3, "fat"));
    expect(result.costsFatigue).toBe(true);
    expect(result.previous).toBe(8);
    expect(result.current).toBe(5);
  });

  it("divides DR by an armour divisor, and multiplies it by one below 1", () => {
    const armoured = () => actor({ armor: [{ dr: 8, locations: ["torso", "vitals"] }] });
    expect(resolveDamageAgainst(armoured(), blow(10, "imp", "torso", 2)).effectiveDr).toBe(4);
    // A wooden stake at (0.5) faces double DR.
    expect(resolveDamageAgainst(armoured(), blow(10, "imp", "torso", 0.5)).effectiveDr).toBe(16);
  });

  it("reports the consequences a GM has to act on", () => {
    // 12 impaling to the vitals of an unarmoured 10 HP character.
    const result = resolveDamageAgainst(actor({ hp: 10, maxHp: 10 }), blow(12, "imp", "vitals"));
    expect(result.injury).toBeGreaterThan(10);
    expect(result.consequences.majorWound).toBe(true);
    expect(result.consequences.consciousnessRollRequired).toBe(true);
    // Shock is a penalty, so it counts down from zero and stops at -4.
    expect(result.consequences.shock).toBe(-4);
  });

  it("caps injury to a limb at the point the limb is crippled", () => {
    const result = resolveDamageAgainst(actor({ hp: 10, maxHp: 10 }), blow(20, "cut", "arm"));
    expect(result.crippled).toBe(true);
    expect(result.excessLost).toBeGreaterThan(0);
    expect(result.injury).toBeLessThan(20);
  });

  it("survives an actor with no pools at all rather than writing NaN", () => {
    const result = resolveDamageAgainst({ name: "Empty" }, blow(5, "cr"));
    expect(Number.isFinite(result.current)).toBe(true);
    expect(result.previous).toBe(0);
  });
});
