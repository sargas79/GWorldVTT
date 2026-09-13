import { describe, expect, it } from "vitest";

import { guidanceReport } from "../roll.js";

/**
 * What a steered or area attack tells the table (GURPS Basic Set: Campaigns
 * pp. 412-413). The rules module works these out; this is the layer that reads
 * the weapon and the range and decides there is anything to say at all.
 */
const missile = {
  guidance: "homing",
  rangeYards: 500,
  halfDamageRange: 200,
  maxRange: 2000,
  areaAttack: false,
  coneMaxWidth: 0,
};

describe("guidanceReport", () => {
  it("says nothing at all about an ordinary shot", () => {
    expect(guidanceReport({ ...missile, guidance: "" })).toBe(null);
  });

  it("counts the seconds a steered projectile spends in the air", () => {
    // 500 yards at 200 yards a second.
    expect(guidanceReport(missile)).toMatchObject({
      seconds: 3,
      hitsThisTurn: false,
      falls: false,
    });
  });

  it("arrives on the turn it was fired inside its 1/2D", () => {
    expect(guidanceReport({ ...missile, rangeYards: 150 })).toMatchObject({
      hitsThisTurn: true,
      seconds: 1,
    });
  });

  it("crashes when the target is further off than it can fly", () => {
    expect(guidanceReport({ ...missile, rangeYards: 3000 })?.falls).toBe(true);
  });

  it("reads 1/2D as speed rather than a damage threshold", () => {
    expect(guidanceReport(missile)?.speedNotDamage).toBe(true);
    expect(guidanceReport({ ...missile, guidance: "guided" })?.speedNotDamage).toBe(true);
  });

  it("ignores the firer only when the missile is homing", () => {
    expect(guidanceReport(missile)?.ignoresFirer).toBe(true);
    expect(guidanceReport({ ...missile, guidance: "guided" })?.ignoresFirer).toBe(false);
  });

  it("speaks up for an area attack that does not steer at all", () => {
    const report = guidanceReport({ ...missile, guidance: "", areaAttack: true });
    expect(report).not.toBe(null);
    expect(report?.area).toBe(true);
    expect(report?.coneMayCatch).toBe(true);
  });

  it("works the book's own cone: 5 yards over 100, three yards wide at sixty", () => {
    const report = guidanceReport({
      guidance: "",
      rangeYards: 60,
      halfDamageRange: 0,
      maxRange: 100,
      areaAttack: true,
      coneMaxWidth: 5,
    });
    expect(report?.coneYards).toBe(3);
  });

  it("spreads a yard per yard where the table gives no width", () => {
    const report = guidanceReport({
      guidance: "",
      rangeYards: 7,
      halfDamageRange: 0,
      maxRange: 100,
      areaAttack: true,
      coneMaxWidth: 0,
    });
    expect(report?.coneYards).toBe(7);
  });
});

describe("what a steered weapon asks of its firer (p. 412)", () => {
  it("makes a guided weapon be steered while it is in the air", () => {
    expect(guidanceReport({ ...missile, guidance: "guided" })?.mustSteer).toBe(true);
  });

  it("asks nothing of the firer of a homing one", () => {
    expect(guidanceReport(missile)?.mustSteer).toBe(false);
  });

  it("asks nothing on a shot that arrives the same second", () => {
    expect(guidanceReport({ ...missile, guidance: "guided", rangeYards: 150 })?.mustSteer)
      .toBe(false);
  });

  it("holds an area attack's damage up across the area", () => {
    expect(guidanceReport({ ...missile, guidance: "", areaAttack: true })?.damageHoldsUp)
      .toBe(true);
  });
});
