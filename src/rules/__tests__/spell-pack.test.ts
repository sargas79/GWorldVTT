import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { normalizeSkillName } from "../skills.js";
import { parsePrerequisites, SPELL_CLASSES } from "../magic.js";
// The tool is plain JavaScript run by node, but its text parsers decide what
// the pack says a spell costs, and a wrong reading there is a wrong number
// on every sheet. Testing them here is what keeps the pack honest.
import {
  parseClass,
  parseDuration,
  parseEnergy,
  parseNeeds,
  parseSkillUsed,
  parseTime,
  reference,
  spellName,
} from "../../../tools/parse-gdf-spells.mjs";

const packDir = join(import.meta.dirname, "../../../packs-src/spells");

/** The parts of a spell record these checks read. */
interface PackedSpell {
  name: string;
  type: string;
  system: {
    colleges: string[];
    classes: string[];
    prerequisites: string;
    [key: string]: unknown;
  };
}

function loadPack(): PackedSpell[] {
  return readdirSync(packDir)
    .filter((f) => f.endsWith(".json"))
    .flatMap((f) => JSON.parse(readFileSync(join(packDir, f), "utf8")));
}

describe("the spells compendium", () => {
  const spells = loadPack();
  const names = new Set(spells.map((s) => normalizeSkillName(s.name)));
  const colleges = new Set(spells.flatMap((s) => s.system.colleges.map((c: string) => normalizeSkillName(c))));

  it("holds the Basic Set's spells", () => {
    // 93 in the spell list (p. 242) plus the seven enchantments (Campaigns
    // pp. 480-481), which cite Basic Set pages and belong with them.
    expect(spells.length).toBe(100);
    expect(spells.every((s) => s.type === "spell")).toBe(true);
  });

  /** Every prerequisite line must read under the grammar, and name things that exist. */
  it("writes every prerequisite in the grammar the sheet reads", () => {
    for (const spell of spells) {
      const clauses = parsePrerequisites(spell.system.prerequisites);
      for (const clause of clauses) {
        for (const p of clause) {
          if (p.kind === "spell") {
            expect(names.has(normalizeSkillName(p.name)), `${spell.name} needs unknown spell "${p.name}"`).toBe(true);
          }
          if (p.kind === "college") {
            expect(colleges.has(normalizeSkillName(p.college)), `${spell.name} counts unknown college "${p.college}"`).toBe(true);
          }
        }
      }
    }
  });

  it("carries only classes the model knows, and a college for every spell", () => {
    for (const spell of spells) {
      expect(spell.system.colleges.length, spell.name).toBeGreaterThan(0);
      for (const c of spell.system.classes) expect(SPELL_CLASSES).toContain(c);
    }
  });

  /** Spot checks against the book's own entries. */
  it("reads Fireball as the book prints it (p. 247)", () => {
    const fireball = spells.find((s) => s.name === "Fireball")!;
    expect(fireball.system).toMatchObject({
      colleges: ["Fire"],
      difficulty: "H",
      classes: ["missile"],
      mageryRequired: 1,
      prerequisites: "Magery 1, Create Fire, Shape Fire",
      energy: { cast: 1, castMax: null, text: "1 to Magery" },
      castingTime: { seconds: 1, text: "1 to 3 sec." },
      attack: { skill: "Innate Attack (Projectile)", damage: "1d", damageType: "burn", explosive: false, accuracy: 1, halfDamageRange: 25, maxRange: 50 },
    });
  });

  it("keeps an either/or prerequisite as alternatives (Lend Energy, p. 248)", () => {
    const lend = spells.find((s) => s.name === "Lend Energy")!;
    expect(lend.system.prerequisites).toBe("Magery 1 or Empathy (advantage)");
  });

  it("reads a resisted Area spell as both (Mass Sleep, p. 251)", () => {
    const mass = spells.find((s) => s.name === "Mass Sleep")!;
    expect(mass.system.classes).toEqual(["area"]);
    expect(mass.system.resistedBy).toBe("HT");
    expect(mass.system.prerequisites).toBe("Sleep, IQ 13");
  });
});

