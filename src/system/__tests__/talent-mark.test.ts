import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { talentsRaising } from "../../rules/talents.js";
import { talentMark } from "../sheet-v2/overview.js";

/*
 * Skills a Talent has raised are marked on the character sheet (GWorldVTT
 * #876): the name in blue and a blue arrow with the bonus, naming the talents.
 */

describe("talentsRaising", () => {
  const held = [
    { name: "Business Acumen", levels: 2 },
    { name: "Mathematical Ability", levels: 1 },
    { name: "Voice" },
    { name: "Combat Reflexes" },
    { name: "Green Thumb", talentSkills: ["Farming", "Gardening"] },
  ];

  it("names every talent that raises the skill, in the order held", () => {
    expect(talentsRaising("Accounting", held)).toEqual(["Business Acumen", "Mathematical Ability"]);
    expect(talentsRaising("Singing", held)).toEqual(["Voice"]);
    expect(talentsRaising("Gardening", held)).toEqual(["Green Thumb"]);
  });

  it("names none for a skill no talent reaches", () => {
    expect(talentsRaising("Broadsword", held)).toEqual([]);
  });
});

describe("talentMark", () => {
  it("marks a rise, with the talents named", () => {
    expect(talentMark({ talentBonus: 3, talentNames: ["Business Acumen", "Mathematical Ability"] })).toEqual({
      bonus: 3,
      talents: "Business Acumen, Mathematical Ability",
    });
    expect(talentMark({ talentBonus: 1 })).toEqual({ bonus: 1, talents: "" });
  });

  it("marks nothing where no Talent raised the skill", () => {
    expect(talentMark({ talentBonus: 0, talentNames: ["Voice"] })).toBeNull();
    expect(talentMark({ talentBonus: -1 })).toBeNull();
    expect(talentMark(undefined)).toBeNull();
  });
});

describe("the sheet", () => {
  const read = (...path: string[]) => readFileSync(join(process.cwd(), ...path), "utf8");

  it("marks the skill on the Skills tab and on the Overview", () => {
    expect(read("templates", "actor", "v2", "tab-skills.hbs")).toContain('{{> "gworld.v2.talentMark" mark=row.talentMark}}');
    expect(read("templates", "actor", "v2", "tab-overview.hbs")).toContain('{{> "gworld.v2.talentMark" mark=skill.talentMark}}');
    expect(read("src", "system", "templates.ts")).toContain('"gworld.v2.talentMark": `systems/${SYSTEM_ID}/templates/actor/v2/talent-mark.hbs`');
  });

  it("says what raised it in words", () => {
    const lang = JSON.parse(read("lang", "en.json"));
    expect(lang.GWORLD.Skill.RaisedByTalent).toContain("{bonus}");
    expect(lang.GWORLD.Skill.RaisedByTalents).toContain("{talents}");
  });
});
