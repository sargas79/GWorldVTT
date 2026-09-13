import { describe, expect, it } from "vitest";

import {
  collectionWeight,
  finalCaster,
  grimoireBonus,
  grimoirePrice,
  masteredRitual,
  ritualIdentity,
  ritualMasteryBonus,
  workingTogetherPenalty,
} from "../ritual-tricks.js";

const definition = {
  afflictionPercent: 0, area: false, healing: false, metaMagic: false, speed: false, bonusScope: "" as const,
  damage: true, damageKind: "standard" as const, damageDelivery: "malediction" as const, damageType: "burn",
};
const combustion = { effects: [{ path: "Energy" as const, effect: "create" as const, greater: true }], definition };

describe("what makes a ritual the same ritual (Monster Hunters 1 p. 39)", () => {
  it("ignores what may vary and the order effects were written in", () => {
    const two = [{ path: "Body" as const, effect: "strengthen" as const, greater: false }, { path: "Chance" as const, effect: "destroy" as const, greater: false }];
    expect(ritualIdentity({ effects: two, definition })).toBe(ritualIdentity({ effects: [...two].reverse(), definition }));
  });

  it("changes when Brad's burning goes external, crushing, or over an area", () => {
    const same = ritualIdentity(combustion);
    expect(ritualIdentity({ ...combustion, definition: { ...definition, damageDelivery: "external" } })).not.toBe(same);
    expect(ritualIdentity({ ...combustion, definition: { ...definition, damageType: "cr" } })).not.toBe(same);
    expect(ritualIdentity({ ...combustion, definition: { ...definition, area: true } })).not.toBe(same);
  });
});

describe("Ritual Mastery (p. 25)", () => {
  const identity = ritualIdentity(combustion);

  it("reads the ritual a trait is specialized in", () => {
    expect(masteredRitual("Ritual Mastery (Spontaneous Combustion)")).toBe("Spontaneous Combustion");
    expect(masteredRitual("Ritual Adept")).toBe(null);
  });

  it("gives +2 to the mastered ritual as it was defined, and to nothing else", () => {
    const traitNames = ["Ritual Mastery (Spontaneous Combustion)"];
    expect(ritualMasteryBonus({ traitNames, ritualName: "Spontaneous Combustion", masteredAs: identity, identity })).toBe(2);
    expect(ritualMasteryBonus({ traitNames, ritualName: "Home Security", masteredAs: identity, identity })).toBe(0);
    expect(ritualMasteryBonus({ traitNames, ritualName: "Spontaneous Combustion", masteredAs: identity, identity: "changed" })).toBe(0);
    expect(ritualMasteryBonus({ traitNames, ritualName: "Spontaneous Combustion", masteredAs: "", identity })).toBe(0);
  });
});

describe("grimoires (pp. 39, 56-57)", () => {
  it("give their bonus, reduced for a dead language read Accented or Broken", () => {
    const book = { bonus: 5, deadLanguage: true, encrypted: false, decoded: false };
    expect(grimoireBonus({ ...book, comprehension: "native" })).toBe(5);
    expect(grimoireBonus({ ...book, comprehension: "accented" })).toBe(4);
    expect(grimoireBonus({ ...book, comprehension: "broken" })).toBe(3);
    expect(grimoireBonus({ ...book, comprehension: "none" })).toBe(0);
  });

  it("give nothing encrypted until decoded", () => {
    expect(grimoireBonus({ bonus: 4, deadLanguage: false, comprehension: "none", encrypted: true, decoded: false })).toBe(0);
    expect(grimoireBonus({ bonus: 4, deadLanguage: false, comprehension: "none", encrypted: true, decoded: true })).toBe(4);
  });

  it("are priced from the table with -0.2 CF per option", () => {
    expect(grimoirePrice({ bonus: 4 })).toEqual({ cost: 600, weight: 3 });
    expect(grimoirePrice({ bonus: 10, deadLanguage: true, encrypted: true })).toEqual({ cost: 60000, weight: 10 });
    expect(grimoirePrice({ bonus: 1 })).toBe(null);
  });

  it("weigh as Brad's collection does: 3.9 lbs", () => {
    expect(collectionWeight([3, 4, 2])).toBe(3.9);
  });
});

describe("working together (p. 39)", () => {
  it("is -1 per caster past the first, and the highest skill rolls last", () => {
    expect([1, 2, 4].map(workingTogetherPenalty)).toEqual([0, -1, -3]);
    expect(finalCaster([12, 15, 15])).toBe(1);
  });
});
