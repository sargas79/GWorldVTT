import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

// The tool is plain JavaScript run by node, but its readers decide what the
// pack says a weapon does and what a piece of armour is marked with, and a
// wrong reading there is a wrong number on every sheet.
import {
  alternatives,
  legalityClass,
  parseDamage,
  parseDr,
  parseMinSt,
  parseShieldStats,
} from "../../../tools/parse-gdf.mjs";

const packDir = join(import.meta.dirname, "../../../packs-src/equipment");

/** A mode as the pack writes it, read loosely: the checks name the fields they read. */
type Mode = Record<string, unknown> & { name?: string; unreadyAfterAttack?: boolean };

interface Packed {
  name: string;
  type: string;
  system: Record<string, unknown> & {
    lc?: number | null;
    flexible?: boolean;
    weaponClass?: string;
    quality?: string;
    listCost?: number;
    cost?: number;
    meleeModes?: Mode[];
    rangedModes?: Mode[];
  };
}

function loadPack(file: string): Packed[] {
  return JSON.parse(readFileSync(join(packDir, file), "utf8"));
}

describe("reading the ST column (Characters p. 270)", () => {
  it("reads the figure, the daggers and the mount marks", () => {
    expect(parseMinSt("10")).toEqual({
      minSt: 10,
      twoHanded: false,
      unreadyAfterAttack: false,
      mount: "",
    });
    expect(parseMinSt("12†")).toEqual({
      minSt: 12,
      twoHanded: true,
      unreadyAfterAttack: false,
      mount: "",
    });
    // "‡": two hands, and unready after the swing.
    expect(parseMinSt("13‡")).toEqual({
      minSt: 13,
      twoHanded: true,
      unreadyAfterAttack: true,
      mount: "",
    });
    expect(parseMinSt("11B†")).toEqual({
      minSt: 11,
      twoHanded: true,
      unreadyAfterAttack: false,
      mount: "bipod",
    });
    expect(parseMinSt("10R†").mount).toBe("rest");
    expect(parseMinSt("20M†").mount).toBe("mounted");
    expect(parseMinSt("").minSt).toBeNull();
  });
});

describe("reading the damage column", () => {
  it("keeps a chainsaw's extra die apart from its points", () => {
    expect(parseDamage("sw+1d", "cut")?.fields).toMatchObject({
      damageBase: "sw",
      damageModifier: 0,
      damageExtraDice: 1,
      damageType: "cut",
    });
    expect(parseDamage("sw-2+1d", "cut")?.fields).toMatchObject({
      damageModifier: -2,
      damageExtraDice: 1,
    });
    expect(parseDamage("sw+4", "cr")?.fields).toMatchObject({
      damageModifier: 4,
      damageExtraDice: 0,
    });
  });

  it("reads 'spec.' as an attack with no damage to roll", () => {
    expect(parseDamage("", "spcl.")?.fields).toMatchObject({
      damageSpecial: true,
      damageFormula: "",
    });
    expect(parseDamage("spcl.", "")?.fields.damageSpecial).toBe(true);
  });

  it("reads the Surge modifier off a blaster and a range note off a grenade", () => {
    expect(parseDamage("3d", "burn sur")?.fields).toMatchObject({
      damageType: "burn",
      surge: true,
      damageFormula: "3d",
    });
    expect(parseDamage("HT-5", "aff (10 yd.)")?.fields).toMatchObject({
      affliction: true,
      afflictionAttribute: "HT",
      afflictionModifier: -5,
    });
  });
});

describe("reading the armour tables (Characters p. 282)", () => {
  it("keeps the flexible and front-only marks", () => {
    expect(parseDr("4/2cr*")).toMatchObject({ dr: 4, drSplit: 2, flags: "*" });
    expect(parseDr("4F")).toMatchObject({ dr: 4, flags: "F" });
    expect(parseDr("2/5sole")).toMatchObject({ dr: 2, sole: 5 });
  });

  it("reads a shield's DR and HP, and a force shield's missing HP", () => {
    expect(parseShieldStats("5/20", undefined)).toEqual({ dr: 5, hp: 20 });
    expect(parseShieldStats("1", "3")).toEqual({ dr: 1, hp: 3 });
    expect(parseShieldStats("100", "--")).toEqual({ dr: 100, hp: null });
  });

  it("reads a Legality Class or none (p. 267)", () => {
    expect(legalityClass("3")).toBe(3);
    expect(legalityClass("")).toBeNull();
    expect(legalityClass("[legalityclass]")).toBeNull();
  });
});

