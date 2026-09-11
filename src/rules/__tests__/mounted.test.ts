import { describe, expect, it } from "vitest";

import {
  CHARGE_VELOCITY,
  CONFIDENT_RIDING,
  DIVE_MOVE_BONUS,
  PASSENGER_HOLD_PENALTY,
  PASSENGER_PENALTY,
  PUSHING_THE_ENVELOPE,
  STALL_RECOVERY_MODIFIER,
  atHighSpeed,
  diving,
  flightMoveCost,
  hastyDecelerationModifier,
  lanceDamage,
  maximumDeceleration,
  mountedAttack,
  mountedDefensePenalty,
  mountedShooting,
  safeDeceleration,
  sprintTopSpeed,
  stallSpeed,
  stayingOn,
  tightTurnModifier,
  turningRadius,
} from "../mounted.js";
import {
  appliesTo,
  affectsSecondary,
  penaltyEffects,
  penaltyForRoll,
  strengthForDamage,
} from "../attribute-penalties.js";

describe("defending from the saddle (Campaigns p. 397)", () => {
  /** "If he has Riding at 12+, all of these defenses are at normal levels.
   * For a less-skilled rider, reduce active defenses by the difference." */
  it("costs a poor rider the difference from 12", () => {
    expect(CONFIDENT_RIDING).toBe(12);
    expect(mountedDefensePenalty(9)).toBe(-3);
    expect(mountedDefensePenalty(12)).toBe(0);
    expect(Object.is(mountedDefensePenalty(16), 0)).toBe(true);
  });
});

describe("striking from a moving horse (Campaigns p. 396)", () => {
  /** "If the mount's velocity is 7 or more relative to the foe, the attack has
   * -1 to hit but +1 damage." */
  it("trades a point of skill for a point of damage at speed", () => {
    expect(CHARGE_VELOCITY).toBe(7);
    expect(mountedAttack(7)).toEqual({ toHit: -1, damageBonus: 1 });
    expect(mountedAttack(6)).toEqual({ toHit: 0, damageBonus: 0 });
  });

  /** "A ST 25 warhorse charging at Move 8 inflicts 2d+3 impaling damage." */
  it("works the book's own lance example", () => {
    expect(lanceDamage({ mountStrength: 25, yardsMoved: 8 })).toMatchObject({
      dice: 2,
      adds: 3,
      type: "imp",
    });
  });

  /** "These inflict the same amount of damage, but it is crushing -- and if
   * the damage exceeds 15 points, the lance snaps." */
  it("blunts a tournament lance and caps it at fifteen", () => {
    expect(lanceDamage({ mountStrength: 25, yardsMoved: 8, jousting: true })).toMatchObject({
      type: "cr",
      maxDamage: 15,
    });
    expect(lanceDamage({ mountStrength: 25, yardsMoved: 8 }).maxDamage).toBeNull();
  });
});

describe("staying on (Campaigns p. 397)", () => {
  /** "A rider who is stunned must make a Riding roll at -4 or fall off." */
  it("asks a stunned rider for a roll at -4", () => {
    expect(stayingOn({ stunned: true })).toEqual({ modifier: -4, automaticFall: false });
  });

  /** "A rider who suffers any knockback is automatically knocked off unless he
   * has a saddle and stirrups." */
  it("throws a bareback rider off on any knockback at all", () => {
    expect(stayingOn({ knockbackYards: 1 })).toEqual({ modifier: null, automaticFall: true });
  });

  /** "-4 per yard of knockback to stay on" */
  it("gives a saddled rider a roll, four worse per yard", () => {
    expect(stayingOn({ knockbackYards: 1, saddleAndStirrups: true }).modifier).toBe(-4);
    expect(stayingOn({ knockbackYards: 3, saddleAndStirrups: true }).modifier).toBe(-12);
  });

  it("asks nothing of a rider nothing happened to", () => {
    expect(stayingOn({})).toEqual({ modifier: 0, automaticFall: false });
  });

  it("prices a passenger", () => {
    expect(PASSENGER_PENALTY).toBe(-1);
    expect(PASSENGER_HOLD_PENALTY).toBe(-3);
  });
});

