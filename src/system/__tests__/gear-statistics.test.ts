import { describe, expect, it } from "vitest";

import { gearStatistics, weaponTablesOf, type GearAttack } from "../sheet-v2/gear-statistics.js";

/** Labels come back as the key's last segment, so a test reads like the table. */
const L = (key: string) => key.split(".").pop() ?? key;

const lines = (block: { lines: Array<{ label: string; value: string }> }) =>
  Object.fromEntries(block.lines.map((line) => [line.label, line.value]));

/** A table row keyed by its column heading, the way the book's row reads. */
const row = (table: { columns: string[]; rows: string[][] }, index = 0) =>
  Object.fromEntries(table.columns.map((column, i) => [column, table.rows[index]![i]]));

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

  it("prints the weapon table's row under the table's columns, as a character sheet does", () => {
    const { tables, blocks } = gearStatistics({ ...pistol, system: { ...pistol.system, rangedModes: [{ ...pistol.system.rangedModes[0], shots: "15+1(3)" }] } }, [{ ...attack, shots: "15+1(3)" }], L);
    expect(blocks).toEqual([]);
    expect(tables.map((t) => t.key)).toEqual(["ranged"]);
    expect(tables[0]!.columns).toEqual(["Mode", "Damage", "Acc", "Range", "RoF", "Shots", "Lvl", "ST", "Bulk", "Rcl", "Notes"]);
    expect(row(tables[0]!)).toEqual({
      Mode: "Auto Pistol",
      Damage: "2d+2 pi+ (0.5)",
      Acc: "2",
      Range: "160 / 1800",
      RoF: "3",
      Shots: "15+1(3)",
      Lvl: "8",
      ST: "10",
      Bulk: "-2",
      Rcl: "2",
      Notes: "LoadedNote; hp; Malf 17; ReloadWeight 0.5 lb",
    });
  });

  it("marks a two-handed ST, a scope, a shotgun's projectiles and a bipod, and dashes what is not there", () => {
    const rifle = { ...pistol, system: { ...pistol.system, rangedModes: [{ mount: "bipod" }] } };
    const { tables } = gearStatistics(rifle, [{
      ...attack, twoHanded: true, scopeBonus: 2, projectiles: 9, shotsCapacity: 0, shots: "5+1(3i)", ammunition: "", reloadSeconds: null, malfunction: null, recoil: 0, skillLevel: null,
    }], L);
    const cells = row(tables[0]!);
    expect(cells.ST).toBe("10†B");
    expect(cells.Acc).toBe("2+2");
    expect(cells.RoF).toBe("3×9");
    expect(cells.Shots).toBe("5+1(3i)");
    expect(cells.Rcl).toBe("–");
    expect(cells.Lvl).toBe("–");
    expect(cells.Notes).toBe("");
  });

  it("carries the item's own figures apart: TL, the grade, the list price", () => {
    const { lines: own } = gearStatistics({ ...pistol, system: { ...pistol.system, listCost: 700 } }, [], L);
    expect(Object.fromEntries(own.map((l) => [l.label, l.value]))).toEqual({ TechLevel: "8", Quality: "fine", ListCost: "$700" });
  });
});

