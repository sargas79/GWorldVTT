import { describe, expect, it } from "vitest";

import {
  COMPLETELY_CONCEALED_PENALTY,
  HALF_EXPOSED_PENALTY,
  coverShot,
  struckCover,
} from "../cover.js";
import {
  closeWeaponReaches,
  grappleSizeBonus,
  reachBonusForSize,
  reachForSize,
} from "../size.js";
import { HEARING_PENALTY, attackWithoutSight, defendWithoutSight } from "../visibility.js";

describe("attacking what you cannot see (Campaigns p. 394)", () => {
  it("costs nothing when you can see perfectly well", () => {
    expect(attackWithoutSight({ sight: "clear" })).toEqual({
      modifier: 0,
      hearingRoll: false,
      randomHitLocation: false,
    });
  });

  /** "He attacks at -10 (-6 if he is accustomed to being blind)." */
  it("costs ten in total darkness, and six to somebody used to it", () => {
    expect(attackWithoutSight({ sight: "blind" }).modifier).toBe(-10);
    expect(attackWithoutSight({ sight: "blind", accustomedToBlindness: true }).modifier).toBe(-6);
  });

  /** "any such light within line of sight reduces the penalty ... to -3" */
  it("costs only three by torchlight", () => {
    const lit = attackWithoutSight({ sight: "blind", lightSource: true });
    expect(lit.modifier).toBe(-3);
    expect(lit.hearingRoll).toBe(false);
    expect(lit.randomHitLocation).toBe(false);
  });

  /** A torch does nothing for somebody who cannot see at all. */
  it("does not light the way for the blind", () => {
    const blind = attackWithoutSight({
      sight: "blind",
      accustomedToBlindness: true,
      lightSource: true,
    });
    expect(blind.modifier).toBe(-6);
  });

  it("costs six against an invisible foe, and four when you know where they are", () => {
    expect(attackWithoutSight({ sight: "foeUnseen" }).modifier).toBe(-6);
    expect(attackWithoutSight({ sight: "positionKnown" }).modifier).toBe(-4);
  });

  /** "no Hearing roll is required" when the foe's position is certain. */
  it("needs a Hearing roll to find a foe whose position is not certain", () => {
    expect(attackWithoutSight({ sight: "blind" }).hearingRoll).toBe(true);
    expect(attackWithoutSight({ sight: "foeUnseen" }).hearingRoll).toBe(true);
    expect(attackWithoutSight({ sight: "positionKnown" }).hearingRoll).toBe(false);
    expect(HEARING_PENALTY).toBe(-2);
  });

  it("rolls the hit location for any blow struck unseeing", () => {
    for (const sight of ["blind", "foeUnseen", "positionKnown"] as const) {
      expect(attackWithoutSight({ sight }).randomHitLocation, sight).toBe(true);
    }
  });
});

describe("defending against what you cannot see (Campaigns p. 394)", () => {
  /** "If he is completely unaware of his attacker, he gets no defense at all!" */
  it("allows nothing at all to somebody who does not know", () => {
    expect(defendWithoutSight({ aware: false })).toMatchObject({
      anyDefense: false,
      canParryOrBlock: false,
    });
  });

  /** "he may dodge at -4" */
  it("allows a dodge at -4 to somebody who knows they are under attack", () => {
    const aware = defendWithoutSight({ aware: true });
    expect(aware.anyDefense).toBe(true);
    expect(aware.modifier).toBe(-4);
    expect(aware.canParryOrBlock).toBe(false);
  });

  /** "If the defender makes a Hearing-2 roll, he may also parry or block." */
  it("allows a parry or block to somebody who heard where it came from", () => {
    expect(defendWithoutSight({ aware: true, heardAttacker: true }).canParryOrBlock).toBe(true);
  });
});