describe("the spell parser's readings", () => {
  it("reads casting costs the ways GCA writes them", () => {
    expect(parseEnergy("2")).toEqual({ cast: 2, castMax: 2, maintain: null, text: "2" });
    expect(parseEnergy("3/1")).toEqual({ cast: 3, castMax: 3, maintain: 1, text: "3/1" });
    expect(parseEnergy("3/S")).toMatchObject({ cast: 3, maintain: 3 });
    expect(parseEnergy("2/H")).toMatchObject({ cast: 2, maintain: 1 });
    expect(parseEnergy("1 to 3")).toMatchObject({ cast: 1, castMax: 3, maintain: null });
    expect(parseEnergy("1 to Magery#")).toMatchObject({ cast: 1, castMax: null, text: "1 to Magery" });
    expect(parseEnergy("Varies ")).toEqual({ cast: null, castMax: null, maintain: null, text: "Varies" });
    expect(parseEnergy("1 to 4/S")).toMatchObject({ cast: 1, castMax: 4, maintain: null });
  });

  it("reads casting times and durations into seconds where it can", () => {
    expect(parseTime("1 sec.")).toEqual({ seconds: 1, text: "1 sec." });
    expect(parseTime("1 to 3 sec.")).toEqual({ seconds: 1, text: "1 to 3 sec." });
    expect(parseTime("5 min.")).toEqual({ seconds: 300, text: "5 min." });
    expect(parseTime("sec.=cost")).toEqual({ seconds: null, text: "sec.=cost" });
    expect(parseTime("-")).toEqual({ seconds: null, text: "" });
    expect(parseDuration("1 min.")).toEqual({ seconds: 60, text: "1 min." });
    expect(parseDuration("6 hrs.")).toEqual({ seconds: 21600, text: "6 hrs." });
    expect(parseDuration("Perm.")).toEqual({ seconds: null, text: "Permanent" });
    expect(parseDuration("Instant")).toEqual({ seconds: null, text: "Instant" });
  });

  it("reads classes and what resists them", () => {
    expect(parseClass("Regular/R-HT")).toEqual({ classes: ["regular"], resistedBy: "HT" });
    expect(parseClass("Inform./Area")).toEqual({ classes: ["information", "area"], resistedBy: "" });
    expect(parseClass("Reg./R-Will or skill")).toEqual({ classes: ["regular"], resistedBy: "Will or skill" });
    expect(parseClass("")).toEqual({ classes: ["regular"], resistedBy: "" });
  });

  it("picks the Innate Attack specialty a Missile spell is thrown with", () => {
    expect(parseSkillUsed("ST:DX-4, SK:Innate Attack (Beam)-2, SK:Innate Attack (Projectile)")).toBe("Innate Attack (Projectile)");
    expect(parseSkillUsed("ST:DX, SK:Brawling, SK:Karate | SK:Staff, ST:DX-5")).toBe("");
  });

  it("cites the page of the book being read", () => {
    expect(reference("M74, B247", "B", "Basic Set: Characters")).toBe("Basic Set: Characters p. 247");
    expect(reference("M74, B247", "M", "Magic")).toBe("Magic p. 74");
    expect(reference("", "B", "Basic Set: Characters")).toBe("Basic Set: Characters");
  });

  it("drops the blank GCA leaves in a name", () => {
    expect(spellName("Planar Summons ([Plane])")).toBe("Planar Summons");
    expect(spellName("Fireball")).toBe("Fireball");
  });

  it("turns a needs() expression into the grammar", () => {
    const lookup = {
      isSpell: (n: string) => ["Truthsayer", "Borrow Language", "Apportation", "Sleep"].includes(n),
      isSkill: (n: string) => n === "Locksmith",
      isTrait: () => false,
      isCollege: (n: string) => ["Air", "Earth"].includes(n),
    };
    expect(parseNeeds("(AD:Magery 0 | ST:Magery 0 = 1), (AD:Magery = 1, ST:Magery = 1 | ST:Magery Air = 1), 6 Air", lookup))
      .toBe("Magery 1, 6 Air spells");
    expect(parseNeeds("((Truthsayer | Borrow Language))", lookup)).toBe("Truthsayer or Borrow Language");
    expect(parseNeeds("Sleep, ST:IQ = 13", lookup)).toBe("Sleep, IQ 13");
    expect(parseNeeds("Apportation | Locksmith", lookup)).toBe("Apportation or Locksmith (skill)");
    expect(parseNeeds("((AD:Magery 0 | ST:Magery 0 = 1), AD:Magery = 1 | AD:Empathy)", lookup)).toBe("Magery 1 or Empathy (advantage)");
    expect(parseNeeds("Enchant, 12 Spells, 10 Colleges", { ...lookup, isSpell: () => true })).toBe("Enchant, 12 spells, spells from 10 colleges");
    expect(parseNeeds("", lookup)).toBe("");
  });
});
