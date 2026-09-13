import { describe, expect, it } from "vitest";

import {
  EXPLOSION_DAMAGE_PER_YARD,
  FLESH_WOUND_COST,
  TV_ACTION_FP,
  canAvertWithFatigue,
  cinematicExplosionInjury,
  fleshWound,
  knockbackStunPenalty,
  shovesLikeCrushing,
  worthDeclaring,
} from "../cinematic.js";
import { knockback } from "../maneuvers.js";

describe("cinematic explosions (Campaigns p. 417)", () => {
  it("does a token point a yard and nothing else", () => {
    expect(EXPLOSION_DAMAGE_PER_YARD).toBe(1);
    expect(cinematicExplosionInjury(4)).toBe(4);
    // A blast that did not move him did not hurt him either.
    expect(cinematicExplosionInjury(0)).toBe(0);
    expect(cinematicExplosionInjury(-2)).toBe(0);
  });
});

describe("cinematic knockback (p. 417)", () => {
  it("shoves with a bullet, and only with a bullet", () => {
    expect(shovesLikeCrushing("pi")).toBe(true);
    expect(shovesLikeCrushing("pi-")).toBe(true);
    expect(shovesLikeCrushing("pi++")).toBe(true);
    expect(shovesLikeCrushing("imp")).toBe(false);
    expect(shovesLikeCrushing("cut")).toBe(false);
    expect(shovesLikeCrushing("cr")).toBe(false);
  });

  it("makes a rifle bullet throw a man as a club would", () => {
    const ordinary = knockback({ basicDamage: 16, type: "pi", penetratedDr: true, targetStrength: 10 });
    const cinematic = knockback({
      basicDamage: 16, type: "pi", penetratedDr: true, targetStrength: 10, cinematic: true,
    });
    expect(ordinary.yards).toBe(0);
    // 16 damage against ST-2 of 8 is two full yards.
    expect(cinematic.yards).toBe(2);
    expect(cinematic.fallRollPenalty).toBe(-1);
  });

  it("leaves an impaling spear alone even when the rule is on", () => {
    expect(knockback({ basicDamage: 16, type: "imp", penetratedDr: true, targetStrength: 10, cinematic: true }).yards)
      .toBe(0);
  });

  it("costs an IQ roll at -1 a yard, counting the first", () => {
    expect(knockbackStunPenalty(1)).toBe(-1);
    expect(knockbackStunPenalty(3)).toBe(-3);
    expect(knockbackStunPenalty(0)).toBe(0);
  });
});

describe("flesh wounds (p. 417)", () => {
  it("leaves a single point of whatever it was", () => {
    expect(fleshWound(11)).toEqual({ taken: 1, ignored: 10 });
    expect(FLESH_WOUND_COST).toBe(1);
  });

  it("is not worth a character point for a scratch", () => {
    expect(fleshWound(1)).toEqual({ taken: 1, ignored: 0 });
    expect(worthDeclaring(1)).toBe(false);
    expect(worthDeclaring(0)).toBe(false);
    expect(worthDeclaring(2)).toBe(true);
  });
});

describe("TV action violence (p. 417)", () => {
  const lethal = { delivery: "ranged", damageType: "pi" } as const;

  it("buys a failed defense against gunfire for a point of fatigue", () => {
    expect(TV_ACTION_FP).toBe(1);
    expect(canAvertWithFatigue(lethal)).toBe(true);
  });

  it("will not buy off a punch, a club or a thrown rock", () => {
    expect(canAvertWithFatigue({ delivery: "unarmed", damageType: "cr" })).toBe(false);
    expect(canAvertWithFatigue({ delivery: "melee", damageType: "cr" })).toBe(false);
    expect(canAvertWithFatigue({ delivery: "thrown", damageType: "cr" })).toBe(false);
    // "or no damage, such as a grapple"
    expect(canAvertWithFatigue({ delivery: "unarmed", damageType: null })).toBe(false);
  });

  it("buys off the same blow aimed at the skull or the neck", () => {
    expect(canAvertWithFatigue({ delivery: "unarmed", damageType: "cr", hitLocation: "skull" })).toBe(true);
    expect(canAvertWithFatigue({ delivery: "melee", damageType: null, hitLocation: "neck" })).toBe(true);
    expect(canAvertWithFatigue({ delivery: "melee", damageType: "cr", hitLocation: "torso" })).toBe(false);
  });

  it("buys off a sword, which is not crushing", () => {
    expect(canAvertWithFatigue({ delivery: "melee", damageType: "cut" })).toBe(true);
    expect(canAvertWithFatigue({ delivery: "melee", damageType: "imp" })).toBe(true);
  });

  it("never buys off a blow struck at his sword rather than at him", () => {
    expect(canAvertWithFatigue({ ...lethal, atPossession: true })).toBe(false);
  });
});
