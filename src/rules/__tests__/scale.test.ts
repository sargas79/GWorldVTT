import { describe, expect, it } from "vitest";

import {
  divisorOf,
  drivingAttackPenalty,
  multipliedDice,
  occupantMayDodge,
  scaleDamage,
  scaleScore,
  unscaleScore,
  vehicleDodge,
} from "../scale.js";

describe("scaling damage (Campaigns p. 470)", () => {
  it("divides by ten and by a hundred", () => {
    expect(divisorOf("normal")).toBe(1);
    expect(divisorOf("decade")).toBe(10);
    expect(divisorOf("century")).toBe(100);
  });

  it("works the book's own tank all the way through", () => {
    // "A tank has DR 700 and 300 HP; its main gun does 6dx30(2) and its
    // machine gun does 7d. In D-scale, it would have dDR 70 and dHP 30; its
    // main gun would do 6dx3(2) and its machine gun would do 1d-1."
    expect(scaleScore(700, "decade")).toBe(70);
    expect(scaleScore(300, "decade")).toBe(30);
    // 6dx30 is 180 dice, which scales to 18d -- the book writes that as 6dx3.
    expect(scaleDamage({ damage: { dice: 6, adds: 0 }, multiplier: 30, scale: "decade" }))
      .toEqual({ dice: 18, adds: 0 });
    // 7d over ten is 0.7 of a die: "larger fractions as 1d-1."
    expect(scaleDamage({ damage: { dice: 7, adds: 0 }, scale: "decade" }))
      .toEqual({ dice: 1, adds: -1 });
  });

  it("rounds a half up", () => {
    expect(scaleScore(25, "decade")).toBe(3);
    expect(scaleScore(24, "decade")).toBe(2);
  });

  it("turns a multiplier into dice before dividing anything", () => {
    // "Convert damage multipliers to dice first; e.g., 6dx25 becomes 150d,
    // which scales to 15d."
    expect(multipliedDice(6, 25)).toBe(150);
    expect(scaleDamage({ damage: { dice: 6, adds: 0 }, multiplier: 25, scale: "decade" }))
      .toEqual({ dice: 15, adds: 0 });
  });

  it("substitutes a small die rather than nothing, by the book's three bands", () => {
    // Under 1d: up to 0.25 is 1d-3, up to 0.5 is 1d-2, larger is 1d-1.
    expect(scaleDamage({ damage: { dice: 2, adds: 0 }, scale: "decade" })).toEqual({ dice: 1, adds: -3 });
    expect(scaleDamage({ damage: { dice: 5, adds: 0 }, scale: "decade" })).toEqual({ dice: 1, adds: -2 });
    expect(scaleDamage({ damage: { dice: 9, adds: 0 }, scale: "decade" })).toEqual({ dice: 1, adds: -1 });
  });

  it("leaves ordinary scale alone", () => {
    expect(scaleDamage({ damage: { dice: 2, adds: 1 }, scale: "normal" })).toEqual({ dice: 2, adds: 1 });
    expect(scaleScore(37, "normal")).toBe(37);
  });

  it("carries what is left back out afterwards", () => {
    // "After the battle, multiply remaining HP by 10 or 100."
    expect(unscaleScore(22, "decade")).toBe(220);
    expect(unscaleScore(3, "century")).toBe(300);
  });
});

describe("fighting from a vehicle (p. 469)", () => {
  it("works the book's own motorcyclist", () => {
    // "a biker with Driving (Motorcycle)-14 on a motorcycle with Handling +1
    // has a Dodge of 14/2 + 1 = 8."
    expect(vehicleDodge({ controlSkill: 14, handling: 1 })).toBe(8);
  });

  it("rounds the halved skill down, and takes a bad Handling off", () => {
    expect(vehicleDodge({ controlSkill: 13, handling: 0 })).toBe(6);
    expect(vehicleDodge({ controlSkill: 12, handling: -2 })).toBe(4);
  });

  it("does not dodge with nobody at the wheel", () => {
    expect(vehicleDodge({ controlSkill: null, handling: 2 })).toBe(null);
  });

  it("costs a driver two, or their weapon's Bulk if that is worse", () => {
    expect(drivingAttackPenalty({ kind: "handheld", bulk: -1 })).toBe(-2);
    expect(drivingAttackPenalty({ kind: "handheld", bulk: -2 })).toBe(-2);
    expect(drivingAttackPenalty({ kind: "handheld", bulk: -6 })).toBe(-6);
  });

  it("costs nothing for a mounted gun, a ram or a swing from the saddle", () => {
    // "Do not apply this penalty to mounted weapon attacks, ramming attempts,
    // or vehicular melee attacks."
    expect(drivingAttackPenalty({ kind: "mounted", bulk: -6 })).toBe(0);
    expect(drivingAttackPenalty({ kind: "ramming", bulk: -6 })).toBe(0);
    expect(drivingAttackPenalty({ kind: "vehicularMelee", bulk: -6 })).toBe(0);
  });

  it("lets a loose passenger dodge what was aimed at them, and nothing else", () => {
    expect(occupantMayDodge({ strappedIn: false, targeted: true })).toBe(true);
    // "no defense against stray shots or attacks that penetrate the vehicle."
    expect(occupantMayDodge({ strappedIn: false, targeted: false })).toBe(false);
    expect(occupantMayDodge({ strappedIn: true, targeted: true })).toBe(false);
  });
});
