import { describe, expect, it } from "vitest";

import { criticalEntry, type CriticalTable } from "../../rules/criticals.js";
import { resolveDamageAgainst, type IncomingDamage } from "../damage.js";

/**
 * A stand-in for a Foundry actor, as in `apply-damage.test.ts`: `resolveDamage-
 * Against` reads pools, ST and worn armour, and writes nothing.
 */
function actor(options: { hp?: number; maxHp?: number; st?: number; dr?: number } = {}) {
  const { hp = 10, maxHp = 10, st = 10, dr = 0 } = options;
  return {
    name: "Target",
    system: {
      hp: { value: hp, max: maxHp },
      fp: { value: 10, max: 10 },
      attributes: { ST: st },
    },
    items:
      dr > 0
        ? [{ type: "armor", system: { dr, locations: ["torso", "skull"], equipped: true } }]
        : [],
  };
}

/** A blow that landed as a critical, read off the given table at the given roll. */
function critical(
  table: CriticalTable,
  roll: number,
  blow: Partial<IncomingDamage> = {},
): IncomingDamage {
  return {
    basicDamage: 7,
    type: "cr",
    armorDivisor: 1,
    hitLocation: "torso",
    maxDamage: 12,
    critical: { table, roll, entry: criticalEntry(table, roll) },
    ...blow,
  } as IncomingDamage;
}

describe("a critical hit applied to a target", () => {
  it("triples basic damage on a 3", () => {
    const result = resolveDamageAgainst(actor(), critical("hit", 3));
    expect(result.basicDamage).toBe(21);
    expect(result.injury).toBe(21);
  });

  it("doubles basic damage on a 5", () => {
    expect(resolveDamageAgainst(actor(), critical("hit", 5)).basicDamage).toBe(14);
  });

  it("substitutes the most the dice could have rolled on a 6", () => {
    const result = resolveDamageAgainst(actor(), critical("hit", 6));
    expect(result.basicDamage).toBe(12);
  });

  /** The multiplier is on basic damage, so the wounding modifier comes after. */
  it("multiplies before the wounding modifier, not after", () => {
    const result = resolveDamageAgainst(
      actor(),
      critical("hit", 5, { type: "cut", basicDamage: 5, maxDamage: 12 }),
    );
    expect(result.basicDamage).toBe(10);
    expect(result.injury).toBe(15);
  });

  it("halves DR rounding down on a 4", () => {
    // DR 5 becomes 2, so 7 damage puts 5 through instead of 2.
    const result = resolveDamageAgainst(actor({ dr: 5 }), critical("hit", 4));
    expect(result.effectiveDr).toBe(2);
    expect(result.penetrating).toBe(5);
  });

  it("makes a major wound of anything that gets through on a 7", () => {
    // One point through a 10 HP character is nowhere near half their HP.
    const result = resolveDamageAgainst(actor({ dr: 6, maxHp: 10 }), critical("hit", 7));
    expect(result.injury).toBe(1);
    expect(result.consequences.majorWound).toBe(true);
  });

  it("makes no major wound of a blow the armour stopped", () => {
    const result = resolveDamageAgainst(actor({ dr: 20 }), critical("hit", 7));
    expect(result.penetrating).toBe(0);
    expect(result.consequences.majorWound).toBe(false);
  });

  it("doubles shock past its usual floor on an 8", () => {
    const result = resolveDamageAgainst(actor({ maxHp: 20 }), critical("hit", 8));
    // 7 injury is -4 shock ordinarily, and -8 doubled.
    expect(result.injury).toBe(7);
    expect(result.consequences.shock).toBe(-8);
  });

  it("changes nothing on a 9 through 11", () => {
    const result = resolveDamageAgainst(actor({ dr: 2 }), critical("hit", 10));
    expect(result.basicDamage).toBe(7);
    expect(result.effectiveDr).toBe(2);
  });

  /** The head blow table rounds halved DR the other way, in the target's favour. */
  it("rounds halved DR up on the head blow table", () => {
    const blow = critical("headBlow", 17, { hitLocation: "skull" });
    const result = resolveDamageAgainst(actor({ dr: 5 }), blow);
    // DR 5 worn plus the skull's own 2, halved rounding up.
    expect(result.effectiveDr).toBe(4);
  });

  it("ignores DR entirely on a head blow of 3", () => {
    const blow = critical("headBlow", 3, { hitLocation: "skull" });
    const result = resolveDamageAgainst(actor({ dr: 8 }), blow);
    expect(result.effectiveDr).toBe(0);
    expect(result.basicDamage).toBe(12);
  });

  it("leaves an ordinary blow alone", () => {
    const plain = {
      basicDamage: 7,
      type: "cr",
      armorDivisor: 1,
      hitLocation: "torso",
    } as IncomingDamage;
    const result = resolveDamageAgainst(actor({ dr: 5 }), plain);
    expect(result.basicDamage).toBe(7);
    expect(result.effectiveDr).toBe(5);
    expect(result.critical).toBeNull();
  });
});

describe("knockback from an applied blow", () => {
  const blow = (basicDamage: number, type: string) =>
    ({ basicDamage, type, armorDivisor: 1, hitLocation: "torso" }) as IncomingDamage;

  it("shoves the target one yard per multiple of their ST-2", () => {
    const result = resolveDamageAgainst(actor({ st: 10 }), blow(16, "cr"));
    expect(result.knockback.yards).toBe(2);
    expect(result.knockback.fallRollPenalty).toBe(-1);
  });

  /** A crushing blow shoves even when the armour stopped every point of it. */
  it("shoves even where nothing got through", () => {
    const result = resolveDamageAgainst(actor({ st: 10, dr: 20 }), blow(16, "cr"));
    expect(result.injury).toBe(0);
    expect(result.knockback.yards).toBe(2);
  });

  /** A cut that gets through wounds instead of shoving. */
  it("does not shove with a cut that penetrates", () => {
    expect(resolveDamageAgainst(actor({ st: 10 }), blow(16, "cut")).knockback.yards).toBe(0);
    expect(resolveDamageAgainst(actor({ st: 10, dr: 20 }), blow(16, "cut")).knockback.yards).toBe(2);
  });

  it("shoves nobody with an impaling blow", () => {
    expect(resolveDamageAgainst(actor({ st: 10 }), blow(30, "imp")).knockback.yards).toBe(0);
  });

  /** A critical that doubles the blow doubles what it shoves, too. */
  it("is worked out from damage after the critical multiplies it", () => {
    const result = resolveDamageAgainst(actor({ st: 10 }), critical("hit", 5, { basicDamage: 8 }));
    expect(result.basicDamage).toBe(16);
    expect(result.knockback.yards).toBe(2);
  });

  it("reads an actor with no ST off their HP rather than shoving them nowhere", () => {
    const noSt = { name: "Crate", system: { hp: { value: 20, max: 20 } } };
    expect(resolveDamageAgainst(noSt, blow(18, "cr")).knockback.yards).toBe(1);
  });
});
