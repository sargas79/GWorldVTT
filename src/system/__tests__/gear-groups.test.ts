import { describe, expect, it } from "vitest";

import { gearGroupOf, groupGear, isEquipmentCategory } from "../gear-groups.js";

const hardsuit = { type: "armor", system: {} };
const buckler = { type: "shield", system: {} };
const sword = { type: "equipment", system: { category: "misc", meleeModes: [{}] } };
const pistol = { type: "equipment", system: { category: "tool", rangedModes: [{}] } };
const lockpicks = { type: "equipment", system: { category: "tool" } };
const rations = { type: "equipment", system: { category: "consumable" } };
const rope = { type: "equipment", system: { category: "misc" } };
const unfiled = { type: "equipment", system: {} };

describe("gearGroupOf", () => {
  it("files armour and shields by their type, whatever their fields say", () => {
    expect(gearGroupOf(hardsuit)).toBe("armor");
    expect(gearGroupOf(buckler)).toBe("shield");
  });

  /** A sword filed as a tool is still a sword: the attack mode decides. */
  it("calls anything with an attack mode a weapon", () => {
    expect(gearGroupOf(sword)).toBe("weapon");
    expect(gearGroupOf(pistol)).toBe("weapon");
  });

  it("files the rest by category, and the unfiled as miscellaneous", () => {
    expect(gearGroupOf(lockpicks)).toBe("tool");
    expect(gearGroupOf(rations)).toBe("consumable");
    expect(gearGroupOf(rope)).toBe("misc");
    expect(gearGroupOf(unfiled)).toBe("misc");
    expect(gearGroupOf({ type: "equipment", system: { category: "nonsense" } })).toBe("misc");
  });
});

describe("groupGear", () => {
  it("keeps the tab's order and leaves out empty groups", () => {
    const groups = groupGear([rope, lockpicks, sword, hardsuit, rations]);
    expect(groups.map((g) => g.group)).toEqual(["armor", "weapon", "tool", "consumable", "misc"]);
    expect(groups.find((g) => g.group === "misc")?.items).toEqual([rope]);
  });

  it("is empty for an empty inventory", () => {
    expect(groupGear([])).toEqual([]);
  });
});

describe("isEquipmentCategory", () => {
  it("knows the four categories and nothing else", () => {
    expect(isEquipmentCategory("weapon")).toBe(true);
    expect(isEquipmentCategory("misc")).toBe(true);
    expect(isEquipmentCategory("armor")).toBe(false);
    expect(isEquipmentCategory(undefined)).toBe(false);
  });
});
