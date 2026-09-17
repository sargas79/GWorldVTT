import { describe, expect, it } from "vitest";

import type { ArmorPiece } from "../armor.js";
import {
  armorLayers,
  bluntTraumaInjury,
  canBeInnerLayer,
  causesBluntTrauma,
  layeringAt,
  layeringPenalty,
  piecesAt,
  protectsAgainst,
} from "../layered-armor.js";
import {
  SHIELD_HEALTH,
  overpenetrationLocation,
  shieldCoverDr,
  shieldFallsOff,
  shieldGivesDb,
  shieldState,
  shieldTookTheBlow,
  shieldDrAgainst,
  strikeShield,
} from "../shield-damage.js";

function piece(over: Partial<ArmorPiece> = {}): ArmorPiece {
  return {
    dr: 2, drSplit: null, drSplitAppliesTo: [], locations: ["torso"],
    flexible: false, frontOnly: false, concealable: false, ...over,
  };
}

describe("armour marked for the front (Characters p. 282)", () => {
  it("protects against a blow from the front and nothing else", () => {
    const breastplate = piece({ frontOnly: true, dr: 5 });
    expect(protectsAgainst(breastplate, "front")).toBe(true);
    expect(protectsAgainst(breastplate, "side")).toBe(false);
    expect(protectsAgainst(breastplate, "back")).toBe(false);
    // No facing in play: every blow is one it is turned towards.
    expect(protectsAgainst(breastplate, null)).toBe(true);
    expect(protectsAgainst(piece(), "back")).toBe(true);
  });

  it("leaves a front-only piece out of the DR from behind", () => {
    const worn = [piece({ frontOnly: true, dr: 5 }), piece({ dr: 2, flexible: true })];
    expect(armorLayers(worn, "torso", "cut", "front").totalDr).toBe(7);
    expect(armorLayers(worn, "torso", "cut", "back").totalDr).toBe(2);
  });
});

describe("layering armour (p. 286)", () => {
  const mail = piece({ dr: 4, flexible: true, concealable: false });
  const leather = piece({ dr: 2, flexible: true, concealable: true });
  const plate = piece({ dr: 6 });

  it("only lets a flexible, concealable piece go underneath", () => {
    expect(canBeInnerLayer(leather)).toBe(true);
    expect(canBeInnerLayer(mail)).toBe(false);
    expect(canBeInnerLayer(plate)).toBe(false);
    expect(layeringAt([plate, leather], "torso")).toEqual({ layers: 2, legal: true });
    expect(layeringAt([plate, mail], "torso")).toEqual({ layers: 2, legal: false });
    expect(layeringAt([plate], "torso")).toEqual({ layers: 1, legal: true });
  });

  it("adds the DR of both layers", () => {
    expect(armorLayers([plate, leather], "torso", "cut").totalDr).toBe(8);
    expect(armorLayers([plate, leather], "torso", "cut")).toMatchObject({ rigidDr: 6, flexibleDr: 2 });
  });

  it("costs -1 to DX for an extra layer anywhere but the head", () => {
    expect(layeringPenalty([plate, leather])).toBe(-1);
    expect(layeringPenalty([plate])).toBe(0);
    // Two helmets are free.
    const helm = piece({ locations: ["skull"], dr: 4 });
    const cap = piece({ locations: ["skull"], dr: 1, flexible: true, concealable: true });
    expect(layeringPenalty([helm, cap])).toBe(0);
    // One penalty however many places are doubled up.
    const legs = piece({ locations: ["leg"], dr: 2 });
    expect(layeringPenalty([plate, leather, legs, piece({ locations: ["leg"], dr: 1, flexible: true, concealable: true })])).toBe(-1);
  });

  it("lists what covers a location, whole-body pieces included", () => {
    expect(piecesAt([piece({ locations: [] }), piece({ locations: ["leg"] })], "torso")).toHaveLength(1);
  });
});

