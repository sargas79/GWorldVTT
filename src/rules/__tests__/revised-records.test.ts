import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The compendium records the Revised edition changes on retained pages
 * (Basic Set Revised, the same pages): a regenerated pack that lost one of
 * these would go back to the 2004 figures without any other test noticing.
 */
const packs = join(import.meta.dirname, "../../../packs-src");

interface Doc {
  name: string;
  system: Record<string, unknown> & { details?: { notes: string } };
  items?: Array<{ name: string; system: { category?: string; levels?: number } }>;
}

function load(dir: string): Doc[] {
  return readdirSync(join(packs, dir))
    .filter((f) => f.endsWith(".json"))
    .flatMap((f) => JSON.parse(readFileSync(join(packs, dir, f), "utf8")) as Doc[]);
}

function named(docs: Doc[], name: string): Doc {
  const doc = docs.find((d) => d.name === name);
  if (!doc) throw new Error(`no record called ${name}`);
  return doc;
}

describe("the Armor spell (p. 253)", () => {
  const armor = named(load("spells"), "Armor");

  /** The entry lists Shield alone; the spell table on p. 304 still prints Magery 2. */
  it("follows the entry's prerequisites: Shield, with no Magery of its own", () => {
    expect(armor.system.prerequisites).toBe("Shield");
    expect(armor.system.prerequisiteCount).toBe(1);
    expect(armor.system.mageryRequired).toBe(0);
  });

  it("says where the entry and the table disagree", () => {
    expect(armor.system.description).toContain("p. 304");
  });
});

describe("the Mage template (p. 260)", () => {
  const mage = named(load("templates"), "Mage");
  const thaumatology = (mage.system.entries as Array<{ name: string; note: string }>).find(
    (e) => e.name === "Thaumatology",
  );

  /** "Thaumatology (VH) IQ [2]-13": the template's +2 Magery is already in the level. */
  it("lists Thaumatology at IQ, not IQ-2", () => {
    expect(thaumatology?.note).toBe("(VH) IQ");
  });
});

describe("the apes and the strix (pp. 456, 461)", () => {
  const creatures = load("creatures");

  /** "Arm ST 3; Brachiator; DR 1; Ham-Fisted 1; Sharp Teeth; Semi-Upright; Wild Animal" */
  for (const ape of ["Chimpanzee", "Gorilla"]) {
    it(`gives the ${ape} the Revised traits, without Bad Grip`, () => {
      const traits = named(creatures, ape).items!.filter((i) => i.system.category !== undefined);
      expect(traits.map((i) => i.name)).toEqual([
        "Arm ST",
        "Brachiator",
        "Damage Resistance",
        "Ham-Fisted",
        "Teeth (Sharp Teeth)",
        "Semi-Upright",
        "Wild Animal",
      ]);
      expect(traits.find((i) => i.name === "Ham-Fisted")?.system.levels).toBe(1);
      expect(traits.find((i) => i.name === "Arm ST")?.system.levels).toBe(3);
    });
  }

  it("gives the strix an Air Move of 13", () => {
    expect(named(creatures, "Strix").system.details?.notes).toContain("Air Move 13");
  });
});
