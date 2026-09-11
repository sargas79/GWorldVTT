import { describe, expect, it } from "vitest";

import { traitEffects } from "../../rules/trait-effects.js";
import { resolveDamageAgainst, traitsOf, type IncomingDamage } from "../damage.js";

/**
 * An actor whose derived data carries the trait effects, as a prepared Foundry
 * actor's does. `resolveDamageAgainst` reads them from there rather than
 * walking the items again: the aggregate is computed once, when the sheet is
 * prepared, and everything downstream reads that.
 */
function actor(options: { hp?: number; maxHp?: number; traits?: string[]; dr?: number } = {}) {
  const { hp = 10, maxHp = 10, traits = [], dr = 0 } = options;
  return {
    name: "Target",
    system: {
      hp: { value: hp, max: maxHp },
      fp: { value: 10, max: 10 },
      attributes: { ST: 10 },
      derived: { traitEffects: traitEffects(traits.map((name) => ({ name, levels: 3 }))) },
    },
    items:
      dr > 0 ? [{ type: "armor", system: { dr, locations: ["torso"], equipped: true } }] : [],
  };
}

const blow = (basicDamage: number, type = "cr") =>
  ({ basicDamage, type, armorDivisor: 1, hitLocation: "torso" }) as IncomingDamage;

describe("reading a target's traits", () => {
  it("finds nothing on an actor with no prepared data", () => {
    expect(traitsOf({}).damageResistance).toBe(0);
    expect(traitsOf(undefined).noShock).toBe(false);
  });

  it("fills in anything a stored aggregate is missing", () => {
    const stale = { system: { derived: { traitEffects: { damageResistance: 4 } } } };
    const effects = traitsOf(stale);
    expect(effects.damageResistance).toBe(4);
    // A field written by an older version is absent, and must read as nothing
    // rather than undefined.
    expect(effects.shockMultiplier).toBe(1);
    expect(effects.knockdown).toBe(0);
  });
});

describe("Damage Resistance", () => {
  it("stops damage the way armour does", () => {
    const tough = actor({ traits: ["Damage Resistance"] });
    const result = resolveDamageAgainst(tough, blow(8));
    expect(result.naturalDr).toBe(3);
    expect(result.effectiveDr).toBe(3);
    expect(result.injury).toBe(5);
  });

  it("adds to worn armour rather than replacing it", () => {
    const armoured = actor({ traits: ["Damage Resistance"], dr: 4 });
    expect(resolveDamageAgainst(armoured, blow(10)).effectiveDr).toBe(7);
  });

  it("is divided by an armour divisor like any other DR", () => {
    const tough = actor({ traits: ["Damage Resistance"], dr: 3 });
    const piercing = { ...blow(10, "imp"), armorDivisor: 2 } as IncomingDamage;
    expect(resolveDamageAgainst(tough, piercing).effectiveDr).toBe(3);
  });
});

describe("how badly a wound is felt", () => {
  /** "You never suffer a shock penalty when you are injured." */
  it("gives High Pain Threshold no shock at all", () => {
    const stoic = actor({ traits: ["High Pain Threshold"] });
    const result = resolveDamageAgainst(stoic, blow(4));
    expect(result.injury).toBe(4);
    expect(result.consequences.shock).toBe(0);
  });

  /** "if you take 2 HP of damage, you are at -4 to DX on your next turn" */
  it("gives Low Pain Threshold twice the shock", () => {
    const tender = actor({ traits: ["Low Pain Threshold"] });
    expect(resolveDamageAgainst(tender, blow(2)).consequences.shock).toBe(-4);
    // And past the ordinary floor of -4, to the doubled one of -8.
    expect(resolveDamageAgainst(tender, blow(6)).consequences.shock).toBe(-8);
  });

  it("leaves an ordinary character at the ordinary floor", () => {
    expect(resolveDamageAgainst(actor(), blow(6)).consequences.shock).toBe(-4);
  });
});

describe("the HT rolls a blow calls for", () => {
  it("reports what the victim's traits are worth to each", () => {
    const hardy = actor({
      traits: ["High Pain Threshold", "Hard to Kill", "Hard to Subdue"],
      maxHp: 10,
    });
    const result = resolveDamageAgainst(hardy, blow(9));
    expect(result.htModifiers).toEqual({ knockdown: 3, survival: 3, consciousness: 3 });
  });

  it("reports nothing for a character with none of them", () => {
    expect(resolveDamageAgainst(actor(), blow(9)).htModifiers).toEqual({
      knockdown: 0,
      survival: 0,
      consciousness: 0,
    });
  });

  /** Low Pain Threshold makes the knockdown roll worse, not better. */
  it("reports a penalty as readily as a bonus", () => {
    const tender = actor({ traits: ["Low Pain Threshold"] });
    expect(resolveDamageAgainst(tender, blow(9)).htModifiers.knockdown).toBe(-4);
  });
});
