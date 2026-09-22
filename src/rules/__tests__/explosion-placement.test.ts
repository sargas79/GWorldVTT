import { describe, expect, it } from "vitest";

import {
  INTERNAL_BLAST_WOUNDING,
  blastAt,
  blastPlacementOf,
  contactCoverDr,
  fragmentationLabel,
  fragmentationSpec,
  fragmentationStrikes,
} from "../explosions.js";
import { LARGE_AREA_LOCATIONS, largeAreaDr, largeAreaSingleLocation } from "../large-area.js";
import { scatterDistance } from "../scatter.js";

// Contact and internal explosions, typed and hot fragments (Campaigns
// pp. 414-415), large-area injury (p. 400) and a row's squared scatter
// (sargas79/GWorldVTT#595).

describe("a blast against or inside its victim", () => {
  const grenade = { rolledDamage: 9, diceOfDamage: 3, maxDamage: 18, armorDivisor: 2 };

  it("does the most its dice could to the one lying on it, through his DR as usual", () => {
    const hit = blastAt({ ...grenade, distanceYards: 4, placement: "contact" });
    expect(hit).toMatchObject({ damage: 18, direct: true, outOfRange: false, placement: "contact", ignoresDr: false, woundingModifier: null });
    // He is the one it struck: the divisor is his to suffer.
    expect(hit.armorDivisor).toBe(2);
  });

  it("never does less than was rolled, where no maximum is known", () => {
    expect(blastAt({ rolledDamage: 9, diceOfDamage: 3, distanceYards: 0, placement: "contact" }).damage).toBe(9);
  });

  it("ignores DR inside the victim and wounds at x3", () => {
    const hit = blastAt({ ...grenade, distanceYards: 7, placement: "internal" });
    expect(hit).toMatchObject({ damage: 9, direct: true, placement: "internal", ignoresDr: true, woundingModifier: INTERNAL_BLAST_WOUNDING });
    expect(INTERNAL_BLAST_WOUNDING).toBe(3);
  });

  it("is an ordinary blast without a placement", () => {
    expect(blastAt({ ...grenade, distanceYards: 2 })).toMatchObject({ damage: 1, direct: false, placement: null, ignoresDr: false });
    expect(blastAt({ ...grenade, distanceYards: 2, placement: null }).placement).toBeNull();
  });

  it("reads only the two placements from stored data", () => {
    expect(blastPlacementOf("contact")).toBe("contact");
    expect(blastPlacementOf("internal")).toBe("internal");
    expect(blastPlacementOf("")).toBeNull();
    expect(blastPlacementOf("beside")).toBeNull();
  });

  it("makes the one lying on it cover of his torso DR plus HP", () => {
    expect(contactCoverDr({ torsoDr: 4, hp: 12 })).toBe(16);
    expect(contactCoverDr({ torsoDr: -1, hp: 10 })).toBe(10);
  });
});

describe("fragments with a type, a divisor or a burn of their own", () => {
  it("reads a bare dice string as plain cutting, as it always was", () => {
    expect(fragmentationSpec({ fragmentation: "2d" })).toEqual({ dice: "2d", damageType: "cut", armorDivisor: 1, linger: null });
    expect(fragmentationLabel(fragmentationSpec({ fragmentation: "2d" })!)).toBe("[2d]");
  });

  it("finds none where there are no dice", () => {
    expect(fragmentationSpec({ fragmentation: "", fragmentationType: "cr" })).toBeNull();
    expect(fragmentationSpec(null)).toBeNull();
  });

  it("carries a type and a divisor, and prints them as a table does", () => {
    const crushing = fragmentationSpec({ fragmentation: "1d-1", fragmentationType: "cr" })!;
    expect(crushing).toMatchObject({ damageType: "cr", armorDivisor: 1 });
    expect(fragmentationLabel(crushing)).toBe("[1d-1 cr]");

    const hot = fragmentationSpec({ fragmentation: "1d", fragmentationType: "burn", fragmentationDivisor: 0.2 })!;
    expect(fragmentationLabel(hot)).toBe("[1d(0.2) burn]");
  });

  it("falls back to cutting for a type it does not know", () => {
    expect(fragmentationSpec({ fragmentation: "1d", fragmentationType: "zap" })!.damageType).toBe("cut");
  });

  it("strikes again at each interval while it lingers: six times over a minute at 10 seconds", () => {
    const hot = fragmentationSpec({ fragmentation: "1d", fragmentationType: "burn", fragmentationDivisor: 0.2, fragmentationLingerEvery: 10, fragmentationLingerFor: 60 })!;
    expect(hot.linger).toEqual({ every: 10, for: 60 });
    expect(fragmentationStrikes(hot.linger)).toBe(6);
    expect(fragmentationStrikes(null)).toBe(1);
  });

  it("does not linger on half a spec", () => {
    expect(fragmentationSpec({ fragmentation: "1d", fragmentationLingerEvery: 10 })!.linger).toBeNull();
    expect(fragmentationSpec({ fragmentation: "1d", fragmentationLingerFor: 60 })!.linger).toBeNull();
  });
});

describe("large-area injury", () => {
  it("averages the torso and the least protected exposed location, rounding up", () => {
    const result = largeAreaDr({
      torsoDr: 6,
      exposed: [
        { location: "torso", dr: 6 },
        { location: "skull", dr: 6 },
        { location: "face", dr: 1 },
        { location: "arm", dr: 4 },
      ],
    });
    expect(result).toEqual({ dr: 4, leastProtected: "face" });
  });

  it("is the torso's own DR where nothing exposed is weaker", () => {
    expect(largeAreaDr({ torsoDr: 3, exposed: [{ location: "arm", dr: 5 }] })).toEqual({ dr: 3, leastProtected: "torso" });
  });

  it("is an ordinary hit where a single location is exposed", () => {
    expect(largeAreaSingleLocation(["arm"])).toBe("arm");
    expect(largeAreaSingleLocation(["arm", "arm"])).toBe("arm");
    expect(largeAreaSingleLocation(["arm", "leg"])).toBeNull();
    expect(largeAreaSingleLocation(undefined)).toBeNull();
  });

  it("exposes every surface to a true area effect, but not the vitals under the torso", () => {
    expect(LARGE_AREA_LOCATIONS).toContain("face");
    expect(LARGE_AREA_LOCATIONS).not.toContain("vitals");
  });
});

describe("a row whose miss is always squared", () => {
  it("squares the margin as for an unseen target", () => {
    expect(scatterDistance({ margin: 3, distanceYards: 4, squared: true, directionRoll: 1 }).yards).toBe(9);
    expect(scatterDistance({ margin: 3, distanceYards: 4, directionRoll: 1 }).yards).toBe(2);
  });

  it("does not square a dodge", () => {
    expect(scatterDistance({ margin: 3, distanceYards: 4, squared: true, dodged: true, directionRoll: 1 }).yards).toBe(2);
  });
});