describe("a record with alternative readings", () => {
  it("keeps only the first reading of a bipod weapon", () => {
    const f = new Map([
      ["acc", "6+3 | 7+3"],
      ["minst", "11B† | 8B†"],
      ["mode", "w/o Bipod | w/ Bipod"],
      ["skillused", "SK:Gun!, SK:Guns (Rifle) | SK:Gun!, SK:Guns (Rifle)"],
      ["damage", "9d+1"],
    ]);
    const alts = alternatives("", f);
    expect(alts).toHaveLength(1);
    expect(alts[0]!.f.get("acc")).toBe("6+3");
    expect(alts[0]!.f.get("minst")).toBe("11B†");
    expect(alts[0]!.f.get("skillused")).toBe("SK:Gun!, SK:Guns (Rifle)");
  });

  it("makes a mode of each reading of an omni-blaster", () => {
    const f = new Map([
      ["mode", "blaster | stun"],
      ["damage", "3d | HT-3"],
      ["damtype", "burn sur | aff"],
      ["acc", "5"],
    ]);
    const alts = alternatives("", f);
    expect(alts.map((a) => a.name)).toEqual(["blaster", "stun"]);
    expect(alts[1]!.f.get("damage")).toBe("HT-3");
    expect(alts[1]!.f.get("acc")).toBe("5");
  });
});

describe("the equipment compendium", () => {
  const armor = loadPack("armor.json");
  const gear = loadPack("gear.json");
  const shields = loadPack("shields.json");
  const byName = (list: Packed[], name: string) => {
    const found = list.find((x) => x.name === name);
    if (!found) throw new Error(`${name} is not in the pack`);
    return found;
  };

  it("carries every piece's Legality Class", () => {
    expect(byName(gear, "Broadsword").system.lc).toBe(4);
    expect(byName(gear, "Assault Rifle, 5.56mm").system.lc).toBe(2);
    // "Ordinary clothing and tools normally do not require a LC."
    expect(byName(gear, "Pony").system.lc).toBeNull();
    for (const item of [...armor, ...gear, ...shields]) {
      const lc = item.system.lc;
      expect(lc === null || (typeof lc === "number" && lc >= 0 && lc <= 4)).toBe(true);
    }
  });

  it("marks flexible and front-only armour as the tables do", () => {
    expect(byName(armor, "Mail Hauberk").system.flexible).toBe(true);
    expect(byName(armor, "Bronze Breastplate").system).toMatchObject({
      flexible: false,
      frontOnly: true,
    });
    expect(byName(armor, "Boots").system).toMatchObject({ flexible: true, concealable: true });
    expect(armor.filter((a) => a.system.flexible).length).toBeGreaterThan(40);
  });

  it("gives a shield its DR and HP (p. 287)", () => {
    expect(byName(shields, "Medium Shield").system).toMatchObject({ db: 2, dr: 7, hp: 40 });
    expect(byName(shields, "Light Cloak").system).toMatchObject({ dr: 1, hp: 3 });
    expect(byName(shields, "Force Shield").system).toMatchObject({ dr: 100, hp: null });
  });

  it("reads the weapons the old parser lost", () => {
    const sniper = byName(gear, "Sniper Rifle, .338").system.rangedModes?.[0];
    expect(sniper).toMatchObject({
      accuracy: 6,
      scopeBonus: 3,
      minSt: 11,
      mount: "bipod",
      skill: "Guns (Rifle)",
    });
    expect(byName(gear, "Chainsaw").system.meleeModes?.[0]).toMatchObject({
      damageBase: "sw",
      damageExtraDice: 1,
      unreadyAfterAttack: true,
      twoHanded: true,
    });
    expect(byName(gear, "Large Net").system.rangedModes?.[0]?.damageSpecial).toBe(true);
    expect(byName(gear, "Omni-Blaster Pistol").system.rangedModes?.map((m) => m.name)).toEqual([
      "blaster",
      "stun",
    ]);
    expect(byName(gear, "Blaster Pistol").system.rangedModes?.[0]?.surge).toBe(true);
    // A goat's foot cocks a crossbow; it attacks nobody.
    expect(byName(gear, "Goat's Foot").system.rangedModes).toEqual([]);
  });

  it("records the class each weapon's quality is priced in (p. 274)", () => {
    expect(byName(gear, "Broadsword").system.weaponClass).toBe("sword");
    expect(byName(gear, "Large Knife").system.weaponClass).toBe("sword");
    expect(byName(gear, "Axe").system.weaponClass).toBe("cutting");
    expect(byName(gear, "Quarterstaff").system.weaponClass).toBe("crushing");
    expect(byName(gear, "Assault Rifle, 5.56mm").system.weaponClass).toBe("firearm");
    expect(byName(gear, "Longbow").system.weaponClass).toBe("bow");
    // The table's price buys good quality, and is kept as the list price.
    const sword = byName(gear, "Broadsword").system;
    expect(sword.quality).toBe("good");
    expect(sword.listCost).toBe(sword.cost);
  });

  it("marks the ‡ weapons as unready after a swing (p. 270)", () => {
    for (const name of ["Halberd", "Great Axe", "Maul"]) {
      expect(byName(gear, name).system.meleeModes?.some((m) => m.unreadyAfterAttack)).toBe(true);
    }
    expect(byName(gear, "Broadsword").system.meleeModes?.some((m) => m.unreadyAfterAttack)).toBe(
      false,
    );
  });
});