describe("shooting from the saddle (Campaigns p. 396)", () => {
  /** "Roll against the lower of Riding or ranged weapon skill to hit." */
  it("rolls against the worse of the two skills", () => {
    expect(mountedShooting({ ridingSkill: 10, weaponSkill: 14 }).toHit).toBe(10);
    expect(mountedShooting({ ridingSkill: 15, weaponSkill: 12 }).toHit).toBe(12);
  });

  /** "-4 to weapon skill, and -1 to any Riding roll made that turn." */
  it("prices turning in the saddle", () => {
    expect(mountedShooting({ ridingSkill: 14, weaponSkill: 14, turnedAround: true })).toEqual({
      toHit: 10,
      ridingModifier: -1,
    });
  });

  /** "-6 to weapon skill, -3 to any Riding roll." */
  it("prices hanging off the far side", () => {
    expect(mountedShooting({ ridingSkill: 14, weaponSkill: 14, hangingOff: true })).toEqual({
      toHit: 8,
      ridingModifier: -3,
    });
  });
});

describe("flying (Campaigns p. 397)", () => {
  /** "Vertical movement costs the same as horizontal... diagonal movement at
   * 45 degrees costs the same as 1.5 horizontal yards." */
  it("charges a yard for a yard, and one and a half for both at once", () => {
    expect(flightMoveCost({ horizontal: 3, vertical: 0 })).toBe(3);
    expect(flightMoveCost({ horizontal: 0, vertical: 3 })).toBe(3);
    expect(flightMoveCost({ horizontal: 2, vertical: 2 })).toBe(3);
    expect(flightMoveCost({ horizontal: 4, vertical: 2 })).toBe(5);
  });

  /** "Add +10 to basic air Move and double top airspeed on any turn spent
   * diving and doing nothing else." */
  it("makes a dive faster in both senses", () => {
    expect(DIVE_MOVE_BONUS).toBe(10);
    expect(diving({ airMove: 12, topAirspeed: 30 })).toEqual({ airMove: 22, topAirspeed: 60 });
  });

  /** "You must... move at least 1/4 your top airspeed each turn, or you'll
   * stall and start to fall." */
  it("stalls below a quarter of top airspeed", () => {
    expect(stallSpeed(40)).toBe(10);
    expect(STALL_RECOVERY_MODIFIER).toBe(-4);
  });
});

describe("going too fast to stop (Campaigns pp. 394-395)", () => {
  /** "High-speed movement occurs whenever your present velocity exceeds your
   * Basic Move." */
  it("starts the moment velocity passes Basic Move", () => {
    expect(atHighSpeed({ velocity: 6, basicMove: 5 })).toBe(true);
    expect(atHighSpeed({ velocity: 5, basicMove: 5 })).toBe(false);
  });

  /** "A velocity up to 20% greater than your Move (at minimum, +1 Move)...
   * up to 100% greater with Enhanced Move." */
  it("prices the first turn of a sprint", () => {
    expect(sprintTopSpeed({ basicMove: 10 })).toBe(12);
    expect(sprintTopSpeed({ basicMove: 4 })).toBe(5);
    expect(sprintTopSpeed({ basicMove: 10, enhancedMove: true })).toBe(20);
  });

  /** "If your current velocity is 13 and you have Basic Move 5, you must move
   * at least 13/5 = 2.6 yards, which rounds to 2 yards." */
  it("works the book's turning radius example", () => {
    expect(turningRadius({ velocity: 13, basicMove: 5 })).toBe(2);
  });

  /** "If your Basic Move is 0... you cannot turn at all under your own power!" */
  it("lets something with no Move of its own never turn", () => {
    expect(turningRadius({ velocity: 10, basicMove: 0 })).toBe(Number.POSITIVE_INFINITY);
  });

  /** "If your Basic Move is 5 and you decelerate by 9 yards/second, you must
   * roll at -2." */
  it("works the book's hasty deceleration example", () => {
    expect(hastyDecelerationModifier({ basicMove: 5, deceleration: 9 })).toBe(-2);
  });

  it("charges nothing for slowing within your Basic Move", () => {
    expect(Object.is(hastyDecelerationModifier({ basicMove: 5, deceleration: 5 }), 0)).toBe(true);
  });

  /** "If you're moving at 23 yards/second and have Basic Move 3, you must roll
   * at -6." */
  it("works the book's tight turn example", () => {
    expect(tightTurnModifier({ velocity: 23, basicMove: 3 })).toBe(-6);
  });

  /** "Either requires a DX+3 roll." */
  it("starts three in your favour before those penalties", () => {
    expect(PUSHING_THE_ENVELOPE).toBe(3);
  });

  /** "You can try to decelerate by up to Basic Move x 2." */
  it("caps slowing at twice Basic Move, safely at once", () => {
    expect(safeDeceleration(5)).toBe(5);
    expect(maximumDeceleration(5)).toBe(10);
  });
});

