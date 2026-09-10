import { describe, expect, it } from "vitest";

import {
  BASIC_SPEED_STEP,
  SECONDARY_COST_PER_LEVEL,
  attributePointCost,
  attributesPointCost,
  basicLift,
  basicMove,
  basicSpeed,
  basicSpeedPointCost,
  secondaryCharacteristics,
  secondaryPointCost,
} from "../attributes.js";
import {
  ENCUMBRANCE_TIERS,
  encumberedMove,
  encumbranceLevel,
  encumbranceState,
  isOverloaded,
} from "../encumbrance.js";
import {
  defaultLevel,
  effectiveSkillLevel,
  namedDefaultLevel,
  pointsForRelativeLevel,
  relativeLevelForPoints,
  resolveTechnique,
  skillLevel,
  techniqueLevelsForPoints,
  techniquePointCost,
} from "../skills.js";
import type { Difficulty } from "../types.js";

describe("attribute costs (GURPS Lite p. 4)", () => {
  it("charges 10 points per level of ST and HT, 20 for DX and IQ", () => {
    expect(attributePointCost("ST", 11)).toBe(10);
    expect(attributePointCost("HT", 12)).toBe(20);
    expect(attributePointCost("DX", 11)).toBe(20);
    expect(attributePointCost("IQ", 12)).toBe(40);
  });

  it("refunds points for attributes below 10", () => {
    expect(attributePointCost("ST", 9)).toBe(-10);
    expect(attributePointCost("IQ", 8)).toBe(-40);
  });

  it("costs nothing for a wholly average character", () => {
    expect(attributesPointCost({ ST: 10, DX: 10, IQ: 10, HT: 10 })).toBe(0);
  });
});

describe("secondary characteristics (GURPS Lite pp. 5-6)", () => {
  it("gives the average human ST 10 a Basic Lift of 20 lbs.", () => {
    expect(basicLift(10)).toBe(20);
  });

  it("rounds Basic Lift to a whole number only at 10 lbs. and above", () => {
    // The rules give 16.2 lbs. becoming 16 lbs. as the worked example.
    expect(basicLift(9)).toBe(16); // 16.2 rounds to 16
    expect(basicLift(7)).toBeCloseTo(9.8); // below 10 lbs., left fractional
  });

  it("leaves Basic Speed unrounded, since 5.25 beats 5", () => {
    expect(basicSpeed(11, 10)).toBe(5.25);
    expect(basicMove(5.75)).toBe(5);
  });

  it("derives HP, Will, Per, and FP from their governing attributes", () => {
    const secondary = secondaryCharacteristics({ ST: 12, DX: 11, IQ: 13, HT: 9 });
    expect(secondary.hp).toBe(12);
    expect(secondary.will).toBe(13);
    expect(secondary.per).toBe(13);
    expect(secondary.fp).toBe(9);
    expect(secondary.basicSpeed).toBe(5);
    expect(secondary.basicMove).toBe(5);
  });

  it("applies optional bonuses without disturbing the base derivation", () => {
    const secondary = secondaryCharacteristics(
      { ST: 10, DX: 10, IQ: 10, HT: 10 },
      { hp: 3, basicMove: 1 },
    );
    expect(secondary.hp).toBe(13);
    expect(secondary.basicMove).toBe(6);
  });
});

describe("the Skill Cost Table (GURPS Lite p. 12)", () => {
  // The printed table, as relative level by difficulty for each point cost.
  const printed: Array<{ points: number; E: number; A: number; H: number; VH: number }> = [
    { points: 1, E: 0, A: -1, H: -2, VH: -3 },
    { points: 2, E: 1, A: 0, H: -1, VH: -2 },
    { points: 4, E: 2, A: 1, H: 0, VH: -1 },
    { points: 8, E: 3, A: 2, H: 1, VH: 0 },
    { points: 12, E: 4, A: 3, H: 2, VH: 1 },
    { points: 16, E: 5, A: 4, H: 3, VH: 2 },
  ];

  it.each(printed)("buys the printed relative levels for $points points", (row) => {
    for (const difficulty of ["E", "A", "H", "VH"] as Difficulty[]) {
      expect(relativeLevelForPoints(row.points, difficulty), `${row.points} pts, ${difficulty}`).toBe(
        row[difficulty],
      );
    }
  });

  it("inverts cleanly back to point costs", () => {
    for (const row of printed) {
      for (const difficulty of ["E", "A", "H", "VH"] as Difficulty[]) {
        expect(pointsForRelativeLevel(row[difficulty], difficulty)).toBe(row.points);
      }
    }
  });

  it("charges a further 4 points per level beyond the table", () => {
    expect(pointsForRelativeLevel(6, "E")).toBe(20);
    expect(pointsForRelativeLevel(7, "E")).toBe(24);
  });

  it("treats a skill with no points spent as unknown", () => {
    expect(relativeLevelForPoints(0, "A")).toBeNull();
    expect(skillLevel(12, 0, "A")).toBeNull();
  });

  it("does not advance a step until its full cost is paid", () => {
    expect(relativeLevelForPoints(3, "A")).toBe(0); // still at the 2-point step
    expect(relativeLevelForPoints(4, "A")).toBe(1);
  });

  it("returns null for relative levels cheaper than the 1-point minimum", () => {
    expect(pointsForRelativeLevel(-1, "E")).toBeNull();
    expect(pointsForRelativeLevel(-3, "H")).toBeNull();
  });

  it("computes an absolute level: 4 points of an Average skill off DX 12 is 13", () => {
    expect(skillLevel(12, 4, "A")).toBe(13);
  });

  it("adds a flat skill bonus on top", () => {
    expect(skillLevel(12, 4, "A", 2)).toBe(15);
  });
});

