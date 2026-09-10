import { describe, expect, it } from "vitest";

import {
  arcDefense,
  attackArc,
  facingChangeAtEndOfMove,
  facingChangeCost,
  hexDirection,
  hexMovementCost,
  retreatBonus,
  shieldSide,
  type HexDirection,
} from "../tactical.js";

const facing: HexDirection = 0;

describe("attackArc", () => {
  /** Of the six adjacent hexes, three are front, one each side, one behind. */
  it("counts the hex faced and the two flanking it as front", () => {
    expect(attackArc(facing, 0).arc).toBe("front");
    expect(attackArc(facing, 1).arc).toBe("front");
    expect(attackArc(facing, 5).arc).toBe("front");
  });

  it("names which side a side attack came from", () => {
    expect(attackArc(facing, 2)).toEqual({ arc: "side", side: "right" });
    expect(attackArc(facing, 4)).toEqual({ arc: "side", side: "left" });
  });

  it("puts the one remaining hex behind", () => {
    expect(attackArc(facing, 3).arc).toBe("back");
  });

  it("turns with the defender", () => {
    // Facing 3, an attack from 3 is dead ahead and one from 0 is behind.
    expect(attackArc(3, 3).arc).toBe("front");
    expect(attackArc(3, 0).arc).toBe("back");
  });

  it("wraps rather than running off the end of the compass", () => {
    expect(hexDirection(6)).toBe(0);
    expect(hexDirection(-1)).toBe(5);
    expect(attackArc(5, 0).arc).toBe("front");
  });
});

describe("arcDefense", () => {
  const rightHanded = { weaponSide: "right" as const };

  it("changes nothing about a defense from the front", () => {
    const front = arcDefense({ arc: "front" });
    expect(front).toMatchObject({ modifier: 0, canDodge: true, canParry: true, canBlock: true });
  });

  it("penalises a side attack by 2", () => {
    expect(arcDefense({ arc: "side", side: "left", hands: rightHanded }).modifier).toBe(-2);
  });

  it("waives the side penalty for someone who can see that way", () => {
    expect(arcDefense({ arc: "side", side: "left", vision: { peripheral: true } }).modifier).toBe(0);
    expect(arcDefense({ arc: "side", side: "left", vision: { allRound: true } }).modifier).toBe(0);
  });

  /**
   * A shield is on the shield side and stays there. No amount of seeing the
   * blow coming brings it round to the weapon side.
   */
  it("blocks only from the shield side, whatever the defender can see", () => {
    expect(shieldSide(rightHanded)).toBe("left");
    expect(arcDefense({ arc: "side", side: "left", hands: rightHanded }).canBlock).toBe(true);
    expect(arcDefense({ arc: "side", side: "right", hands: rightHanded }).canBlock).toBe(false);
    expect(
      arcDefense({ arc: "side", side: "right", hands: rightHanded, vision: { allRound: true } })
        .canBlock,
    ).toBe(false);
  });

  it("lets a flexible arm bring the shield across", () => {
    expect(
      arcDefense({ arc: "side", side: "right", hands: rightHanded, vision: { flexible: true } })
        .canBlock,
    ).toBe(true);
  });

  it("parries a one-handed weapon only on the side it is held", () => {
    const right = { arc: "side" as const, side: "right" as const, hands: rightHanded };
    expect(arcDefense(right).canParry).toBe(true);
    expect(arcDefense({ ...right, side: "left" }).canParry).toBe(false);
  });

  it("lets a two-handed weapon parry either side, being held across the body", () => {
    expect(
      arcDefense({ arc: "side", side: "left", hands: rightHanded, oneHandedWeapon: false })
        .canParry,
    ).toBe(true);
  });

  /** "you cannot defend at all unless you have Peripheral Vision or 360 Vision" */
  it("leaves an ordinary fighter helpless against an attack from behind", () => {
    const behind = arcDefense({ arc: "back", hands: rightHanded });
    expect(behind.helpless).toBe(true);
    expect(behind.canDodge).toBe(false);
    expect(behind.canParry).toBe(false);
    expect(behind.canBlock).toBe(false);
  });

  it("lets Peripheral Vision defend behind at -2, and all-round vision at none", () => {
    expect(arcDefense({ arc: "back", vision: { peripheral: true } }).modifier).toBe(-2);
    expect(arcDefense({ arc: "back", vision: { allRound: true } }).modifier).toBe(0);
    expect(arcDefense({ arc: "back", vision: { peripheral: true } }).helpless).toBe(false);
  });

  /**
   * The two extra restrictions that survive even all-round vision: a parry
   * from behind is harder still, and a block is impossible.
   */
  it("still makes a parry from behind harder and a block impossible", () => {
    const seeing = arcDefense({ arc: "back", vision: { allRound: true } });
    expect(seeing.parryModifier).toBe(-2);
    expect(seeing.canBlock).toBe(false);

    const flexible = arcDefense({ arc: "back", vision: { allRound: true, flexible: true } });
    expect(flexible.parryModifier).toBe(0);
    expect(flexible.canBlock).toBe(true);
  });
});

