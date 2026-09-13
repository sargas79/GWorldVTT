import { describe, expect, it } from "vitest";

import {
  BOLAS_ESCAPE_ROLLS,
  LARIAT_LENGTH_YARDS,
  MOLOTOV_MALFUNCTION,
  MOLOTOV_ON_BELT_PENALTY,
  NET_DR,
  NET_ESCAPE_ROLLS,
  bolasDefense,
  bolasEscapeModifier,
  bolasHit,
  bolasTrips,
  bottleBreaks,
  lariatHold,
  lariatReadyTurns,
  molotovEffect,
  molotovLanding,
  mustBeCutFree,
  netEscapeTarget,
} from "../entangling.js";

describe("bolas (Campaigns p. 410)", () => {
  it("cannot be parried except by a blade, which ruins it", () => {
    expect(bolasDefense({ defense: "dodge" }).allowed).toBe(true);
    expect(bolasDefense({ defense: "block" }).allowed).toBe(true);
    // "if he tries to parry, the bolas hits his parrying arm."
    expect(bolasDefense({ defense: "parry" }))
      .toEqual({ allowed: false, snaresTheArm: true, cutsTheCords: false });
    // "A successful parry with a cutting weapon cuts the cords."
    expect(bolasDefense({ defense: "parry", cuttingWeapon: true }))
      .toEqual({ allowed: true, snaresTheArm: false, cutsTheCords: true });
  });

  it("takes three rolls to get out of, and longer for an animal", () => {
    expect(BOLAS_ESCAPE_ROLLS).toBe(3);
    expect(bolasEscapeModifier("hands")).toBe(0);
    expect(bolasEscapeModifier("paws")).toBe(-3);
    expect(bolasEscapeModifier("hooves")).toBe(-6);
  });

  it("does something different to each part it wraps around", () => {
    expect(bolasHit("arm")).toBe("disarms");
    expect(bolasHit("weapon")).toBe("disarms");
    expect(bolasHit("leg")).toBe("trips");
    expect(bolasHit("torso")).toBe("entangles");
    expect(bolasHit("neck")).toBe("neck");
  });

  it("trips only somebody who was running", () => {
    expect(bolasTrips(true)).toBe(true);
    expect(bolasTrips(false)).toBe(false);
  });
});

describe("lariats (p. 410)", () => {
  it("takes a turn per five yards to gather up after a miss", () => {
    expect(LARIAT_LENGTH_YARDS).toBe(10);
    expect(lariatReadyTurns()).toBe(2);
    expect(lariatReadyTurns(20)).toBe(4);
  });

  it("is a contest of strength for an arm, and five worse round the neck", () => {
    expect(lariatHold({ location: "arm" }))
      .toMatchObject({ contestModifier: 0, suffocates: false, rollsToStand: false });
    expect(lariatHold({ location: "neck" }))
      .toMatchObject({ contestModifier: -5, suffocates: true });
  });

  it("is a roll to stay upright for a foot, and not a contest at all", () => {
    const standing = lariatHold({ location: "foot" });
    expect(standing).toMatchObject({ rollsToStand: true, contestModifier: 0 });
    expect(standing.fallDamage).toEqual({ dice: 1, adds: -4 });

    // "He rolls at -4 if he was running... or 1d-2 if he was running."
    const running = lariatHold({ location: "foot", running: true });
    expect(running).toMatchObject({ rollsToStand: true, contestModifier: -4 });
    expect(running.fallDamage).toEqual({ dice: 1, adds: -2 });
  });
});

describe("nets (p. 411)", () => {
  it("rolls DX-4 three times, and better out of a small one", () => {
    expect(NET_ESCAPE_ROLLS).toBe(3);
    expect(netEscapeTarget({ dexterity: 12 })).toBe(8);
    expect(netEscapeTarget({ dexterity: 12, small: true })).toBe(11);
    // "Animals roll at an extra -2, as do humans with only one hand available."
    expect(netEscapeTarget({ dexterity: 12, oneHanded: true })).toBe(6);
  });

  it("must be cut off somebody who has failed three times running", () => {
    expect(mustBeCutFree(2)).toBe(false);
    expect(mustBeCutFree(3)).toBe(true);
  });

  it("is a diffuse object with a single point of DR", () => {
    expect(NET_DR).toBe(1);
  });
});

describe("Molotov cocktails (p. 411)", () => {
  it("fails on a twelve, whatever the tech level", () => {
    expect(MOLOTOV_MALFUNCTION).toBe(12);
  });

  it("bounces off anybody without hard armour to break on", () => {
    // "the bottle bursts upon hitting a hard surface (anything with DR 3+)."
    expect(molotovLanding({ defense: "none", targetDr: 4 })).toBe("target");
    expect(molotovLanding({ defense: "none", targetDr: 1 })).toBe("unbroken");
    expect(molotovLanding({ defense: "dodge", targetDr: 9 })).toBe("ground");
    expect(molotovLanding({ defense: "block", targetDr: 9 })).toBe("shield");
  });

  it("burns for three dice and then one a second on whoever it burst on", () => {
    const hit = molotovEffect({ landing: "target" });
    expect(hit.initial).toEqual({ dice: 3, adds: 0 });
    expect(hit.perSecond).toEqual({ dice: 1, adds: 0 });
    // "Most DR protects at only 1/5 value; sealed armor protects completely."
    expect(hit.drFraction).toBeCloseTo(0.2);
    expect(molotovEffect({ landing: "target", sealed: true }).drFraction).toBe(1);
  });

  it("burns the ground for a yard around, a little less fiercely", () => {
    const ground = molotovEffect({ landing: "ground" });
    expect(ground).toMatchObject({ initial: null, radiusYards: 1 });
    expect(ground.perSecond).toEqual({ dice: 1, adds: -1 });
  });

  it("does nothing at all when it fails to break", () => {
    expect(molotovEffect({ landing: "unbroken" }))
      .toMatchObject({ initial: null, radiusYards: 0 });
  });

  it("breaks on your belt more often than not when you fall", () => {
    // "Roll 1d for each bottle if you fall; it breaks on a roll of 1-4."
    expect(bottleBreaks(4)).toBe(true);
    expect(bottleBreaks(5)).toBe(false);
    expect(MOLOTOV_ON_BELT_PENALTY).toBe(-5);
  });
});