describe("skill defaults (GURPS Lite p. 13)", () => {
  it("defaults at -4 for Easy, -5 for Average, and -6 for Hard", () => {
    expect(defaultLevel(12, "E")).toBe(8);
    expect(defaultLevel(12, "A")).toBe(7);
    expect(defaultLevel(12, "H")).toBe(6);
  });

  it("applies the Rule of 20 to superhuman attributes", () => {
    expect(defaultLevel(30, "A")).toBe(15);
    expect(namedDefaultLevel(30, -5)).toBe(15);
  });

  it("uses a named default such as IQ-5", () => {
    expect(namedDefaultLevel(13, -5)).toBe(8);
  });

  it("prefers the trained level when it beats every default", () => {
    const result = effectiveSkillLevel({
      attributeScore: 12,
      difficulty: "A",
      points: 4,
      defaults: [7],
    });
    expect(result).toEqual({ level: 13, fromDefault: false });
  });

  it("falls back to the best default when untrained", () => {
    const result = effectiveSkillLevel({
      attributeScore: 12,
      difficulty: "A",
      points: 0,
      defaults: [7, 9],
    });
    expect(result).toEqual({ level: 9, fromDefault: true });
  });

  it("returns null for an unlearned skill with no default, such as Karate", () => {
    expect(
      effectiveSkillLevel({ attributeScore: 12, difficulty: "H", points: 0 }),
    ).toBeNull();
  });
});

describe("encumbrance (GURPS Lite p. 22)", () => {
  const bl = 20; // ST 10

  it.each([
    [20, 0],
    [21, 1],
    [40, 1],
    [41, 2],
    [60, 2],
    [61, 3],
    [120, 3],
    [121, 4],
    [200, 4],
  ])("puts %s lbs. against BL 20 at encumbrance level %s", (weight, level) => {
    expect(encumbranceLevel(weight, bl)).toBe(level);
  });

  it("flags weight beyond 10x Basic Lift as overloaded", () => {
    expect(isOverloaded(200, bl)).toBe(false);
    expect(isOverloaded(201, bl)).toBe(true);
  });

  it("multiplies Move by the tier factor, dropping fractions", () => {
    expect(encumberedMove(5, 0)).toBe(5);
    expect(encumberedMove(5, 1)).toBe(4); // 5 * 0.8
    expect(encumberedMove(5, 2)).toBe(3); // 5 * 0.6
    expect(encumberedMove(5, 3)).toBe(2); // 5 * 0.4
    expect(encumberedMove(5, 4)).toBe(1); // 5 * 0.2
  });

  it("never lets encumbrance reduce Move below 1", () => {
    expect(encumberedMove(2, 4)).toBe(1);
    expect(encumberedMove(1, 4)).toBe(1);
  });

  it("still reports 0 Move for a character who has none to begin with", () => {
    expect(encumberedMove(0, 0)).toBe(0);
  });

  it("penalises Dodge by one per encumbrance level", () => {
    for (const tier of ENCUMBRANCE_TIERS) {
      // Carry exactly the tier's limit to land on that level.
      const weight = bl * tier.basicLiftMultiple;
      const state = encumbranceState(weight, bl, 5);
      expect(state.level, `${weight} lbs. should be level ${tier.level}`).toBe(tier.level);
      expect(state.dodgePenalty).toBe(tier.level === 0 ? 0 : -tier.level);
    }
  });

  it("reports no Dodge penalty as positive zero, so chat cards never show -0", () => {
    expect(Object.is(encumbranceState(0, bl, 5).dodgePenalty, 0)).toBe(true);
  });

  it("summarises the whole state", () => {
    const state = encumbranceState(45, bl, 5);
    expect(state).toMatchObject({
      level: 2,
      key: "medium",
      move: 3,
      dodgePenalty: -2,
      overloaded: false,
    });
  });
});

