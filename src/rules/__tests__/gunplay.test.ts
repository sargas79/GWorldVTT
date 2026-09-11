import { describe, expect, it } from "vitest";

import {
  EXPLOSION_DAMAGE,
  MALFUNCTION_TABLE,
  REPAIRS,
  clearsItself,
  malfunctionFor,
  malfunctioned,
  mayExplode,
} from "../malfunctions.js";
import {
  AREA_ATTACK_BONUS,
  FRAGMENT_SKILL,
  fragmentHits,
  fragmentTarget,
  fragmentationRadius,
  scatterBearing,
  scatterDistance,
} from "../scatter.js";
import {
  canOverpenetrate,
  coverDr,
  damageThrough,
  overpenetrates,
} from "../overpenetration.js";
import { FLINCH_PENALTY, LIQUID_IN_THE_FACE, liquidInTheFace } from "../dirty-tricks.js";
import { dualWeaponAttack } from "../attack-options.js";
import { elevationRange } from "../ranged.js";

describe("when the gun does not go off (Campaigns p. 407)", () => {
  /** "3-4 mechanical; 5-8 misfire; 9-11 stoppage; 12-14 misfire; 15-18 explosion." */
  it("reads the malfunction table", () => {
    expect(malfunctionFor(3)).toBe("mechanical");
    expect(malfunctionFor(4)).toBe("mechanical");
    expect(malfunctionFor(5)).toBe("misfire");
    expect(malfunctionFor(8)).toBe("misfire");
    expect(malfunctionFor(9)).toBe("stoppage");
    expect(malfunctionFor(11)).toBe("stoppage");
    expect(malfunctionFor(12)).toBe("misfire");
    expect(malfunctionFor(14)).toBe("misfire");
    expect(malfunctionFor(15)).toBe("explosion");
    expect(malfunctionFor(18)).toBe("explosion");
  });

  it("covers every roll of 3d with no gaps", () => {
    for (let roll = 3; roll <= 18; roll += 1) {
      expect(MALFUNCTION_TABLE.some((row) => roll >= row.min && roll <= row.max)).toBe(true);
    }
  });

  /** Malf. is the number at or above which the weapon fails. */
  it("jams at or above the weapon's malfunction number", () => {
    expect(malfunctioned({ roll: 17, malfunctionNumber: 17 })).toBe(true);
    expect(malfunctioned({ roll: 18, malfunctionNumber: 17 })).toBe(true);
    expect(malfunctioned({ roll: 16, malfunctionNumber: 17 })).toBe(false);
  });

  it("never jams a weapon with no malfunction number", () => {
    expect(malfunctioned({ roll: 18 })).toBe(false);
  });

  /** "Each repair attempt takes one hour, and any critical failure destroys
   * the weapon." */
  it("makes a mechanical problem an hour's work and a risk to the weapon", () => {
    expect(REPAIRS.mechanical).toMatchObject({
      hours: 1,
      readyManeuvers: 0,
      criticalFailure: "destroyed",
    });
  });

  /** "Three Ready maneuvers, two hands free, and a successful Armoury+2 or
   * IQ-based weapon skill roll." */
  it("makes a misfire three Ready maneuvers at Armoury+2", () => {
    expect(REPAIRS.misfire).toMatchObject({
      readyManeuvers: 3,
      armouryModifier: 2,
      needsBothHands: true,
      criticalFailure: "mechanical",
    });
  });

  /** "A successful Armoury roll, or IQ-based weapon skill roll at -4." */
  it("makes a stoppage harder on the weapon skill than on Armoury", () => {
    expect(REPAIRS.stoppage).toMatchObject({ armouryModifier: 0, weaponSkillModifier: -4 });
  });

  /** "If the weapon is a revolver, the next shot will fire normally." */
  it("lets a revolver shrug off a misfire", () => {
    expect(clearsItself("misfire", true)).toBe(true);
    expect(clearsItself("misfire", false)).toBe(false);
    expect(clearsItself("stoppage", true)).toBe(false);
  });

  /** "Any TL3 firearm or TL4 grenade... TL5+ weapons do not explode." */
  it("only blows up at low tech levels", () => {
    expect(mayExplode(3)).toBe(true);
    expect(mayExplode(4)).toBe(true);
    expect(mayExplode(5)).toBe(false);
    expect(mayExplode(9)).toBe(false);
  });

  /** "inflicting 1d+2 cr ex [2d]" */
  it("costs the gunner 1d+2 crushing explosion", () => {
    expect(EXPLOSION_DAMAGE).toMatchObject({ dice: 1, adds: 2, type: "cr ex", fragmentation: 2 });
  });
});

