import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import * as parser from "../../../tools/renamed-traits.mjs";
import { RENAMED_LEVELS, RENAMED_TRAITS, currentLevelNames, currentTraitName, renamedTrait, traitBaseName } from "../trait-renames.js";

interface PackDoc {
  name: string;
  system?: { levelNames?: string[]; entries?: Array<{ name: string }>; [field: string]: unknown };
}

const pack = (file: string): PackDoc[] => JSON.parse(readFileSync(join(__dirname, "../../../packs-src", file), "utf8"));

/**
 * The Basic Set, Fourth Edition Revised (2025) renamed Slave Mentality
 * Heteronomy (moved from p. 154 to p. 138) and the top level of Shyness (p. 154),
 * Flashbacks (p. 136) and Neurological Disorder (p. 144) Overwhelming.
 */
describe("the traits the Revised edition renamed", () => {
  it("knows Slave Mentality as Heteronomy, whatever its case", () => {
    expect(renamedTrait("Slave Mentality")).toMatchObject({ to: "Heteronomy", page: 138, oldPage: 154 });
    expect(renamedTrait("  slave mentality")?.to).toBe("Heteronomy");
    expect(currentTraitName("Slave Mentality")).toBe("Heteronomy");
    expect(currentTraitName("Heteronomy")).toBe("Heteronomy");
    expect(renamedTrait("Shyness")).toBeNull();
    expect(renamedTrait(undefined)).toBeNull();
  });

  it("renames Crippling only on the three traits that had it", () => {
    for (const trait of ["Shyness", "Flashbacks", "Neurological Disorder", "Shyness 2", "Flashbacks (Mild)"]) {
      expect(currentLevelNames(trait, ["Mild", "Severe", "Crippling"])).toEqual(["Mild", "Severe", "Overwhelming"]);
    }
    expect(currentLevelNames("Bad Temper", ["Crippling"])).toEqual(["Crippling"]);
    expect(currentLevelNames("Shyness", ["Overwhelming"])).toEqual(["Overwhelming"]);
    expect(traitBaseName("Weapon Master (Broadsword) 2")).toBe("Weapon Master");
  });

  it("is the table the data-file parser uses", () => {
    expect(parser.RENAMED_TRAITS).toEqual(RENAMED_TRAITS);
    expect(parser.RENAMED_LEVELS).toEqual(RENAMED_LEVELS);
    expect(parser.renamedTrait("Slave Mentality")).toEqual(renamedTrait("Slave Mentality"));
    expect(parser.currentLevelNames("Shyness", ["Crippling"])).toEqual(["Overwhelming"]);
  });

  it("is what the compendia now say", () => {
    const disadvantages = pack("disadvantages/basic-set-disadvantages.json");
    const heteronomy = disadvantages.filter((doc) => doc.name === "Heteronomy");
    expect(heteronomy).toHaveLength(1);
    expect(heteronomy[0]?.system).toMatchObject({ category: "disadvantage", points: -40, reference: "Basic Set: Characters p. 138" });
    expect(disadvantages.some((doc) => doc.name === "Slave Mentality")).toBe(false);
    for (const name of ["Shyness", "Flashbacks", "Neurological Disorder"]) {
      const trait = disadvantages.find((doc) => doc.name === name);
      expect(trait?.system?.levelNames?.slice(-1)).toEqual(["Overwhelming"]);
    }
    expect(disadvantages.some((doc) => doc.system?.levelNames?.includes("Crippling"))).toBe(false);
    const ai = pack("templates/basic-set-templates.json").flatMap((doc) => doc.system?.entries ?? []).map((entry) => entry.name);
    expect(ai).toContain("Heteronomy");
    expect(ai).not.toContain("Slave Mentality");
  });
});
