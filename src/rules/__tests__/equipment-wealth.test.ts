import { describe, expect, it } from "vitest";

import {
  MONEY_PER_POINT,
  SIGNATURE_GEAR_PER_POINT,
  averageStartingWealth,
  clothingCost,
  purchase,
  equipmentQualityCost,
  equipmentQualityModifier,
  toolModifier,
  skillEquipmentModifier,
  toolsForSkill,
  pointsForMoney,
  signatureGearPoints,
  signatureGearValue,
} from "../wealth.js";
import { bestTool } from "../tech-level.js";

describe("trading points for money (Characters p. 26)", () => {
  it("gives 10% of the campaign's average starting wealth a point", () => {
    expect(MONEY_PER_POINT).toBe(0.1);
    // TL3 starts at $1,000, so a point is $100.
    expect(pointsForMoney(1, 3)).toBe(100);
    expect(pointsForMoney(5, 3)).toBe(500);
    expect(pointsForMoney(5, 8)).toBe(10000);
    expect(pointsForMoney(-2, 3)).toBe(0);
  });

  it("reads the average, not what this character is worth", () => {
    expect(averageStartingWealth(3)).toBe(1000);
    expect(averageStartingWealth(8)).toBe(20000);
  });
});

describe("Signature Gear (p. 85)", () => {
  it("gives goods worth half the average starting wealth a point", () => {
    expect(SIGNATURE_GEAR_PER_POINT).toBe(0.5);
    expect(signatureGearValue(1, 3)).toBe(500);
    expect(signatureGearValue(4, 3)).toBe(2000);
    expect(signatureGearValue(2, 8)).toBe(20000);
  });

  it("counts the points put into the trait", () => {
    expect(signatureGearPoints([{ name: "Signature Gear", levels: 4 }])).toBe(4);
    expect(signatureGearPoints([{ name: "Combat Reflexes" }])).toBe(0);
    // A trait with no level is one level.
    expect(signatureGearPoints([{ name: "signature gear" }])).toBe(1);
  });
});

describe("clothing by Status (p. 266)", () => {
  it("prices each article off the monthly cost of living", () => {
    // Status 0 lives on $600 a month.
    expect(clothingCost(100, 0)).toBe(600);
    expect(clothingCost(20, 0)).toBe(120);
    expect(clothingCost(30, 0)).toBe(180);
    expect(clothingCost(40, 0)).toBe(240);
    expect(clothingCost(10, 0)).toBe(60);
  });

  it("uses full Status for a wardrobe and caps one outfit at Status 3", () => {
    // Status 5 lives on $600,000 a month; a wardrobe costs all of it.
    expect(clothingCost(100, 5)).toBe(600000);
    // One outfit is priced as Status 3, whose cost of living is $12,000.
    expect(clothingCost(20, 5)).toBe(2400);
    expect(clothingCost(20, 3)).toBe(2400);
    expect(clothingCost(20, 2)).toBe(600);
  });
});

describe("Equipment Modifiers (Campaigns p. 345)", () => {
  it("penalises no equipment and improvised equipment, harder for a technological skill", () => {
    expect(equipmentQualityModifier("none", { technological: true })).toBe(-10);
    expect(equipmentQualityModifier("none")).toBe(-5);
    expect(equipmentQualityModifier("improvised", { technological: true })).toBe(-5);
    expect(equipmentQualityModifier("improvised")).toBe(-2);
  });

  it("gives nothing for basic, +1 good, +2 fine, and TL/2 for the best there is", () => {
    expect(equipmentQualityModifier("basic")).toBe(0);
    expect(equipmentQualityModifier("good")).toBe(1);
    expect(equipmentQualityModifier("fine")).toBe(2);
    expect(equipmentQualityModifier("best", { tl: 8 })).toBe(4);
    expect(equipmentQualityModifier("best", { tl: 12 })).toBe(6);
    // "minimum +2"
    expect(equipmentQualityModifier("best", { tl: 3 })).toBe(2);
  });

  it("prices good at five times basic and fine at twenty, and sells no other grade", () => {
    expect(equipmentQualityCost("basic")).toBe(1);
    expect(equipmentQualityCost("good")).toBe(5);
    expect(equipmentQualityCost("fine")).toBe(20);
    expect(equipmentQualityCost("best")).toBeNull();
    expect(equipmentQualityCost("improvised")).toBeNull();
  });
});

describe("a tool's stated modifier (since API 1.63.0)", () => {
  it("uses the stated number where there is one, the grade otherwise", () => {
    expect(toolModifier("basic", -2)).toBe(-2);
    expect(toolModifier("fine", null)).toBe(2);
    expect(toolModifier("best", undefined, { tl: 10 })).toBe(5);
    expect(toolModifier("good", 0)).toBe(0);
  });
});