describe("blunt trauma (Campaigns p. 379)", () => {
  it("is 1 HP per 5 crushing stopped and per 10 of the rest", () => {
    expect(bluntTraumaInjury({ reachingFlexible: 10, flexibleDr: 12, type: "cr" })).toBe(2);
    expect(bluntTraumaInjury({ reachingFlexible: 12, flexibleDr: 12, type: "cr" })).toBe(2);
    expect(bluntTraumaInjury({ reachingFlexible: 10, flexibleDr: 12, type: "cut" })).toBe(1);
    expect(bluntTraumaInjury({ reachingFlexible: 9, flexibleDr: 12, type: "imp" })).toBe(0);
  });

  it("gives none at all when a point got through", () => {
    expect(bluntTraumaInjury({ reachingFlexible: 13, flexibleDr: 12, type: "cr" })).toBe(0);
  });

  it("gives none through rigid armour, and none from burning or toxic", () => {
    expect(bluntTraumaInjury({ reachingFlexible: 10, flexibleDr: 0, type: "cr" })).toBe(0);
    expect(causesBluntTrauma("burn")).toBe(false);
    expect(causesBluntTrauma("tox")).toBe(false);
    expect(causesBluntTrauma("pi-")).toBe(true);
    expect(bluntTraumaInjury({ reachingFlexible: 10, flexibleDr: 12, type: "burn" })).toBe(0);
  });

  it("counts only what got past a rigid outer layer", () => {
    // A DR 2 rigid shell over a DR 12 vest: a 12-point mace leaves 10 at the
    // vest, which stops it and bruises for two.
    const worn = [piece({ dr: 2 }), piece({ dr: 12, flexible: true, concealable: true })];
    const layers = armorLayers(worn, "torso", "cr");
    expect(layers).toMatchObject({ rigidDr: 2, flexibleDr: 12, totalDr: 14 });
    expect(bluntTraumaInjury({ reachingFlexible: 12 - layers.rigidDr, flexibleDr: layers.flexibleDr, type: "cr" })).toBe(2);
    // Rigid over flexible, and the blow gets through both: a wound, not a bruise.
    const heavy = armorLayers([piece({ dr: 6 }), piece({ dr: 2, flexible: true, concealable: true })], "torso", "cr");
    expect(bluntTraumaInjury({ reachingFlexible: 12 - heavy.rigidDr, flexibleDr: heavy.flexibleDr, type: "cr" })).toBe(0);
  });
});

describe("Damage to Shields (Campaigns p. 484)", () => {
  it("strikes the shield when the DB made the difference", () => {
    expect(shieldTookTheBlow({ succeeded: true, margin: 1, defenseBonus: 2 })).toBe(true);
    expect(shieldTookTheBlow({ succeeded: true, margin: 2, defenseBonus: 2 })).toBe(false);
    expect(shieldTookTheBlow({ succeeded: false, margin: 0, defenseBonus: 2 })).toBe(false);
    expect(shieldTookTheBlow({ succeeded: true, margin: 0, defenseBonus: 0 })).toBe(false);
  });

  it("takes the shield's DR off, marks the rest against its HP, and lets a heavy blow through", () => {
    // A medium shield: DR 7, HP 40, cover DR 7 + 10 = 17.
    expect(shieldCoverDr(7, 40)).toBe(17);
    expect(strikeShield({ basicDamage: 5, dr: 7, hp: 40 })).toMatchObject({ shieldInjury: 0, fullKnockback: true, overpenetration: 0 });
    expect(strikeShield({ basicDamage: 12, dr: 7, hp: 40 })).toMatchObject({ stopped: 7, shieldInjury: 5, overpenetration: 0 });
    expect(strikeShield({ basicDamage: 25, dr: 7, hp: 40 })).toMatchObject({ shieldInjury: 18, overpenetration: 8 });
  });

  it("stops giving its DB once disabled, and falls off at -10xHP", () => {
    expect(SHIELD_HEALTH).toBe(12);
    expect(shieldGivesDb(shieldState(0, 40))).toBe(true);
    expect(shieldGivesDb(shieldState(30, 40))).toBe(true);
    expect(shieldGivesDb(shieldState(40, 40))).toBe(false);
    expect(shieldFallsOff(40, 40)).toBe(false);
    expect(shieldFallsOff(440, 40)).toBe(true);
  });

  it("puts a blow that punched through on the shield arm a third of the time", () => {
    expect(overpenetrationLocation(1, "skull")).toBe("arm");
    expect(overpenetrationLocation(2, "skull")).toBe("arm");
    expect(overpenetrationLocation(3, "skull")).toBe("skull");
    expect(overpenetrationLocation(6, "torso")).toBe("torso");
  });
});

describe("a Hardened shield's DR against a blow (Characters p. 47; Campaigns p. 484)", () => {
  it("steps the divisor down a level of Hardened at a time", () => {
    expect(shieldDrAgainst({ dr: 100, armorDivisor: 5 })).toBe(20);
    expect(shieldDrAgainst({ dr: 100, armorDivisor: 5, hardened: 1 })).toBe(33);
    expect(shieldDrAgainst({ dr: 100, armorDivisor: 1, hardened: 2 })).toBe(100);
  });

  it("offers nothing to a blow that ignores DR, unless Hardened brings it back", () => {
    expect(shieldDrAgainst({ dr: 100, armorDivisor: 1, ignoresDr: true })).toBe(0);
    expect(shieldDrAgainst({ dr: 100, armorDivisor: 1, ignoresDr: true, hardened: 1 })).toBe(1);
  });
});