describe("cover (Campaigns p. 407)", () => {
  /** "Your attack takes the usual hit location penalty." */
  it("costs nothing extra to shoot at a fully exposed part", () => {
    expect(coverShot({ approach: "exposedLocation" }).modifier).toBe(0);
  });

  /** "If the location is only half exposed, you have an extra -2 to hit." */
  it("costs two more for a part only half showing", () => {
    expect(coverShot({ approach: "exposedLocation", halfExposed: true }).modifier).toBe(
      HALF_EXPOSED_PENALTY,
    );
  });

  /** "Your attack takes no hit location penalty, but shots that hit a covered
   *  location strike the cover instead." */
  it("takes no penalty at all when the location is rolled for", () => {
    const shot = coverShot({ approach: "randomLocation" });
    expect(shot.modifier).toBe(0);
    expect(shot.randomHitLocation).toBe(true);
  });

  /** "roll 1d: on a roll of 4-6, the shot strikes cover, not the target" */
  it("loses half the shots at a half-exposed location to the cover", () => {
    const shot = coverShot({ approach: "randomLocation" });
    expect(struckCover(3, shot)).toBe(false);
    expect(struckCover(4, shot)).toBe(true);
    expect(struckCover(6, shot)).toBe(true);
  });

  it("strikes no cover when no location roll was made", () => {
    expect(struckCover(6, coverShot({ approach: "exposedLocation" }))).toBe(false);
  });

  /** "You have an extra -2 to hit... The cover adds its cover DR." */
  it("costs two to shoot through, and the cover still stops some of it", () => {
    const shot = coverShot({ approach: "shootThrough" });
    expect(shot.modifier).toBe(-2);
    expect(shot.coverDrApplies).toBe(true);
  });

  /** "If your foe is completely concealed... the usual penalty for shooting
   *  blind, typically -10." */
  it("costs ten to shoot at somebody entirely hidden", () => {
    const shot = coverShot({ approach: "shootThrough", completelyConcealed: true });
    expect(shot.modifier).toBe(COMPLETELY_CONCEALED_PENALTY);
    expect(shot.coverDrApplies).toBe(true);
  });
});

describe("being very large (Campaigns p. 402)", () => {
  it("follows the reach table", () => {
    expect(reachBonusForSize(0)).toBe(0);
    expect(reachBonusForSize(1)).toBe(0);
    expect(reachBonusForSize(2)).toBe(1);
    expect(reachBonusForSize(3)).toBe(2);
    expect(reachBonusForSize(5)).toBe(5);
    expect(reachBonusForSize(10)).toBe(30);
  });

  it("keeps the largest listed reach past the end of the table", () => {
    expect(reachBonusForSize(14)).toBe(30);
  });

  it("gives a small character nothing", () => {
    expect(reachBonusForSize(-2)).toBe(0);
    expect(closeWeaponReaches(0)).toBe(false);
    expect(closeWeaponReaches(1)).toBe(true);
  });

  /** "a weapon with reach 2-3 has reach 2-5 in his hands" for a SM +3 giant. */
  it("follows the book's own example", () => {
    expect(reachForSize("2-3", 3)).toBe("2-5");
  });

  it("extends only the longest reach a weapon has", () => {
    expect(reachForSize("1,2", 2)).toBe("1,3");
    expect(reachForSize("1", 2)).toBe("2");
  });

  /** "A reach C weapon increases to reach 1, but there are no other effects." */
  it("turns a close weapon into a reach 1 one", () => {
    expect(reachForSize("C", 1)).toBe("1");
    expect(reachForSize("C", 0)).toBe("C");
  });

  it("keeps the close option on a weapon that has one", () => {
    expect(reachForSize("C,1", 2)).toBe("C,2");
  });

  it("leaves a reach nobody can parse alone", () => {
    expect(reachForSize("special", 3)).toBe("special");
    expect(reachForSize("", 3)).toBe("");
  });

  /** "+1 to hit when you grapple per +1 SM advantage you have over your target" */
  it("helps a giant get hold of somebody smaller", () => {
    expect(grappleSizeBonus(3, 0)).toBe(3);
    expect(grappleSizeBonus(3, 3)).toBe(0);
    expect(grappleSizeBonus(0, 3)).toBe(0);
  });
});