describe("a skill's equipment line, with no tool carried (since API 1.135.0)", () => {
  it("takes the picked tool's grade where there is one", () => {
    expect(skillEquipmentModifier({ quality: 1 }, { needsEquipment: true, technological: true })).toBe(1);
    expect(skillEquipmentModifier({ quality: -2 }, { needsEquipment: false, technological: false })).toBe(-2);
  });

  it("takes the no-equipment figure where the skill needs equipment and none serves it (Campaigns p. 345)", () => {
    expect(skillEquipmentModifier(null, { needsEquipment: true, technological: true })).toBe(-10);
    expect(skillEquipmentModifier(null, { needsEquipment: true, technological: false })).toBe(-5);
  });

  it("reads improvised gear as better than none", () => {
    const none = skillEquipmentModifier(null, { needsEquipment: true, technological: false });
    const improvised = skillEquipmentModifier({ quality: toolModifier("improvised", null) }, { needsEquipment: true, technological: false });
    expect(improvised).toBeGreaterThan(none);
  });

  it("gives nothing where the skill doesn't need equipment", () => {
    expect(skillEquipmentModifier(null, { needsEquipment: false, technological: true })).toBe(0);
    expect(skillEquipmentModifier(undefined, { needsEquipment: false, technological: false })).toBe(0);
  });
});

describe("a tool graded for the skill it is used with (since API 1.145.0)", () => {
  it("reads improvised gear as -5 for a technological skill and -2 for another (Campaigns p. 345)", () => {
    const kit = [{ quality: "improvised" as const, techLevel: null, id: "kit" }];
    expect(toolsForSkill(kit, { technological: true, tl: 8 })).toEqual([{ quality: -5, techLevel: null, id: "kit" }]);
    expect(toolsForSkill(kit, { technological: false, tl: 8 })).toEqual([{ quality: -2, techLevel: null, id: "kit" }]);
    // The same item, the skill's line once picked.
    const technological = bestTool(toolsForSkill(kit, { technological: true, tl: 8 }), { skillTechLevel: 8, iqBased: true });
    expect(skillEquipmentModifier(technological, { needsEquipment: true, technological: true })).toBe(-5);
    const other = bestTool(toolsForSkill(kit, { technological: false, tl: 8 }), { skillTechLevel: null, iqBased: false });
    expect(skillEquipmentModifier(other, { needsEquipment: true, technological: false })).toBe(-2);
  });

  it("keeps a stated modifier, and reads the best grade against the character's TL", () => {
    expect(toolsForSkill([{ quality: "improvised", modifier: -1, techLevel: 8 }], { technological: true, tl: 8 })[0]!.quality).toBe(-1);
    expect(toolsForSkill([{ quality: "best", techLevel: 8 }], { technological: true, tl: 10 })[0]!.quality).toBe(5);
    expect(toolsForSkill([{ quality: "good", modifier: null, techLevel: 8 }], { technological: false, tl: 8 })[0]!.quality).toBe(1);
  });

  it("leaves a tool of another TL to be weighed against the skill's (Characters p. 168)", () => {
    // A TL7 kit for a TL8 skill: -1 for the TL behind, beside its grade.
    const older = toolsForSkill([{ quality: "good", techLevel: 7, id: "old" }], { technological: true, tl: 8 });
    expect(bestTool(older, { skillTechLevel: 8, iqBased: true })).toEqual({ quality: 1, techLevel: -1, id: "old" });
    // Of an improvised kit at the skill's TL and a basic one a TL behind, the basic one is worth more.
    const both = toolsForSkill([
      { quality: "improvised", techLevel: 8, id: "improvised" },
      { quality: "basic", techLevel: 7, id: "basic" },
    ], { technological: true, tl: 8 });
    expect(bestTool(both, { skillTechLevel: 8, iqBased: true })?.id).toBe("basic");
    // Four TLs ahead of an IQ-based skill, it can't be used at all.
    expect(bestTool(toolsForSkill([{ quality: "fine", techLevel: 12 }], { technological: true, tl: 8 }), { skillTechLevel: 8, iqBased: true })).toBeNull();
  });
});

describe("paying for a purchase (Characters pp. 25-27)", () => {
  it("charges the price for each and says what is left", () => {
    expect(purchase({ price: 12.5, quantity: 4, money: 100 })).toEqual({
      quantity: 4,
      total: 50,
      moneyAfter: 50,
      short: 0,
    });
  });

  it("keeps to the cent rather than drifting", () => {
    expect(purchase({ price: 0.1, quantity: 3, money: 1 }).total).toBe(0.3);
    expect(purchase({ price: 0.1, quantity: 3, money: 1 }).moneyAfter).toBe(0.7);
  });

  it("says how far short the cash falls, and still lets the GM allow it", () => {
    const sum = purchase({ price: 400, quantity: 1, money: 250 });
    expect(sum.moneyAfter).toBe(-150);
    expect(sum.short).toBe(150);
  });

  it("buys whole things only, and nothing at all for a nonsense number", () => {
    expect(purchase({ price: 10, quantity: 2.7, money: 100 }).quantity).toBe(2);
    expect(purchase({ price: 10, quantity: -3, money: 100 })).toMatchObject({ quantity: 0, total: 0 });
  });
});
