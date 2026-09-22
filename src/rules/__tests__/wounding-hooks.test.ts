import { describe, expect, it } from "vitest";

import { calibreOf, gaugeBoreMm, nearestAmmunitionByCalibre } from "../ammunition.js";
import { capInjury } from "../damage.js";
import { canOverpenetrate } from "../overpenetration.js";
import { projectileLine } from "../shotguns.js";

// Hooks and fields for rules that change how a blow wounds
// (sargas79/GWorldVTT#596).

describe("a shotgun's gauge (Characters p. 279)", () => {
  it("is the bore of a lead ball weighing a pound over the gauge", () => {
    expect(gaugeBoreMm(12)).toBe(18.53);
    expect(gaugeBoreMm(10)).toBe(19.69);
    expect(gaugeBoreMm(20)).toBe(15.63);
    // The larger the gauge, the smaller the bore.
    expect(gaugeBoreMm(8)!).toBeGreaterThan(gaugeBoreMm(10)!);
  });

  it("reads a figure of 100 or more as thousandths of an inch", () => {
    expect(gaugeBoreMm(410)).toBe(10.41);
    expect(gaugeBoreMm(0)).toBeNull();
    expect(gaugeBoreMm(Number.NaN)).toBeNull();
  });

  it("is read off a weapon's name, as the Basic Set names its shotguns", () => {
    expect(calibreOf("Double Shotgun, 10G")).toBe(19.69);
    expect(calibreOf("Pump Shotgun, 12G")).toBe(18.53);
    expect(calibreOf("Auto Shotgun, 12 gauge")).toBe(18.53);
    expect(calibreOf("Coach Gun (20 ga.)")).toBe(15.63);
    expect(calibreOf("Survival Shotgun, .410")).toBe(10.41);
    expect(calibreOf("Survival Shotgun, 410 gauge")).toBe(10.41);
  });

  it("leaves names with no gauge alone", () => {
    expect(calibreOf("Assault Rifle, 5.56mm")).toBe(5.56);
    expect(calibreOf("Gatling Gun")).toBeNull();
    expect(calibreOf("Laser Rifle")).toBeNull();
  });

  it("finds a shotgun the nearest shells by bore", () => {
    const records = [
      { name: "Buckshot, 12G", fits: "Pump Shotgun, 12G", weightPerRound: 0.1 },
      { name: "Buckshot, 10G", fits: "Double Shotgun, 10G", weightPerRound: 0.12 },
      { name: "9mm", fits: "Auto Pistol, 9mm", weightPerRound: 0.03 },
    ];
    expect(nearestAmmunitionByCalibre(records as never, calibreOf("Riot Gun, 12G"))?.name).toBe("Buckshot, 12G");
  });
});

describe("overpenetration a row refuses (Campaigns p. 408)", () => {
  it("stops a shot that would otherwise go through", () => {
    expect(canOverpenetrate({ type: "pi", ranged: true })).toBe(true);
    expect(canOverpenetrate({ type: "pi", ranged: true, refused: true })).toBe(false);
    expect(canOverpenetrate({ type: "burn", ranged: true, tightBeam: true, refused: true })).toBe(false);
    expect(canOverpenetrate({ type: "pi", ranged: true, refused: false })).toBe(true);
  });
});

describe("an injury cap", () => {
  it("holds the injury to the cap and says what it kept from being taken", () => {
    expect(capInjury(9, 6)).toEqual({ injury: 6, lost: 3 });
    expect(capInjury(4, 6)).toEqual({ injury: 4, lost: 0 });
    expect(capInjury(9, 0)).toEqual({ injury: 0, lost: 9 });
  });

  it("leaves the injury alone without a cap", () => {
    expect(capInjury(9, null)).toEqual({ injury: 9, lost: 0 });
    expect(capInjury(9, undefined)).toEqual({ injury: 9, lost: 0 });
    expect(capInjury(9, Number.NaN)).toEqual({ injury: 9, lost: 0 });
    expect(capInjury(9, -2)).toEqual({ injury: 0, lost: 9 });
    expect(capInjury(9, 4.7)).toEqual({ injury: 4, lost: 5 });
  });
});

describe("a multiple-projectile shot's first hit (Campaigns p. 409)", () => {
  const line = { damage: "1d+1", damageType: "pi", armorDivisor: 1 };

  it("uses its own line for the first hit, filling blanks from the row", () => {
    expect(projectileLine({ line, firstHit: { damage: "2d", damageType: "pi+", armorDivisor: 2 }, first: true }))
      .toEqual({ damage: "2d", damageType: "pi+", armorDivisor: 2, firstHit: true });
    expect(projectileLine({ line, firstHit: { damage: " 2d ", damageType: "", armorDivisor: 0 }, first: true }))
      .toEqual({ damage: "2d", damageType: "pi", armorDivisor: 1, firstHit: true });
  });

  it("uses the row's line for every other hit, and where there is no first-hit line", () => {
    expect(projectileLine({ line, firstHit: { damage: "2d" }, first: false })).toEqual({ ...line, firstHit: false });
    expect(projectileLine({ line, firstHit: null, first: true })).toEqual({ ...line, firstHit: false });
    expect(projectileLine({ line, firstHit: { damage: "" }, first: true })).toEqual({ ...line, firstHit: false });
  });
});
