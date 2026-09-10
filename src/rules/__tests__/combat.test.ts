import { describe, expect, it } from "vitest";

import {
  baseBlock,
  baseDodge,
  baseParry,
  bestParryOption,
  block,
  dodge,
  parry,
} from "../defenses.js";
import {
  applyInjury,
  consciousnessRollPenalty,
  crossedDeathThreshold,
  halveForReeling,
  healthStatus,
  isDead,
  isMajorWound,
  isReeling,
  shockPenalty,
} from "../injury.js";
import { POSTURE_EFFECTS, postureMove, reachablePostures } from "../posture.js";
import { rangedToHitModifier, speedRangeModifier, musclePoweredRange } from "../ranged.js";

describe("base active defenses (GURPS Lite pp. 6, 28)", () => {
  it("gives Basic Speed 5.25 a Dodge of 8", () => {
    expect(baseDodge(5.25)).toBe(8);
  });

  it("gives Shield-11 a Block of 8", () => {
    expect(baseBlock(11)).toBe(8);
  });

  it("gives Broadsword-13 a Parry of 9", () => {
    expect(baseParry(13)).toBe(9);
  });
});

describe("Dodge modifiers", () => {
  it("subtracts encumbrance level", () => {
    expect(dodge(5.25, { encumbrance: 2 }).total).toBe(6);
  });

  it("adds shield DB against attacks from the front or shield side", () => {
    expect(dodge(5.25, { shieldDb: 2 }).total).toBe(10);
    expect(dodge(5.25, { shieldDb: 2, attackFromFrontOrShieldSide: false }).total).toBe(8);
  });

  it("halves the score when reeling, rounding up, before modifiers apply", () => {
    // Dodge 8 halves to 4, then loses 1 to light encumbrance.
    expect(dodge(5.25, { reeling: true, encumbrance: 1 }).total).toBe(3);
  });

  it("stacks stun and All-Out Defense", () => {
    expect(dodge(5.25, { stunned: true }).total).toBe(4);
    expect(dodge(5.25, { allOutDefenseIncreased: true }).total).toBe(10);
  });

  it("itemises only the modifiers that actually applied", () => {
    const result = dodge(5.25, { encumbrance: 0, stunned: true });
    expect(result.modifiers).toEqual([{ label: "Stunned", value: -4 }]);
  });
});

describe("Parry modifiers (GURPS Lite p. 28)", () => {
  it("takes -1 for a knife and +2 for a quarterstaff", () => {
    expect(parry(13, { weaponParryModifier: -1 }).total).toBe(8);
    expect(parry(13, { weaponParryModifier: 2 }).total).toBe(11);
  });

  it("takes -3 parrying a weapon bare-handed", () => {
    expect(parry(12, { unarmedVsWeapon: true }).total).toBe(6);
  });

  it("waives that penalty against a thrust or when using Karate", () => {
    expect(parry(12, { unarmedVsWeapon: true, attackIsThrust: true }).total).toBe(9);
    expect(parry(12, { unarmedVsWeapon: true, usingKarate: true }).total).toBe(9);
  });

  it("takes -1 against a thrown weapon, or -2 against a small one", () => {
    expect(parry(12, { thrownWeapon: "normal" }).total).toBe(8);
    expect(parry(12, { thrownWeapon: "small" }).total).toBe(7);
  });

  it("takes -4 against a flail", () => {
    expect(parry(12, { attackerUsingFlail: true }).total).toBe(5);
  });

  it("applies encumbrance to a Karate parry but not an ordinary weapon parry", () => {
    expect(parry(12, { usingKarate: true, encumbrance: 2 }).total).toBe(7);
    expect(parry(12, { encumbrance: 2 }).total).toBe(9);
  });
});

describe("Block modifiers", () => {
  it("takes -2 against a flail", () => {
    expect(block(11, { attackerUsingFlail: true }).total).toBe(6);
  });

  it("adds shield DB, since the shield helps every defense", () => {
    expect(block(11, { shieldDb: 2 }).total).toBe(10);
  });
});

