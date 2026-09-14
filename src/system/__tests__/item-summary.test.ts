import { describe, expect, it } from "vitest";

import { summarise } from "../item-summary.js";

/**
 * The summary is what makes one row tellable from another. There are 630
 * skills, and a list of 630 bare names is not a list anyone can pick from.
 */
describe("summarise", () => {
  it("gives a skill its attribute and difficulty", () => {
    expect(summarise("skill", { attribute: "DX", difficulty: "A" })).toBe("DX/A");
  });

  it("gives a technique its prerequisite and default penalty", () => {
    expect(summarise("technique", { prerequisite: "Karate", defaultModifier: -4 })).toBe("Karate -4");
  });

  // A technique bought off a defense or an attribute (sargas79/GWorldVTT#195).
  it("names the defense or attribute a technique defaults from", () => {
    expect(summarise("technique", { prerequisite: "Judo", defaultFrom: "parry", defaultModifier: -1 })).toBe("Judo Parry -1");
    expect(summarise("technique", { prerequisite: "", defaultFrom: "dodge", defaultModifier: -2 })).toBe("Dodge -2");
    expect(summarise("technique", { prerequisite: "", defaultFrom: "ST", defaultModifier: -4 })).toBe("ST -4");
  });

  it("names a technique with no penalty by its prerequisite alone", () => {
    expect(summarise("technique", { prerequisite: "Judo", defaultModifier: 0 })).toBe("Judo");
  });

  it("prices a flat trait, signed so an advantage reads as one", () => {
    expect(summarise("trait", { points: 15 })).toBe("+15");
    expect(summarise("trait", { points: -10 })).toBe("-10");
  });

  it("prices a levelled trait per level", () => {
    expect(summarise("trait", { points: 0, pointsPerLevel: 2 })).toBe("+2/level");
  });

  /** A tabled trait is not priced by any single figure, so it shows the table. */
  it("shows a tabled trait's steps", () => {
    expect(summarise("trait", { costTable: [10, 20, 30, 50, 75] })).toBe("10/20/30/50/75");
  });

  it("prefers the table over a per-level figure, as totalPoints does", () => {
    expect(summarise("trait", { pointsPerLevel: 5, costTable: [4, 12, 12] })).toBe("4/12/12");
  });

  it("gives armour its DR and a shield its DB", () => {
    expect(summarise("armor", { dr: 4 })).toBe("DR 4");
    expect(summarise("shield", { db: 2 })).toBe("DB 2");
  });

  it("gives gear its cost and weight", () => {
    expect(summarise("equipment", { cost: 500, weight: 3 })).toBe("$500, 3 lb");
  });

  it("says nothing rather than something wrong when there is nothing to say", () => {
    expect(summarise("equipment", {})).toBe("");
    expect(summarise("skill", {})).toBe("?/?");
  });
});

describe("summarise a spell", () => {
  it("says where a spell is filed, what class it is and what it costs", () => {
    expect(
      summarise("spell", { colleges: ["Fire"], classes: ["missile"], energy: { text: "1 to Magery" } }),
    ).toBe("Fire · Missile · 1 to Magery");
  });

  it("lists every college and class the spell has", () => {
    expect(
      summarise("spell", { colleges: ["Movement", "Protection & Warning"], classes: ["information", "area"], energy: { text: "2" } }),
    ).toBe("Movement/Protection & Warning · Information/Area · 2");
  });

  it("leaves out what a spell does not say", () => {
    expect(summarise("spell", { colleges: [], classes: [], energy: { text: "" } })).toBe("");
  });
});

describe("summarise a ritual", () => {
  const casting = {
    areaRadius: 7, excludedSubjects: 0, traitsAdded: 0, traitsRemoved: 0, bonusAmount: 0, damageDice: "",
    healingDice: "", metaMagic: 0, speedYards: 0, durationStep: 9, extraMonths: 0, years: 0, extraEnergy: 0,
    rangeYards: 0, rangeKind: "yards", dimensions: 0, subjectWeight: 0, trappingsPercent: 0,
  };
  const definition = {
    afflictionPercent: 0, area: true, healing: false, metaMagic: false, speed: false, bonusScope: "",
    damage: false, damageKind: "standard", damageDelivery: "malediction",
  };

  it("names its effects as the book does and says what it costs (Monster Hunters 1 p. 37)", () => {
    const effects = [
      { path: "Spirit", effect: "control", greater: false },
      { path: "Undead", effect: "control", greater: false },
    ];
    expect(summarise("ritual", { effects, definition, casting }))
      .toBe("Lesser Control Spirit, Lesser Control Undead · 25 energy");
  });

  it("prices only the modifiers its definition uses", () => {
    const effects = [{ path: "Spirit", effect: "control", greater: false }];
    expect(summarise("ritual", { effects, definition: { ...definition, area: false }, casting }))
      .toBe("Lesser Control Spirit · 14 energy");
  });

  it("says nothing of a ritual with no effects", () => {
    expect(summarise("ritual", { effects: [], definition, casting })).toBe("");
  });
});
