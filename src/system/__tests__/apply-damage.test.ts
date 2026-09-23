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
  /** Arms and legs beyond two, as the derived trait effects carry them. */
  extraArms?: number;
  extraLegs?: number;
  armor?: Array<{
    dr: number;
    drSplit?: number | null;
    drSplitAppliesTo?: readonly string[];
    locations?: string[];
    equipped?: boolean;
    hardened?: number;
    forceField?: boolean;
    ablative?: string;
    drLost?: number;
  }>;
}) {
  const { hp = 10, maxHp = 10, fp = 10, maxFp = 10, armor = [], extraArms = 0, extraLegs = 0 } = options;
  return {
    name: "Target",
    system: {
      hp: { value: hp, max: maxHp },
      fp: { value: fp, max: maxFp },
      ...(extraArms || extraLegs ? { derived: { traitEffects: { extraArms, extraLegs } } } : {}),
    },
    items: armor.map((piece) => ({
      type: "armor",
      system: {
        dr: piece.dr,
        drSplit: piece.drSplit ?? null,
        drSplitAppliesTo: piece.drSplitAppliesTo ?? [],
        locations: piece.locations ?? [],
        equipped: piece.equipped ?? true,
        hardened: piece.hardened ?? 0,
        forceField: piece.forceField ?? false,
        ablative: piece.ablative ?? "none",
        drLost: piece.drLost ?? 0,
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

  /**
   * Armour at its best against blows: the higher figure is for crushing only,
   * and every other kind of damage meets the lower one.
   */
  it("uses the higher DR against crushing when the split leaves crushing out", () => {
    const helmed = () =>
      actor({
        armor: [
          {
            dr: 4,
            drSplit: 2,
            drSplitAppliesTo: ["burn", "cor", "cut", "fat", "imp", "pi-", "pi", "pi+", "pi++", "tox"],
            locations: ["skull"],
          },
        ],
      });

    expect(resolveDamageAgainst(helmed(), blow(8, "cr", "skull")).wornDr).toBe(4);
    expect(resolveDamageAgainst(helmed(), blow(8, "cut", "skull")).wornDr).toBe(2);
    expect(resolveDamageAgainst(helmed(), blow(8, "pi", "skull")).wornDr).toBe(2);
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

  /**
   * "Any crippling injury is also a major wound, and requires a HT roll for
   * knockdown and stunning" (Campaigns p. 421), however little it cost.
   */
  describe("a crippling blow (#616)", () => {
    const cases: Array<[string, number, number, number]> = [
      // [location, max HP, the least injury that cripples, a blow of that much crushing]
      ["arm", 10, 6, 6],
      ["leg", 11, 6, 6],
      ["hand", 9, 4, 4],
      ["foot", 10, 4, 4],
      ["hand", 12, 5, 5],
    ];
    for (const [location, maxHp, least] of cases) {
      it(`cripples a ${location} at ${maxHp} HP with ${least}, and calls for the knockdown roll`, () => {
        const cripples = resolveDamageAgainst(actor({ hp: maxHp, maxHp }), blow(least, "cr", location));
        expect(cripples.crippled).toBe(true);
        expect(cripples.injury).toBe(least);
        expect(cripples.consequences.majorWound).toBe(true);
        expect(cripples.knockdown?.required).toBe(true);

        const short = resolveDamageAgainst(actor({ hp: maxHp, maxHp }), blow(least - 1, "cr", location));
        expect(short.crippled).toBe(false);
        expect(short.consequences.majorWound).toBe(false);
        expect(short.knockdown).toBeNull();

        // Anything more is lost past what cripples it.
        const more = resolveDamageAgainst(actor({ hp: maxHp, maxHp }), blow(least + 3, "cr", location));
        expect(more.injury).toBe(least);
        expect(more.excessLost).toBe(3);
      });
    }

    it("offers the roll for an extremity crippled well under half HP", () => {
      // 4 is under half of 10, but cripples a hand.
      const result = resolveDamageAgainst(actor({ hp: 10, maxHp: 10 }), blow(4, "cr", "hand"));
      expect(result.injury).toBeLessThanOrEqual(10 / 2);
      expect(result.knockdown).toEqual({ required: true, modifier: 0 });
    });
  });

  /** Each of more than two arms or legs cripples on less (Campaigns p. 421). */
  describe("a body with extra limbs (#624)", () => {
    it("cripples one of four arms over HP/4, a major wound with the knockdown roll", () => {
      // 12 HP, four arms: over 3 cripples an arm; two arms would need 7.
      const cripples = resolveDamageAgainst(actor({ hp: 12, maxHp: 12, extraArms: 2 }), blow(4, "cr", "arm"));
      expect(cripples.crippled).toBe(true);
      expect(cripples.injury).toBe(4);
      expect(cripples.consequences.majorWound).toBe(true);
      expect(cripples.knockdown?.required).toBe(true);

      const short = resolveDamageAgainst(actor({ hp: 12, maxHp: 12, extraArms: 2 }), blow(3, "cr", "arm"));
      expect(short.crippled).toBe(false);
      expect(short.knockdown).toBeNull();

      const more = resolveDamageAgainst(actor({ hp: 12, maxHp: 12, extraArms: 2 }), blow(9, "cr", "arm"));
      expect(more.injury).toBe(4);
      expect(more.excessLost).toBe(5);
    });

    it("cripples one of four feet over HP/6, and leaves the arms alone", () => {
      const foot = resolveDamageAgainst(actor({ hp: 12, maxHp: 12, extraLegs: 2 }), blow(6, "cr", "foot"));
      expect(foot.crippled).toBe(true);
      expect(foot.injury).toBe(3);
      // Four legs, but two arms: an arm still needs over 6.
      const arm = resolveDamageAgainst(actor({ hp: 12, maxHp: 12, extraLegs: 2 }), blow(6, "cr", "arm"));
      expect(arm.crippled).toBe(false);
    });

    it("keeps HP/2 and HP/3 for a body with two of each", () => {
      const arm = resolveDamageAgainst(actor({ hp: 12, maxHp: 12 }), blow(6, "cr", "arm"));
      expect(arm.crippled).toBe(false);
      expect(resolveDamageAgainst(actor({ hp: 12, maxHp: 12 }), blow(5, "cr", "hand")).crippled).toBe(true);
    });
  });

  it("survives an actor with no pools at all rather than writing NaN", () => {
    const result = resolveDamageAgainst({ name: "Empty" }, blow(5, "cr"));
    expect(Number.isFinite(result.current)).toBe(true);
    expect(result.previous).toBe(0);
  });
});

/**
 * Cinematic Explosions (Campaigns p. 417). The rule is off by default, so
 * nothing here runs against the ordinary pipeline; what it checks is that a
 * blast marked cinematic costs a point a yard and leaves nothing else behind.
 */
describe("a cinematic blast", () => {
  const blast = (basicDamage: number, type = "cr", hitLocation = "torso") =>
    ({ basicDamage, type, hitLocation, armorDivisor: 1, cinematicBlast: true }) as never;

  it("costs a token point a yard rather than what the dice said", () => {
    // ST 10 shoves a yard per 8 points, so 20 is two yards and two points.
    const result = resolveDamageAgainst(actor({ hp: 12, maxHp: 12 }), blast(20));
    expect(result.knockback.yards).toBe(2);
    expect(result.injury).toBe(2);
    expect(result.current).toBe(10);
    expect(result.cinematicBlast).toBe(true);
  });

  it("hurts nobody it did not move", () => {
    const result = resolveDamageAgainst(actor({ hp: 12, maxHp: 12 }), blast(4));
    expect(result.knockback.yards).toBe(0);
    expect(result.injury).toBe(0);
    expect(result.current).toBe(12);
  });

  it("cripples no limb it did not wound", () => {
    // 30 crushing to an arm would cripple it and throw away everything over
    // the threshold, if the rolled figure were ever treated as a wound. It
    // is not: three yards of knockback cost three token points.
    const result = resolveDamageAgainst(actor({ hp: 12, maxHp: 12 }), blast(30, "cr", "arm"));
    expect(result.injury).toBe(3);
    expect(result.crippled).toBe(false);
    expect(result.excessLost).toBe(0);
  });

  it("never bleeds, whatever the blast was made of", () => {
    // A cutting blast turned by heavy armour still shoves, and the points it
    // costs are for being thrown about rather than for an open wound.
    const armoured = actor({ hp: 12, maxHp: 12, armor: [{ dr: 40, locations: ["torso"] }] });
    const result = resolveDamageAgainst(armoured, blast(30, "cut"));
    expect(result.injury).toBeGreaterThan(0);
    expect(result.bleeds).toBe(false);
  });
});

/**
 * The damage modifiers a mode can carry that change the shove rather than the
 * wound (Characters p. 104). A blow reaches the pipeline with them set, and
 * the knockback it reports is what the card shows and what the roll to stay
 * standing is taken against.
 */
describe("knockback modifiers on a blow", () => {
  // The stand-in carries no ST, so the pipeline reads its maximum HP in place
  // of one: 10 shoves a yard per 8 points of damage before DR.
  const shove = (extra: Record<string, unknown>) =>
    resolveDamageAgainst(
      actor({ hp: 10, maxHp: 10 }),
      { basicDamage: 16, type: "cr", hitLocation: "torso", armorDivisor: 1, ...extra } as never,
    ).knockback;

  it("shoves the usual distance when the blow carries neither", () => {
    expect(shove({}).yards).toBe(2);
  });

  it("shoves twice as far for double knockback", () => {
    expect(shove({ doubleKnockback: true }).yards).toBe(4);
    expect(shove({ doubleKnockback: true }).fallRollPenalty).toBe(-3);
  });

  it("shoves nobody for an attack marked as causing none", () => {
    expect(shove({ noKnockback: true }).yards).toBe(0);
  });

  it("leaves the wound alone either way", () => {
    // Knockback is worked out beside the injury, not out of it.
    const doubled = resolveDamageAgainst(
      actor({ hp: 10, maxHp: 10 }),
      { basicDamage: 16, type: "cr", hitLocation: "torso", armorDivisor: 1, doubleKnockback: true } as never,
    );
    const plain = resolveDamageAgainst(
      actor({ hp: 10, maxHp: 10 }),
      { basicDamage: 16, type: "cr", hitLocation: "torso", armorDivisor: 1 } as never,
    );
    expect(doubled.injury).toBe(plain.injury);
  });
});

/**
 * A cosmic armour divisor, which a data file writes as "!". It is read as the
 * attack ignoring DR, the same fact a Malediction carries (Characters p. 106),
 * so armour and the location's own DR both count for nothing.
 */
describe("a blow that ignores DR", () => {
  it("meets no worn armour at all", () => {
    const armoured = actor({ hp: 12, maxHp: 12, armor: [{ dr: 20, locations: ["torso"] }] });
    const stopped = resolveDamageAgainst(armoured, blow(10, "cr"));
    const through = resolveDamageAgainst(
      armoured,
      { basicDamage: 10, type: "cr", hitLocation: "torso", armorDivisor: 1, ignoresDr: true } as never,
    );
    expect(stopped.injury).toBe(0);
    expect(through.injury).toBe(10);
  });
});

/**
 * The kinds of DR a piece of armour can be made of (Characters p. 47), as the
 * pipeline meets them.
 */
describe("Hardened armour against an armour divisor", () => {
  const blowWithDivisor = (divisor: number, ignoresDr = false) =>
    ({ basicDamage: 20, type: "cr", hitLocation: "torso", armorDivisor: divisor, ...(ignoresDr ? { ignoresDr: true } : {}) }) as never;

  it("steps the divisor down, so more of the armour counts", () => {
    const armoured = (hardened: number) => actor({ hp: 20, maxHp: 20, armor: [{ dr: 10, locations: ["torso"], hardened }] });
    // A (5) divisor leaves DR 2 of the ten; hardened once it is a (3), leaving 3.
    expect(resolveDamageAgainst(armoured(0), blowWithDivisor(5)).effectiveDr).toBe(2);
    expect(resolveDamageAgainst(armoured(1), blowWithDivisor(5)).effectiveDr).toBe(3);
    expect(resolveDamageAgainst(armoured(2), blowWithDivisor(5)).effectiveDr).toBe(5);
  });

  it("brings an attack that ignores DR back to meeting some", () => {
    const armoured = (hardened: number) => actor({ hp: 20, maxHp: 20, armor: [{ dr: 10, locations: ["torso"], hardened }] });
    expect(resolveDamageAgainst(armoured(0), blowWithDivisor(1, true)).effectiveDr).toBe(0);
    // One level makes it a (100): a tenth of a point, which rounds to none.
    expect(resolveDamageAgainst(armoured(6), blowWithDivisor(1, true)).effectiveDr).toBe(10);
  });
});

describe("a Force Field before the armour (Characters p. 47)", () => {
  const field = (dr: number, rest: number) =>
    actor({ hp: 20, maxHp: 20, armor: [{ dr, forceField: true }, { dr: rest, locations: ["torso"] }] });

  it("takes its share off the blow before the armour under it", () => {
    // 20 damage, a field of 6 and DR 4 under it: 14 reaches the armour, 10 gets in.
    const result = resolveDamageAgainst(field(6, 4), { basicDamage: 20, type: "cr", hitLocation: "torso", armorDivisor: 1 } as never);
    expect(result.forceField.stopped).toBe(6);
    expect(result.effectiveDr).toBe(4);
    expect(result.penetrating).toBe(10);
  });

  it("protects the eyes, which no worn armour has to cover", () => {
    const result = resolveDamageAgainst(field(6, 4), { basicDamage: 8, type: "cr", hitLocation: "eye", armorDivisor: 1 } as never);
    expect(result.forceField.stopped).toBe(6);
  });

  it("keeps touch effects out while it holds, and lets them in once pierced", () => {
    const held = resolveDamageAgainst(field(30, 0), { basicDamage: 8, type: "cr", hitLocation: "torso", armorDivisor: 1 } as never);
    expect(held.touchEffectsReach).toBe(false);

    const pierced = resolveDamageAgainst(field(2, 0), { basicDamage: 8, type: "cr", hitLocation: "torso", armorDivisor: 1 } as never);
    expect(pierced.touchEffectsReach).toBe(true);
  });

  it("refuses nothing where the target has no field at all", () => {
    const plain = resolveDamageAgainst(actor({ armor: [{ dr: 30, locations: ["torso"] }] }), blow(8, "cr"));
    expect(plain.penetrating).toBe(0);
    expect(plain.touchEffectsReach).toBe(true);
  });
});

describe("armour a blow has already spent", () => {
  it("meets only what is left of an ablative piece", () => {
    const worn = actor({ hp: 20, maxHp: 20, armor: [{ dr: 10, locations: ["torso"], ablative: "ablative", drLost: 7 }] });
    expect(resolveDamageAgainst(worn, blow(8, "cr")).effectiveDr).toBe(3);
  });
});

/** A blow that only shoves (since API 1.63.0). */
describe("a kinetic-only blow", () => {
  it("shoves as a crushing blow and wounds nobody", () => {
    const hit = resolveDamageAgainst(
      actor({ hp: 10, maxHp: 10 }),
      { basicDamage: 16, type: "cut", hitLocation: "torso", armorDivisor: 1, kineticOnly: true } as never,
    );
    expect(hit.injury).toBe(0);
    expect(hit.crippled).toBe(false);
    expect(hit.knockback.yards).toBe(2);
  });
});

/** A blow from underneath meets a boot's sole (since API 1.63.0). */
describe("a blow from below", () => {
  const booted = () => {
    const target = actor({ hp: 10, maxHp: 10, armor: [{ dr: 2, locations: ["foot"] }] });
    (target.items[0]!.system as Record<string, unknown>).soleDr = 5;
    return target;
  };

  it("meets the sole on the foot, and the boot's own DR otherwise", () => {
    const under = resolveDamageAgainst(booted(), { basicDamage: 6, type: "cr", hitLocation: "foot", armorDivisor: 1, fromBelow: true } as never);
    const side = resolveDamageAgainst(booted(), { basicDamage: 6, type: "cr", hitLocation: "foot", armorDivisor: 1 } as never);
    expect(under.penetrating).toBe(1);
    expect(side.penetrating).toBe(4);
  });
});