describe("the Posture Table (GURPS Lite p. 25)", () => {
  it.each([
    ["standing", 0, 0, 0],
    ["crouching", -2, 0, -2],
    ["kneeling", -2, -2, -2],
    ["crawling", -4, -3, -2],
    ["sitting", -2, -2, -2],
    ["lying", -4, -3, -2],
  ] as const)("gives %s attack %s, defense %s, target %s", (posture, attack, defense, target) => {
    expect(POSTURE_EFFECTS[posture].attack).toBe(attack);
    expect(POSTURE_EFFECTS[posture].defense).toBe(defense);
    expect(POSTURE_EFFECTS[posture].target).toBe(target);
  });

  it("reduces Move to two thirds crouching and one third kneeling", () => {
    expect(postureMove(6, "crouching")).toBe(4);
    expect(postureMove(6, "kneeling")).toBe(2);
  });

  it("stops a sitting character moving and limits a lying one to 1 yard", () => {
    expect(postureMove(6, "sitting")).toBe(0);
    expect(postureMove(6, "lying")).toBe(1);
  });

  it("only lets sprinting happen from standing", () => {
    expect(POSTURE_EFFECTS.standing.canSprint).toBe(true);
    expect(POSTURE_EFFECTS.crouching.canSprint).toBe(false);
  });

  it("refuses to stand directly from lying down", () => {
    expect(reachablePostures("lying")).toEqual(["crawling", "kneeling", "sitting"]);
    expect(reachablePostures("lying")).not.toContain("standing");
  });
});

describe("shock and major wounds (GURPS Lite p. 30)", () => {
  it("penalises DX and IQ by the HP lost, capped at -4", () => {
    expect(shockPenalty(1)).toBe(-1);
    expect(shockPenalty(3)).toBe(-3);
    expect(shockPenalty(4)).toBe(-4);
    expect(shockPenalty(20)).toBe(-4);
  });

  it("reports no shock for a blow that did nothing", () => {
    expect(shockPenalty(0)).toBe(0);
  });

  it("counts an injury over half maximum HP as a major wound", () => {
    expect(isMajorWound(5, 10)).toBe(false); // exactly half is not "greater than"
    expect(isMajorWound(6, 10)).toBe(true);
  });
});

describe("injury thresholds (GURPS Lite p. 29)", () => {
  it("starts reeling below one third of maximum HP", () => {
    expect(isReeling(4, 12)).toBe(false);
    expect(isReeling(3, 12)).toBe(true);
  });

  it("halves Move and Dodge rounding up when reeling", () => {
    expect(halveForReeling(7)).toBe(4);
    expect(halveForReeling(8)).toBe(4);
  });

  it("penalises the consciousness roll by one per full multiple of HP below zero", () => {
    expect(consciousnessRollPenalty(0, 10)).toBe(0);
    expect(consciousnessRollPenalty(-5, 10)).toBe(0);
    expect(consciousnessRollPenalty(-10, 10)).toBe(-1);
    expect(consciousnessRollPenalty(-25, 10)).toBe(-2);
  });

  it("triggers a death check at each further multiple of HP, per the 11 HP example", () => {
    // A character with 11 HP rolls at -11, then -22, then -33.
    expect(crossedDeathThreshold(-10, -11, 11)).toBe(true);
    expect(crossedDeathThreshold(-11, -12, 11)).toBe(false);
    expect(crossedDeathThreshold(-21, -22, 11)).toBe(true);
  });

  it("kills outright at -5x maximum HP", () => {
    expect(isDead(-49, 10)).toBe(false);
    expect(isDead(-50, 10)).toBe(true);
  });

  it("reports the overall health status", () => {
    expect(healthStatus(10, 10)).toBe("healthy");
    expect(healthStatus(3, 10)).toBe("reeling");
    expect(healthStatus(0, 10)).toBe("collapsing");
    expect(healthStatus(-50, 10)).toBe("dead");
    expect(healthStatus(-100, 10)).toBe("destroyed");
  });
});