describe("attributes knocked down for a while (Campaigns p. 421)", () => {
  /** "IQ penalties apply equally to Will and Per." */
  it("drags Will and Per down with IQ", () => {
    expect(penaltyEffects({ IQ: -2 })).toMatchObject({
      intelligence: -2,
      will: -2,
      perception: -2,
    });
  });

  /** "There are no other effects on secondary characteristics." */
  it("leaves every other secondary alone", () => {
    expect(affectsSecondary("will")).toBe(true);
    expect(affectsSecondary("per")).toBe(true);
    expect(affectsSecondary("hp")).toBe(false);
    expect(affectsSecondary("basicSpeed")).toBe(false);
    expect(affectsSecondary("basicMove")).toBe(false);
    expect(affectsSecondary("fp")).toBe(false);
  });

  it("reads a penalty written either way round", () => {
    expect(penaltyEffects({ DX: 3 }).dexterity).toBe(-3);
    expect(penaltyEffects({ DX: -3 }).dexterity).toBe(-3);
  });

  /** "-2 to IQ would give -2 to all IQ-based skills (and to all Per- and
   * Will-based skills)." */
  it("comes off every skill the attribute governs", () => {
    const penalties = { IQ: -2, DX: -4 };
    expect(penaltyForRoll({ penalties, basedOn: "IQ", kind: "skill" })).toBe(-2);
    expect(penaltyForRoll({ penalties, basedOn: "Will", kind: "skill" })).toBe(-2);
    expect(penaltyForRoll({ penalties, basedOn: "Per", kind: "skill" })).toBe(-2);
    expect(penaltyForRoll({ penalties, basedOn: "DX", kind: "skill" })).toBe(-4);
    expect(penaltyForRoll({ penalties, basedOn: "HT", kind: "skill" })).toBe(0);
  });

  /** "Active defenses, resistance rolls, Fright Checks, etc. never suffer
   * penalties for attribute reductions. For instance, -2 to DX would not
   * affect Block, Dodge, or Parry." */
  it("never touches a defense, a resistance roll or a Fright Check", () => {
    const penalties = { DX: -5, IQ: -5, HT: -5 };
    expect(appliesTo("skill")).toBe(true);
    expect(appliesTo("activeDefense")).toBe(false);
    expect(penaltyForRoll({ penalties, basedOn: "DX", kind: "activeDefense" })).toBe(0);
    expect(penaltyForRoll({ penalties, basedOn: "HT", kind: "resistance" })).toBe(0);
    expect(penaltyForRoll({ penalties, basedOn: "Will", kind: "frightCheck" })).toBe(0);
  });

  /** "ST reductions affect the damage you inflict with muscle-powered weapons." */
  it("weakens the blow but not the hit points", () => {
    expect(strengthForDamage({ strength: 14, penalties: { ST: -4 } })).toBe(10);
    expect(strengthForDamage({ strength: 14, penalties: {} })).toBe(14);
    expect(strengthForDamage({ strength: 2, penalties: { ST: -6 } })).toBe(0);
  });
});
