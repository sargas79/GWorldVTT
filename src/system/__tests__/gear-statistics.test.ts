import { describe, expect, it } from "vitest";

import { gearStatistics, type GearAttack } from "../sheet-v2/gear-statistics.js";

/** Labels come back as the key's last segment, so a test reads like the table. */
const L = (key: string) => key.split(".").pop() ?? key;

const lines = (block: { lines: Array<{ label: string; value: string }> }) =>
  Object.fromEntries(block.lines.map((line) => [line.label, line.value]));

describe("a firearm's row", () => {
  const pistol = {
    type: "equipment",
    system: {
      tl: "8",
      cost: 770,
      weight: 2.3,
      quality: "fine",
      material: "",
      rangedModes: [{ mount: "", weaponSt: null, reloadWeight: 0.5, ammunition: "hp" }],
    },
  };
  const attack: GearAttack = {
    ranged: true, mode: "Auto Pistol", modeIndex: 0, skillName: "Guns (Pistol)", skillLevel: 8,
    damage: "2d+2", damageType: "pi+", armorDivisor: 0.5, accuracy: 2, scopeBonus: 0, range: "160 / 1800",
    rateOfFire: 3, projectiles: 1, shotsLoaded: 12, shotsCapacity: 15, reloadSeconds: 3,
    minSt: 10, twoHanded: false, bulk: -2, recoil: 2, malfunction: 17, ammunition: "hp",
  };

  it("prints the weapon table's columns from what the sheet worked out", () => {
    const { blocks } = gearStatistics(pistol, [attack], L);
    expect(blocks.map((b) => b.title)).toEqual(["Auto Pistol"]);
    expect(lines(blocks[0]!)).toEqual({
      Damage: "2d+2 pi+ (0.5)",
      Acc: "2",
      Range: "160 / 1800",
      RoF: "3",
      Shots: "12 / 15 (3)",
      ST: "10",
      Bulk: "-2",
      Rcl: "2",
      Malf: "17",
      Ammunition: "hp",
      ReloadWeight: "0.5 lb",
      Skill: "Guns (Pistol) 8",
    });
  });

  it("marks a two-handed ST, a scope, a shotgun's projectiles and a bipod", () => {
    const rifle = { ...pistol, system: { ...pistol.system, rangedModes: [{ mount: "bipod" }] } };
    const { blocks } = gearStatistics(rifle, [{
      ...attack, twoHanded: true, scopeBonus: 2, projectiles: 9, shotsCapacity: 0, shots: "5+1(3i)", ammunition: "", reloadSeconds: null,
    }], L);
    const row = lines(blocks[0]!);
    expect(row.ST).toBe("10†B");
    expect(row.Acc).toBe("2+2");
    expect(row.RoF).toBe("3×9");
    expect(row.Shots).toBe("5+1(3i)");
    expect(row.Ammunition).toBeUndefined();
  });

  it("carries the item's own figures apart: TL, the grade, the list price", () => {
    const { lines: own } = gearStatistics({ ...pistol, system: { ...pistol.system, listCost: 700 } }, [], L);
    expect(Object.fromEntries(own.map((l) => [l.label, l.value]))).toEqual({ TechLevel: "8", Quality: "fine", ListCost: "$700" });
  });
});

describe("a melee weapon's row", () => {
  it("prints damage, reach, parry and ST with the table's marks", () => {
    const { blocks } = gearStatistics({ type: "equipment", system: {} }, [
      { ranged: false, mode: "Swing", skillName: "Broadsword", skillLevel: 12, damage: "1d+2", damageType: "cut", reach: "1", parry: 9, minSt: 10 },
      { ranged: false, mode: "Thrust", skillName: "Broadsword", skillLevel: 12, damage: "1d", damageType: "imp", armorDivisor: 2, reach: "1", parry: 9, unbalanced: true, minSt: 11, twoHanded: true },
      { ranged: false, mode: "Flail", damage: "1d+3", damageType: "cr", reach: "1", parry: null, minSt: 12, twoHanded: true, readiesAfterAttack: true },
    ], L);
    expect(blocks.map((b) => b.title)).toEqual(["Swing", "Thrust", "Flail"]);
    expect(lines(blocks[0]!)).toEqual({ Damage: "1d+2 cut", Reach: "1", Parry: "9", ST: "10", Skill: "Broadsword 12" });
    expect(lines(blocks[1]!)).toMatchObject({ Damage: "1d imp (2)", Parry: "9U", ST: "11†" });
    expect(lines(blocks[2]!)).toMatchObject({ Parry: "NoParry", ST: "12‡" });
  });
});

describe("armour and shields", () => {
  it("prints DR with its split, what it covers and the table's marks", () => {
    const { blocks } = gearStatistics({
      type: "armor",
      system: { dr: 4, drSplit: 2, drSplitAppliesTo: ["cr"], locations: ["torso", "vitals"], flexible: true, concealable: true, soleDr: 0, hardened: 1 },
    }, [], L);
    expect(blocks.map((b) => b.key)).toEqual(["armor"]);
    expect(lines(blocks[0]!)).toEqual({
      DR: "4/2 (2 Against cr)",
      Covers: "torso, vitals",
      Notes: "Flexible, Concealable",
      Hardened: "1",
    });
  });

  it("says whole body where the piece names no location, and a sole's own DR", () => {
    const { blocks } = gearStatistics({ type: "armor", system: { dr: 2, locations: [], soleDr: 5 } }, [], L);
    expect(lines(blocks[0]!)).toEqual({ DR: "2", Covers: "WholeBody", SoleDr: "5" });
  });

  it("prints a shield's DB, DR and the HP it has left", () => {
    const { blocks } = gearStatistics({ type: "shield", system: { db: 2, dr: 4, hp: 20, hpLost: 5 } }, [], L);
    expect(lines(blocks[0]!)).toEqual({ DB: "2", DR: "4", HP: "15 / 20" });
  });
});

describe("other gear", () => {
  it("prints a vehicle's row", () => {
    const { blocks } = gearStatistics({
      type: "equipment",
      system: { category: "vehicle", vehicle: { stHp: 50, handling: -1, stability: 4, ht: 11, fragility: "f", acceleration: 3, topSpeed: 30, loadedWeight: 1.5, load: 0.4, sm: 3, occupants: "1+3", dr: 5, range: 300, skill: "Driving (Automobile)" } },
    }, [], L);
    expect(lines(blocks[0]!)).toEqual({
      StHp: "50", HndSr: "-1/4", HT: "11f", Move: "3/30", LWt: "1.5", Load: "0.4", SM: "3", Occ: "1+3", DR: "5", Range: "300", Skill: "Driving (Automobile)",
    });
  });

  it("leaves out what the item does not have, rather than printing zeros", () => {
    const { blocks, lines: own } = gearStatistics({ type: "equipment", system: { cost: 5, weight: 1, quality: "good", equipmentQuality: "basic" } }, [], L);
    expect(blocks).toEqual([]);
    expect(own).toEqual([]);
  });
});