describe("where the grenade landed (Campaigns p. 414)", () => {
  /** "Roll to hit at +4. There's no defense roll." */
  it("is four easier to hit a patch of ground", () => {
    expect(AREA_ATTACK_BONUS).toBe(4);
  });

  /** "You missed your target by a number of yards equal to your margin of
   * failure, to a maximum of half the distance to the target (round up)." */
  it("scatters by the margin, capped at half the distance", () => {
    expect(scatterDistance({ margin: 3, distanceYards: 20, directionRoll: 1 }).yards).toBe(3);
    expect(scatterDistance({ margin: 30, distanceYards: 9, directionRoll: 1 }).yards).toBe(5);
  });

  /** "You miss by yards equal to the square of your margin of failure." */
  it("squares the margin against something flying or unseen", () => {
    expect(scatterDistance({ margin: 4, distanceYards: 100, unseen: true, directionRoll: 1 }).yards)
      .toBe(16);
  });

  /** "This does not apply to a dodge." */
  it("does not square a dodge, however unseen the target", () => {
    expect(
      scatterDistance({ margin: 4, distanceYards: 100, unseen: true, dodged: true, directionRoll: 1 })
        .yards,
    ).toBe(4);
  });

  /** "Take the direction you are facing as a roll of 1, 60 degrees clockwise
   * as a roll of 2, and so on." */
  it("reads the direction die as a clock face of six", () => {
    expect(scatterDistance({ margin: 1, distanceYards: 10, directionRoll: 1 }).direction).toBe(1);
    expect(scatterDistance({ margin: 1, distanceYards: 10, directionRoll: 6 }).direction).toBe(6);
    expect(scatterBearing(1)).toBe(0);
    expect(scatterBearing(2)).toBe(60);
    expect(scatterBearing(4)).toBe(180);
  });

  /** "Everyone within (5 x dice of fragmentation damage) yards is vulnerable." */
  it("throws fragments five yards per die", () => {
    expect(fragmentationRadius(2)).toBe(10);
    expect(fragmentationRadius(0)).toBe(0);
  });

  /** "The fragments attack everyone else in the area at skill 15." */
  it("attacks bystanders at 15 and three modifiers", () => {
    expect(FRAGMENT_SKILL).toBe(15);
    expect(fragmentTarget({ rangeModifier: -3, postureModifier: -2, sizeModifier: 0 })).toBe(10);
  });

  /** "Against an airburst, do not apply posture modifiers." */
  it("ignores posture under an airburst", () => {
    expect(
      fragmentTarget({ rangeModifier: -3, postureModifier: -2, sizeModifier: 0, airburst: true }),
    ).toBe(12);
  });

  /** "For every three points by which the attack roll succeeds, one additional
   * fragment strikes the target." */
  it("adds a fragment per three of margin", () => {
    expect(fragmentHits(0)).toBe(1);
    expect(fragmentHits(2)).toBe(1);
    expect(fragmentHits(3)).toBe(2);
    expect(fragmentHits(9)).toBe(4);
    expect(fragmentHits(-1)).toBe(0);
  });
});

describe("shooting through things (Campaigns p. 408)", () => {
  /** The book's worked example: Agent Gray's DR 8 vest and 12 HP, against a
   * 7d(2) bullet, is cover DR 14. */
  it("works out Agent Gray's cover DR", () => {
    expect(coverDr({ dr: 8, hp: 12, kind: "flesh", armorDivisor: 2 })).toBe(14);
  });

  it("counts armour on both sides of a person and all of their hit points", () => {
    expect(coverDr({ dr: 8, hp: 12, kind: "flesh" })).toBe(28);
  });

  /** "1/2 HP (for a machine, vehicle, or other Unliving target), or 1/4 HP
   * (for a Homogenous object)." */
  it("counts less of a machine and less again of a solid object", () => {
    expect(coverDr({ dr: 4, hp: 20, kind: "unliving" })).toBe(14);
    expect(coverDr({ dr: 4, hp: 20, kind: "homogenous" })).toBe(9);
  });

  /** "Use the object's DR alone if it's a thin slab, like a wall or a door." */
  it("counts a door as its DR and nothing else", () => {
    expect(coverDr({ dr: 6, hp: 40, kind: "thinSlab" })).toBe(6);
  });

  /** "An attack only overpenetrates if its basic damage exceeds the target's
   * cover DR." */
  it("goes through when the basic damage beats it", () => {
    expect(overpenetrates(20, 14)).toBe(true);
    expect(overpenetrates(14, 14)).toBe(false);
  });

  /** "The VIP wasn't wearing armor, so he takes 6 points of damage." */
  it("finishes the book's own example", () => {
    expect(damageThrough({ basicDamage: 20, cover: 14 })).toBe(6);
  });

  it("gives whoever is behind their own armour as well", () => {
    expect(damageThrough({ basicDamage: 20, cover: 14, targetDr: 4 })).toBe(2);
    expect(damageThrough({ basicDamage: 20, cover: 14, targetDr: 4, armorDivisor: 2 })).toBe(4);
  });

  it("stops entirely at cover it cannot beat", () => {
    expect(damageThrough({ basicDamage: 10, cover: 14 })).toBe(0);
  });

  /** "When you inflict piercing, impaling, or tight-beam burning damage with a
   * ranged attack." */
  it("only happens to the damage types that drill", () => {
    expect(canOverpenetrate({ type: "pi", ranged: true })).toBe(true);
    expect(canOverpenetrate({ type: "imp", ranged: true })).toBe(true);
    expect(canOverpenetrate({ type: "cut", ranged: true })).toBe(false);
    expect(canOverpenetrate({ type: "cr", ranged: true })).toBe(false);
  });

  it("needs a tight beam for burning, and a ranged attack for anything", () => {
    expect(canOverpenetrate({ type: "burn", ranged: true })).toBe(false);
    expect(canOverpenetrate({ type: "burn", ranged: true, tightBeam: true })).toBe(true);
    expect(canOverpenetrate({ type: "pi", ranged: false })).toBe(false);
  });
});