describe("retreatBonus", () => {
  it("gives Dodge the most", () => {
    expect(retreatBonus({ defense: "dodge" })).toBe(3);
  });

  it("gives an ordinary parry or block one", () => {
    expect(retreatBonus({ defense: "parry", skill: "Broadsword" })).toBe(1);
    expect(retreatBonus({ defense: "block" })).toBe(1);
  });

  /** Boxing, Judo, Karate and the fencing skills make superior use of mobility. */
  it("gives a mobile parry three", () => {
    const mobile = ["Boxing", "Judo", "Karate", "Rapier", "Saber", "Smallsword", "Main-Gauche"];
    for (const skill of mobile) {
      expect(retreatBonus({ defense: "parry", skill })).toBe(3);
    }
  });

  it("recognises a fencing weapon by its flag as well as its skill", () => {
    expect(retreatBonus({ defense: "parry", skill: "Shortsword", isFencing: true })).toBe(3);
  });

  it("looks past a specialty on the skill name", () => {
    expect(retreatBonus({ defense: "parry", skill: "Karate (Style)" })).toBe(3);
  });

  it("does not mistake a similarly named skill for a mobile one", () => {
    expect(retreatBonus({ defense: "parry", skill: "Two-Handed Sword" })).toBe(1);
    expect(retreatBonus({ defense: "parry", skill: "Boxing Sport" })).toBe(1);
  });
});

describe("hexMovementCost", () => {
  it("charges a point to go forward and two to go any other way", () => {
    expect(hexMovementCost({ direction: "forward" })).toBe(1);
    expect(hexMovementCost({ direction: "sideways" })).toBe(2);
    expect(hexMovementCost({ direction: "backward" })).toBe(2);
  });

  it("adds the posture surcharge", () => {
    expect(hexMovementCost({ direction: "forward", posture: "crouching" })).toBe(1.5);
    expect(hexMovementCost({ direction: "forward", posture: "kneeling" })).toBe(3);
    expect(hexMovementCost({ direction: "forward", posture: "crawling" })).toBe(3);
  });

  it("adds a point per obstruction and for bad footing", () => {
    expect(hexMovementCost({ direction: "forward", obstructions: 2 })).toBe(3);
    expect(hexMovementCost({ direction: "forward", badFooting: true })).toBe(2);
  });

  /**
   * Sitting cannot move, and lying down spends everything to shift one hex.
   * Neither is a per-hex cost, so neither gets a number that could be summed.
   */
  it("gives no per-hex cost for a posture that has none", () => {
    expect(hexMovementCost({ direction: "forward", posture: "sitting" })).toBeNull();
    expect(hexMovementCost({ direction: "forward", posture: "lying" })).toBeNull();
  });
});

describe("facing changes", () => {
  it("costs a point per hex-side turned, the short way round", () => {
    expect(facingChangeCost(0, 1)).toBe(1);
    expect(facingChangeCost(0, 3)).toBe(3);
    expect(facingChangeCost(0, 5)).toBe(1);
    expect(facingChangeCost(0, 0)).toBe(0);
  });

  it("is free at the end of a move, and unrestricted at half your points or less", () => {
    expect(facingChangeAtEndOfMove({ movementPointsSpent: 2, movementPointsAvailable: 5 })).toBe(
      "any",
    );
    expect(facingChangeAtEndOfMove({ movementPointsSpent: 4, movementPointsAvailable: 5 })).toBe(
      "oneHexSide",
    );
  });

  it("counts exactly half as still free", () => {
    expect(facingChangeAtEndOfMove({ movementPointsSpent: 3, movementPointsAvailable: 6 })).toBe(
      "any",
    );
  });
});