describe("a melee weapon's rows", () => {
  it("prints one row per mode: damage, reach, parry, level and ST with the table's marks", () => {
    const { tables } = gearStatistics({ type: "equipment", system: {} }, [
      { ranged: false, mode: "Swing", skillName: "Broadsword", skillLevel: 12, damage: "1d+2", damageType: "cut", reach: "1", parry: 9, minSt: 10 },
      { ranged: false, mode: "Thrust", skillName: "Broadsword", skillLevel: 12, damage: "1d", damageType: "imp", armorDivisor: 2, reach: "1", parry: 9, unbalanced: true, minSt: 11, twoHanded: true },
      { ranged: false, mode: "Flail", damage: "1d+3", damageType: "cr", reach: "1", parry: null, minSt: 12, twoHanded: true, readiesAfterAttack: true },
    ], L);
    expect(tables.map((t) => t.key)).toEqual(["melee"]);
    expect(tables[0]!.columns).toEqual(["Mode", "Damage", "Reach", "Parry", "Lvl", "ST", "Notes"]);
    expect(tables[0]!.rows.map((r) => r[0])).toEqual(["Swing", "Thrust", "Flail"]);
    expect(row(tables[0]!, 0)).toEqual({ Mode: "Swing", Damage: "1d+2 cut", Reach: "1", Parry: "9", Lvl: "12", ST: "10", Notes: "" });
    expect(row(tables[0]!, 1)).toMatchObject({ Damage: "1d imp (2)", Parry: "9U", ST: "11†" });
    expect(row(tables[0]!, 2)).toMatchObject({ Parry: "NoParry", ST: "12‡", Lvl: "–", Notes: "" });
  });

  it("puts a thrown weapon in both tables", () => {
    const { tables } = gearStatistics({ type: "equipment", system: {} }, [
      { ranged: false, mode: "Thrust", damage: "1d", damageType: "imp", reach: "C", parry: 8 },
      { ranged: true, mode: "Thrown", damage: "1d", damageType: "imp", accuracy: 0, range: "9 / 17", rateOfFire: 1, shots: "T(1)" },
    ], L);
    expect(tables.map((t) => t.key)).toEqual(["melee", "ranged"]);
    expect(row(tables[1]!)).toMatchObject({ Mode: "Thrown", Shots: "T(1)", Bulk: "–" });
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

  it("lists each location it covers once (#861)", () => {
    const { blocks } = gearStatistics({ type: "armor", system: { dr: 3, locations: ["torso", "torso", "vitals", "torso"] } }, [], L);
    expect(lines(blocks[0]!).Covers).toBe("torso, vitals");
  });

  it("says whole body where the piece names no location, and a sole's own DR", () => {
    const { blocks } = gearStatistics({ type: "armor", system: { dr: 2, locations: [], soleDr: 5, ablative: "none" } }, [], L);
    expect(lines(blocks[0]!)).toEqual({ DR: "2", Covers: "WholeBody", SoleDr: "5" });
  });

  it("prints a shield's DB, DR and the HP it has left", () => {
    const { blocks } = gearStatistics({ type: "shield", system: { db: 2, dr: 4, hp: 20, hpLost: 5 } }, [], L);
    expect(lines(blocks[0]!)).toEqual({ DB: "2", DR: "4", HP: "15 / 20" });
  });
});

/**
 * The sheet's own weapon table: a weapon with one mode is a row named for
 * the weapon, one with several heads its modes, as a character sheet prints
 * them.
 */
describe("the sheet's weapon tables", () => {
  const pistol = gearStatistics({ type: "equipment", system: {} }, [
    { ranged: true, mode: "attack", damage: "2d", damageType: "pi+", accuracy: 2, range: "150 / 1900", rateOfFire: 3, shots: "15+1(3)", skillLevel: 12, minSt: 9, bulk: -2, recoil: 2 },
  ], L).tables;
  const shotgun = gearStatistics({ type: "equipment", system: {} }, [
    { ranged: true, mode: "Shot", damage: "1d+1", damageType: "pi", accuracy: 3, range: "40 / 800", rateOfFire: 3, projectiles: 9, shots: "7+1(2i)", skillLevel: 13, minSt: 10, twoHanded: true, bulk: -5, recoil: 1 },
    { ranged: true, mode: "Slug", damage: "5d", damageType: "pi++", accuracy: 4, range: "100 / 1200", rateOfFire: 3, shots: "7+1(2i)", skillLevel: 13, minSt: 10, twoHanded: true, bulk: -5, recoil: 3 },
  ], L).tables;
  const sword = gearStatistics({ type: "equipment", system: {} }, [
    { ranged: false, mode: "Swing", damage: "1d+2", damageType: "cut", reach: "1", parry: 9, skillLevel: 12, minSt: 10 },
  ], L).tables;

  it("names a single-mode weapon in the Mode column, and heads a multi-mode one over its modes", () => {
    const tables = weaponTablesOf([{ name: "Auto Pistol, .40", tables: pistol }, { name: "Auto Shotgun, 12G", tables: shotgun }, { name: "Broadsword", tables: sword }]);
    expect(tables.map((t) => t.key)).toEqual(["melee", "ranged"]);
    const ranged = tables[1]!;
    expect(ranged.groups.map((g) => [g.name, g.single, g.rows.length])).toEqual([["Auto Pistol, .40", true, 1], ["Auto Shotgun, 12G", false, 2]]);
    expect(ranged.groups[0]!.rows[0]![0]).toBe("Auto Pistol, .40");
    expect(ranged.groups[1]!.rows.map((r) => r[0])).toEqual(["Shot", "Slug"]);
    expect(ranged.groups[1]!.rows[0]![4]).toBe("3×9");
    expect(tables[0]!.groups[0]!.rows[0]).toEqual(["Broadsword", "1d+2 cut", "1", "9", "12", "10", ""]);
  });

  it("leaves out a table no weapon fills", () => {
    expect(weaponTablesOf([{ name: "Broadsword", tables: sword }]).map((t) => t.key)).toEqual(["melee"]);
    expect(weaponTablesOf([])).toEqual([]);
  });
});

describe("a box of rounds", () => {
  it("prints what a weapon fires it as and what it fits", () => {
    const { blocks } = gearStatistics({ type: "equipment", system: { category: "ammunition", ammunition: { kind: "hp", fits: "9mm" } } }, [], L);
    expect(blocks.map((b) => b.key)).toEqual(["ammunition"]);
    expect(lines(blocks[0]!)).toEqual({ Kind: "hp", Fits: "9mm" });
  });

  it("says an ordinary round fits anything when it names nothing", () => {
    const { blocks } = gearStatistics({ type: "equipment", system: { category: "ammunition", ammunition: { kind: "", fits: "" } } }, [], L);
    expect(lines(blocks[0]!)).toEqual({ Kind: "none", Fits: "FitsAnything" });
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

  it("prints each Move and every fragility code of an amphibian (#634)", () => {
    const { blocks } = gearStatistics({
      type: "equipment",
      system: { category: "vehicle", vehicle: { stHp: 30, handling: 0, stability: 3, ht: 10, fragility: "xf", locomotion: "wheels", acceleration: 3, topSpeed: 25, secondLocomotion: "water", secondAcceleration: 1, secondTopSpeed: 4, loadedWeight: 2, load: 0.5, sm: 3, occupants: "1+4", dr: 4 } },
    }, [], L);
    expect(lines(blocks[0]!)).toMatchObject({ HT: "10fx", Move: "3/25", SecondMove: "1/4" });
  });

  it("leaves out what the item does not have, rather than printing zeros", () => {
    const { tables, blocks, lines: own } = gearStatistics({ type: "equipment", system: { cost: 5, weight: 1, quality: "good", equipmentQuality: "basic" } }, [], L);
    expect(tables).toEqual([]);
    expect(blocks).toEqual([]);
    expect(own).toEqual([]);
  });
});