describe("firing up and down a slope (Campaigns p. 408)", () => {
  /** "You are 40 yards away from your target, and 10 yards higher. Subtract 5
   * yards from effective range." */
  it("shortens the range by half the height you have on them", () => {
    expect(elevationRange({ groundYards: 40, elevationYards: 10 })).toBe(35);
  });

  /** "You are 40 yards away, and 10 yards lower. Add 10 yards." */
  it("lengthens it by the whole height they have on you", () => {
    expect(elevationRange({ groundYards: 40, elevationYards: -10 })).toBe(50);
  });

  /** "to a minimum of half the real ground distance" */
  it("never shortens a shot to less than half the ground distance", () => {
    expect(elevationRange({ groundYards: 40, elevationYards: 100 })).toBe(20);
  });

  /** "Ignore it entirely for beam weapons like lasers!" */
  it("leaves a laser alone", () => {
    expect(elevationRange({ groundYards: 40, elevationYards: -10, beamWeapon: true })).toBe(40);
    expect(elevationRange({ groundYards: 40, elevationYards: 30, beamWeapon: true })).toBe(40);
  });

  it("changes nothing on the flat", () => {
    expect(elevationRange({ groundYards: 40, elevationYards: 0 })).toBe(40);
  });
});

describe("striking with both hands (Campaigns p. 417)", () => {
  /** "Each attack is at -4 to hit... an extra -4 (total -8) with your off hand." */
  it("costs four with one hand and eight with the other", () => {
    expect(dualWeaponAttack({})).toMatchObject({ primary: -4, offHand: -8 });
  });

  /** "You can learn the Dual-Weapon Attack technique to reduce this penalty." */
  it("buys the shared penalty back with the technique", () => {
    expect(dualWeaponAttack({ technique: 4 })).toMatchObject({ primary: 0, offHand: -4 });
    expect(dualWeaponAttack({ technique: 2 })).toMatchObject({ primary: -2, offHand: -6 });
  });

  /** "unless you have Ambidexterity or learn Off-Hand Weapon Training" */
  it("costs an ambidextrous fighter nothing extra with either hand", () => {
    expect(dualWeaponAttack({ ambidextrous: true })).toMatchObject({ primary: -4, offHand: -4 });
    expect(dualWeaponAttack({ technique: 4, ambidextrous: true }))
      .toMatchObject({ primary: 0, offHand: 0 });
  });

  it("buys the off hand back separately with training", () => {
    expect(dualWeaponAttack({ offHandTraining: 2 })).toMatchObject({ primary: -4, offHand: -6 });
  });

  /** "If you aim both attacks at a single opponent, he defends at -1." */
  it("divides a single foe's attention", () => {
    expect(dualWeaponAttack({ sameTarget: true }).defensePenalty).toBe(-1);
    expect(Object.is(dualWeaponAttack({}).defensePenalty, 0)).toBe(true);
  });
});

describe("a drink in the face (Campaigns p. 405)", () => {
  /** "Treat liquid tossed in the face as a thrown weapon with Acc 1 and Max 3.
   * Remember the -5 to target the face!" */
  it("throws like a very short-ranged weapon", () => {
    expect(LIQUID_IN_THE_FACE).toMatchObject({ accuracy: 1, maxRangeYards: 3, faceModifier: -5 });
  });

  /** "On a critical hit, the liquid gets in the victim's eyes, blinding him
   * for 1d seconds." */
  it("blinds on a critical hit, for the seconds rolled", () => {
    expect(liquidInTheFace({ hit: true, criticalHit: true, blindRoll: 4 })).toMatchObject({
      blinded: true,
      blindSeconds: 4,
    });
  });

  /** "On any other hit, the target may defend normally." */
  it("does nothing at all to somebody who dodged it", () => {
    expect(liquidInTheFace({ hit: true, defended: true })).toMatchObject({
      flinched: false,
      blinded: false,
      defended: true,
    });
  });

  /** "If he fails to defend, he must make a Will roll to avoid flinching." */
  it("makes somebody flinch who neither dodged nor kept a straight face", () => {
    expect(liquidInTheFace({ hit: true }).flinched).toBe(true);
    expect(liquidInTheFace({ hit: true, keptComposure: true }).flinched).toBe(false);
    expect(FLINCH_PENALTY).toBe(-2);
  });

  it("does nothing on a miss", () => {
    expect(liquidInTheFace({ hit: false })).toMatchObject({ flinched: false, blinded: false });
  });
});