describe("applying a blow", () => {
  it("reports every consequence of a major wound that drops a character below zero", () => {
    const result = applyInjury(12, 2, 10);
    expect(result.currentHp).toBe(-10);
    expect(result.status).toBe("collapsing");
    expect(result.majorWound).toBe(true);
    expect(result.shock).toBe(-4);
    expect(result.consciousnessRollRequired).toBe(true);
    expect(result.consciousnessRollPenalty).toBe(-1);
    expect(result.deathCheckRequired).toBe(true);
  });

  it("reports a scratch as just shock", () => {
    const result = applyInjury(2, 10, 10);
    expect(result.currentHp).toBe(8);
    expect(result.status).toBe("healthy");
    expect(result.majorWound).toBe(false);
    expect(result.shock).toBe(-2);
    expect(result.consciousnessRollRequired).toBe(false);
    expect(result.deathCheckRequired).toBe(false);
  });

  it("asks for no further rolls once the character is dead", () => {
    const result = applyInjury(60, 0, 10);
    expect(result.status).toBe("dead");
    expect(result.consciousnessRollRequired).toBe(false);
    expect(result.deathCheckRequired).toBe(false);
  });
});

describe("the Size and Speed/Range Table (GURPS Lite p. 27)", () => {
  it("puts a man 8 yards away at -4, rounding up to the 10-yard row", () => {
    expect(speedRangeModifier(8)).toBe(-4);
  });

  it("puts a speed/range total of 70 yards at -9, per the motorcycle example", () => {
    expect(speedRangeModifier(70)).toBe(-9);
  });

  it("costs nothing at point-blank range", () => {
    expect(speedRangeModifier(2)).toBe(0);
    expect(speedRangeModifier(0)).toBe(0);
  });

  it("adds target speed to range before looking up the modifier", () => {
    const result = rangedToHitModifier({ rangeYards: 40, targetSpeedYardsPerSecond: 30 });
    expect(result.speedRange).toBe(-9);
  });

  it("adds the target's Size Modifier to the speed/range penalty", () => {
    const result = rangedToHitModifier({ rangeYards: 8, targetSizeModifier: 2 });
    expect(result.total).toBe(-2);
  });

  it("computes muscle-powered ranges as multiples of ST", () => {
    // x10/x15 at ST 10 gives 100/150.
    expect(musclePoweredRange(10, 10, 15)).toEqual({ halfDamage: 100, max: 150 });
  });
});

describe("choosing a weapon to parry with (Basic Set: Characters p. 269)", () => {
  const sword = { name: "Broadsword", parry: 10, unbalanced: false };
  const axe = { name: "Axe", parry: 11, unbalanced: true };
  const knife = { name: "Knife", parry: 8, unbalanced: false };
  const bow = { name: "Bow", parry: null, unbalanced: false };

  it("takes the highest parry when nothing has been swung yet", () => {
    expect(bestParryOption([sword, axe, knife], false)?.name).toBe("Axe");
  });

  /**
   * The rule this exists for: an axe swung this turn is not coming back in
   * time to turn a blade, so the character parries with the sword instead --
   * at a worse score, which is the point.
   */
  it("drops an unbalanced weapon on a turn its wielder has already attacked", () => {
    expect(bestParryOption([sword, axe, knife], true)?.name).toBe("Broadsword");
  });

  it("leaves a balanced weapon alone on such a turn", () => {
    expect(bestParryOption([sword, knife], true)?.name).toBe("Broadsword");
  });

  it("skips a weapon that cannot parry at all", () => {
    expect(bestParryOption([bow, knife], false)?.name).toBe("Knife");
  });

  /**
   * No parry is not the same as a bad parry: a character holding only an axe
   * they have already swung has no parry this turn, and the sheet must say so
   * rather than offering the axe's score.
   */
  it("returns null when nothing left can parry", () => {
    expect(bestParryOption([axe], true)).toBeNull();
    expect(bestParryOption([bow], false)).toBeNull();
    expect(bestParryOption([], false)).toBeNull();
  });
});