describe("secondary characteristic pricing (GURPS Basic Set: Characters pp. 14-17)", () => {
  it.each([
    ["hp", 2],
    ["will", 5],
    ["per", 5],
    ["fp", 3],
    ["basicMove", 5],
    ["basicSpeedQuarter", 5],
  ] as const)("prices %s at %s points per level", (key, rate) => {
    expect(SECONDARY_COST_PER_LEVEL[key]).toBe(rate);
  });

  it("charges the listed rate per level bought", () => {
    expect(secondaryPointCost("hp", 3)).toBe(6);
    expect(secondaryPointCost("will", 2)).toBe(10);
    expect(secondaryPointCost("per", 1)).toBe(5);
    expect(secondaryPointCost("fp", 4)).toBe(12);
    expect(secondaryPointCost("basicMove", 2)).toBe(10);
  });

  it("refunds points for levels sold below the default", () => {
    expect(secondaryPointCost("hp", -3)).toBe(-6);
    expect(secondaryPointCost("will", -2)).toBe(-10);
    expect(secondaryPointCost("fp", -1)).toBe(-3);
  });

  it("costs nothing when nothing is bought", () => {
    for (const key of ["hp", "will", "per", "fp", "basicMove"] as const) {
      expect(secondaryPointCost(key, 0)).toBe(0);
    }
  });

  it("prices Basic Speed in quarter-point steps at 5 points each", () => {
    expect(basicSpeedPointCost(0.25)).toBe(5);
    expect(basicSpeedPointCost(0.5)).toBe(10);
    expect(basicSpeedPointCost(1)).toBe(20);
    expect(basicSpeedPointCost(0)).toBe(0);
    expect(basicSpeedPointCost(-0.25)).toBe(-5);
    expect(basicSpeedPointCost(-1)).toBe(-20);
  });

  it("does not silently price an off-step Basic Speed adjustment at zero", () => {
    // The schema field rejects off-step values, but if one ever reached this
    // helper it must not read as free while still moving the score.
    expect(basicSpeedPointCost(0.1)).not.toBe(0);
    expect(BASIC_SPEED_STEP).toBe(0.25);
  });
});

describe("techniques (GURPS Basic Set: Characters pp. 229-233)", () => {
  it("charges an Average technique one point per level", () => {
    expect(techniquePointCost(1, "A")).toBe(1);
    expect(techniquePointCost(3, "A")).toBe(3);
  });

  it("charges a Hard technique two for the first level, then one each", () => {
    expect(techniquePointCost(1, "H")).toBe(2);
    expect(techniquePointCost(2, "H")).toBe(3);
    expect(techniquePointCost(4, "H")).toBe(5);
  });

  it("costs nothing at the default level", () => {
    expect(techniquePointCost(0, "A")).toBe(0);
    expect(techniquePointCost(0, "H")).toBe(0);
  });

  it("inverts points back into levels", () => {
    expect(techniqueLevelsForPoints(3, "A")).toBe(3);
    expect(techniqueLevelsForPoints(3, "H")).toBe(2);
    // A single point buys nothing on a Hard technique.
    expect(techniqueLevelsForPoints(1, "H")).toBe(0);
    expect(techniqueLevelsForPoints(0, "A")).toBe(0);
  });

  it("starts at the prerequisite skill minus the default penalty", () => {
    // Kicking defaults to Karate-2, so Karate-14 gives Kicking-12 unbought.
    const result = resolveTechnique({ prerequisiteLevel: 14, defaultModifier: -2, levels: 0 });
    expect(result.level).toBe(12);
    expect(result.levels).toBe(0);
  });

  it("buys the penalty off, level by level", () => {
    const result = resolveTechnique({ prerequisiteLevel: 14, defaultModifier: -2, levels: 2 });
    expect(result.level).toBe(14);
    expect(result.cappedByPrerequisite).toBe(false);
  });

  it("never exceeds the prerequisite skill's own level", () => {
    // Buying 5 levels off a -2 default cannot pass Karate-14.
    const result = resolveTechnique({ prerequisiteLevel: 14, defaultModifier: -2, levels: 5 });
    expect(result.level).toBe(14);
    expect(result.cappedByPrerequisite).toBe(true);
  });

  it("honours a tighter cap when the technique specifies one", () => {
    const result = resolveTechnique({
      prerequisiteLevel: 14, defaultModifier: -4, levels: 10, maxRelativeToPrerequisite: -1,
    });
    expect(result.level).toBe(13);
    expect(result.cappedByPrerequisite).toBe(true);
  });
});
