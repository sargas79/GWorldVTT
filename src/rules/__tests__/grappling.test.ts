import { describe, expect, it } from "vitest";

import {
  GRAPPLED_DX_PENALTY,
  breakFree,
  canMoveWhileGrappled,
  chokeDamage,
  chokeModifier,
  extraArmBonus,
  pinModifier,
  preventsMovement,
  takedownModifier,
  takedownScore,
} from "../grappling.js";

describe("taking hold of somebody (Campaigns p. 370)", () => {
  /** "each arm beyond the first two gives a bonus of +2 to hit" */
  it("pays two a side for more arms than anybody needs", () => {
    expect(extraArmBonus(2)).toBe(0);
    expect(extraArmBonus(3)).toBe(2);
    expect(extraArmBonus(6)).toBe(8);
  });

  it("pays nothing for fewer arms than two", () => {
    expect(extraArmBonus(1)).toBe(0);
    expect(extraArmBonus(0)).toBe(0);
  });

  /** "you do not prevent him from moving away -- you're just extra encumbrance" */
  it("cannot hold somebody more than twice its own ST", () => {
    expect(preventsMovement(10, 20)).toBe(true);
    expect(preventsMovement(10, 21)).toBe(false);
    expect(preventsMovement(20, 10)).toBe(true);
  });

  it("holds the grappled part at -4 DX", () => {
    expect(GRAPPLED_DX_PENALTY).toBe(-4);
  });
});

describe("breaking free (Campaigns p. 371)", () => {
  /** "Your foe has +5 if he is grappling you with two hands." */
  it("is five harder against two hands", () => {
    expect(breakFree({ hands: 2 }).grapplerBonus).toBe(5);
    expect(breakFree({ hands: 1 }).grapplerBonus).toBe(0);
  });

  /** "If he has you pinned, he rolls at +10 if using two hands or at +5 if one." */
  it("is much harder against a pin", () => {
    expect(breakFree({ hands: 2, pinned: true }).grapplerBonus).toBe(10);
    expect(breakFree({ hands: 1, pinned: true }).grapplerBonus).toBe(5);
  });

  /** "you may only attempt to break free once every 10 seconds" when pinned. */
  it("may only be tried every ten seconds against a pin", () => {
    expect(breakFree({ pinned: true }).secondsBetweenAttempts).toBe(10);
    expect(breakFree({}).secondsBetweenAttempts).toBe(1);
  });

  it("counts the extra arms holding on", () => {
    expect(breakFree({ hands: 2, arms: 4 }).grapplerBonus).toBe(9);
  });

  /** "If your foe is stunned, he rolls at -4." */
  it("is easier against somebody who has just been rattled", () => {
    expect(breakFree({ hands: 2, grapplerStunned: true }).grapplerBonus).toBe(1);
  });

  /** "if he falls unconscious, you are automatically free!" */
  it("needs no contest at all against somebody who has passed out", () => {
    const free = breakFree({ hands: 2, pinned: true, grapplerUnconscious: true });
    expect(free.automatic).toBe(true);
    expect(free.grapplerBonus).toBe(0);
  });

  /** "you cannot take a Move maneuver unless you have at least twice your foe's ST" */
  it("lets somebody twice as strong simply walk off", () => {
    expect(canMoveWhileGrappled(20, 10)).toBe(true);
    expect(canMoveWhileGrappled(19, 10)).toBe(false);
  });
});

describe("a takedown (Campaigns p. 370)", () => {
  /** "each contestant using the highest of ST, DX, or his best grappling skill" */
  it("is contested with the best of three", () => {
    expect(takedownScore({ strength: 12, dexterity: 11, grapplingSkill: 14 })).toBe(14);
    expect(takedownScore({ strength: 15, dexterity: 11, grapplingSkill: 14 })).toBe(15);
    expect(takedownScore({ strength: 10, dexterity: 13, grapplingSkill: null })).toBe(13);
  });

  /** "If you are not standing, you have a penalty equal to the usual penalty
   *  to hit for your posture." */
  it("is harder from the ground", () => {
    expect(takedownModifier("standing")).toBe(0);
    expect(takedownModifier("lying")).toBeLessThan(0);
    expect(takedownModifier("kneeling")).toBeLessThan(0);
  });
});

describe("a pin (Campaigns p. 370)", () => {
  /** "+3 for every point by which his Size Modifier exceeds that of his foe" */
  it("favours the larger fighter by three a point", () => {
    expect(pinModifier({ sizeModifier: 2, foeSizeModifier: 0 })).toBe(6);
    expect(pinModifier({ sizeModifier: 0, foeSizeModifier: 2 })).toBe(0);
  });

  /** "The fighter with the most free hands gets +3." */
  it("favours whoever has a hand spare", () => {
    expect(pinModifier({ freeHands: 2, foeFreeHands: 1 })).toBe(3);
    expect(pinModifier({ freeHands: 1, foeFreeHands: 1 })).toBe(0);
  });

  it("adds both together", () => {
    expect(pinModifier({ sizeModifier: 1, freeHands: 1, foeFreeHands: 0 })).toBe(6);
  });
});

describe("a choke (Campaigns p. 370)", () => {
  it("is unmodified with both hands on the neck", () => {
    expect(chokeModifier({ hands: 2 })).toBe(0);
  });

  /** "You are at -5 if you use only one hand, but at +2 per hand after two." */
  it("is five worse one-handed and two better per extra hand", () => {
    expect(chokeModifier({ hands: 1 })).toBe(-5);
    expect(chokeModifier({ hands: 3 })).toBe(2);
    expect(chokeModifier({ hands: 4 })).toBe(4);
  });

  /** "you roll at -5 unless you have Constriction Attack" around the torso. */
  it("is five worse round the torso without Constriction Attack", () => {
    expect(chokeModifier({ hands: 2, aroundTorso: true })).toBe(-5);
    expect(chokeModifier({ hands: 2, aroundTorso: true, constrictionAttack: true })).toBe(0);
  });

  /** "your foe takes crushing damage equal to your margin of victory" */
  it("does damage equal to the margin of victory", () => {
    expect(chokeDamage(4)).toBe(4);
    expect(chokeDamage(0)).toBe(0);
    expect(chokeDamage(-3)).toBe(0);
  });
});
