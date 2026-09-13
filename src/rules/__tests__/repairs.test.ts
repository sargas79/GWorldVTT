import { describe, expect, it } from "vitest";

import {
  ASSUMED_HEALTH,
  EXPOSURE_BONUS,
  HIRED_RATE_PER_HOUR,
  MAJOR_REPAIR_PENALTY,
  REPAIR_HOURS,
  equipmentFailureTarget,
  exposureOutcome,
  healthAfterNeglect,
  hiredTechnicianSkill,
  hitPointsRestored,
  needsMaintenance,
  priceModifier,
  repairKind,
  repairTarget,
  sparePartsCost,
} from "../repairs.js";

describe("what mending a thing takes (Campaigns p. 484)", () => {
  it("is minor while it still has hit points and major at zero or below", () => {
    expect(repairKind({ hpLost: 0, hp: 20 })).toBe("none");
    expect(repairKind({ hpLost: 5, hp: 20 })).toBe("minor");
    expect(repairKind({ hpLost: 19, hp: 20 })).toBe("minor");
    expect(repairKind({ hpLost: 20, hp: 20 })).toBe("major");
    expect(repairKind({ hpLost: 50, hp: 20 })).toBe("major");
  });

  it("is beyond repair once destroyed", () => {
    // -5xHP or a failed HT roll: "Replace it at 100% of its original cost."
    expect(repairKind({ hpLost: 120, hp: 20 })).toBe("beyondRepair");
    expect(repairKind({ hpLost: 5, hp: 20, destroyed: true })).toBe("beyondRepair");
  });

  it("takes half an hour an attempt", () => {
    expect(REPAIR_HOURS).toBe(0.5);
  });
});

describe("what the price does to the roll (p. 484)", () => {
  it("helps with cheap gear and hinders with dear", () => {
    expect(priceModifier(500)).toBe(1);
    expect(priceModifier(1000)).toBe(1);
    // The book leaves the band above $1,000 and up to $10,000 alone.
    expect(priceModifier(5000)).toBe(0);
    expect(priceModifier(50000)).toBe(-1);
    expect(priceModifier(500000)).toBe(-2);
    expect(priceModifier(2000000)).toBe(-3);
  });

  it("adds the price, the extra -2 for a major repair, and the tools", () => {
    expect(repairTarget({ skill: 12, cost: 500, kind: "minor" })).toBe(13);
    expect(repairTarget({ skill: 12, cost: 500, kind: "major" })).toBe(11);
    expect(MAJOR_REPAIR_PENALTY).toBe(-2);
    // A fine workshop is +2 under Equipment Modifiers, and the GM may add more.
    expect(repairTarget({ skill: 12, cost: 50000, kind: "minor", equipment: 2, modifier: -1 })).toBe(12);
  });

  it("gives back the margin, and never less than a point", () => {
    expect(hitPointsRestored(5)).toBe(5);
    expect(hitPointsRestored(0)).toBe(1);
    expect(hitPointsRestored(-3)).toBe(1);
  });

  it("prices spare parts at 1d times a tenth, and a technician by the hour", () => {
    expect(sparePartsCost(2000, 1)).toBe(200);
    expect(sparePartsCost(2000, 6)).toBe(1200);
    expect(HIRED_RATE_PER_HOUR).toBe(20);
    expect(hiredTechnicianSkill(1)).toBe(10);
    expect(hiredTechnicianSkill(6)).toBe(15);
  });
});

describe("gear that fails on its own (p. 485)", () => {
  it("loses a point of HT for every missed maintenance check", () => {
    expect(healthAfterNeglect(12, 0)).toBe(12);
    expect(healthAfterNeglect(12, 3)).toBe(9);
  });

  it("rolls at HT+4, off the HT it has left", () => {
    expect(equipmentFailureTarget({ health: 12 })).toBe(16);
    expect(EXPOSURE_BONUS).toBe(4);
    expect(equipmentFailureTarget({ health: 12, missedChecks: 2 })).toBe(14);
    // "+1 if the PCs take significant time out each day to clean and
    // maintain their gear; -1 or -2 if the abuse ... is unusually brutal."
    expect(equipmentFailureTarget({ health: 12, cleaned: true })).toBe(17);
    expect(equipmentFailureTarget({ health: 12, brutal: 2 })).toBe(14);
    // "If the item lacks a HT score, assume HT 10."
    expect(equipmentFailureTarget({})).toBe(ASSUMED_HEALTH + 4);
  });

  it("needs minor repairs on a failure and major on a critical one", () => {
    expect(exposureOutcome({ success: true, criticalFailure: false })).toBe("works");
    expect(exposureOutcome({ success: false, criticalFailure: false })).toBe("needsMinorRepair");
    expect(exposureOutcome({ success: false, criticalFailure: true })).toBe("needsMajorRepair");
  });

  it("spares what has no moving parts, and what is put away", () => {
    expect(needsMaintenance({ movingParts: true })).toBe(true);
    expect(needsMaintenance({ movingParts: false })).toBe(false);
    expect(needsMaintenance({ movingParts: true, inStorage: true })).toBe(false);
    expect(needsMaintenance({ movingParts: true, sealedAndUnused: true })).toBe(false);
  });
});
