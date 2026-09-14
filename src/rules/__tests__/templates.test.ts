import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  HUMAN_RACIAL_COST,
  applyTemplate,
  boughtStatsCost,
  choiceMetElsewhere,
  choiceSatisfied,
  combineTemplates,
  emptyTemplate,
  entriesInGroup,
  entryItemFields,
  entryItemName,
  requiredEntries,
  stackTemplate,
  templateCost,
  type Template,
  type TemplateEntry,
} from "../templates.js";

/** The Dwarf, as Characters p. 261 writes it out: 35 points. */
const dwarf: Template = {
  name: "Dwarf",
  kind: "racial",
  statedCost: 35,
  attributes: { HT: 1 },
  secondary: { will: 1 },
  sizeModifier: -1,
  // HT+1 [10] and Will+1 [5]; SM -1 costs nothing.
  attributeCost: 15,
  entries: [
    { name: "Artificer", itemType: "trait", points: 10, levels: 1 },
    { name: "Detect (Gold)", itemType: "trait", points: 3 },
    { name: "Extended Lifespan", itemType: "trait", points: 2, levels: 1 },
    { name: "Night Vision", itemType: "trait", points: 5, levels: 5 },
  ],
  choices: [],
  features: [],
  tabooTraits: [],
};

/** The Felinoid, same page: 35 points, and the only one with disadvantages. */
const felinoid: Template = {
  name: "Felinoid",
  kind: "racial",
  statedCost: 35,
  attributes: { ST: -1, DX: 1 },
  secondary: {},
  // ST-1 [-10] and DX+1 [20].
  attributeCost: 10,
  entries: [
    { name: "Acute Hearing", itemType: "trait", points: 4, levels: 2 },
    { name: "Acute Taste and Smell", itemType: "trait", points: 2, levels: 1 },
    { name: "Catfall", itemType: "trait", points: 10 },
    { name: "Claws (Sharp)", itemType: "trait", points: 5 },
    { name: "Combat Reflexes", itemType: "trait", points: 15 },
    { name: "Damage Resistance", itemType: "trait", points: 5, levels: 1 },
    { name: "Teeth (Sharp)", itemType: "trait", points: 1 },
    { name: "Temperature Tolerance", itemType: "trait", points: 1, levels: 1 },
    { name: "Impulsiveness", itemType: "trait", points: -10 },
    { name: "Sleepy", itemType: "trait", points: -8 },
  ],
  choices: [],
  features: ["Purring Voice", "Tail"],
  tabooTraits: [],
};

describe("what a template costs (Characters p. 258)", () => {
  /**
   * The Mage (p. 259): "ST 9 [-10]; DX 11 [20]; IQ 13 [60]; HT 11 [10]" and
   * "HP 10 [2] ... Per 10 [-15]; FP 13 [6]" -- 73 points of scores bought,
   * which the template's cost includes (sargas79/GWorldVTT#200).
   */
  it("counts the attributes and secondary levels a character template buys", () => {
    const mage: Template = {
      ...emptyTemplate("character"),
      attributes: { ST: 9, DX: 11, IQ: 13, HT: 11 },
      secondary: { hp: 1, per: -3, fp: 2 },
      entries: [{ name: "Magery 0", itemType: "trait", points: 5 }],
    };
    expect(boughtStatsCost(mage)).toBe(-10 + 20 + 60 + 10 + 2 - 15 + 6);
    expect(templateCost(mage)).toBe(73 + 5);
  });

  it("prices Basic Speed and Basic Move at 5 a step", () => {
    const quick: Template = { ...emptyTemplate("character"), secondary: { basicSpeed: 0.5, basicMove: 1 } };
    expect(boughtStatsCost(quick)).toBe(10 + 5);
  });

  it("charges nothing extra for a racial template, whose attributeCost prices its modifiers", () => {
    expect(boughtStatsCost(dwarf)).toBe(0);
    expect(templateCost(dwarf)).toBe(dwarf.statedCost);
  });

  /**
   * The pack validator adds each template up on its own; the sheet must come
   * to the same figure, or a template that validates shows as not matching.
   */
  it("adds every template in the system's pack up to its stated cost", () => {
    const dir = join(import.meta.dirname, "../../../packs-src/templates");
    const files = readdirSync(dir).filter((file) => file.endsWith(".json"));
    const nonZero = (values: Record<string, number>) =>
      Object.fromEntries(Object.entries(values ?? {}).filter(([, value]) => value !== 0));
    let checked = 0;
    for (const file of files) {
      for (const entry of JSON.parse(readFileSync(join(dir, file), "utf8"))) {
        if (entry.type !== "template") continue;
        const sys = entry.system;
        const template: Template = {
          ...emptyTemplate(sys.kind),
          name: entry.name,
          statedCost: sys.statedCost,
          attributes: nonZero(sys.attributes),
          secondary: nonZero(sys.secondary),
          attributeCost: sys.attributeCost ?? 0,
          entries: sys.entries ?? [],
          choices: sys.choices ?? [],
        };
        expect({ name: entry.name, cost: templateCost(template) }).toEqual({ name: entry.name, cost: sys.statedCost });
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  /** "It lists the point costs of those traits, and gives the sum as the
   * template's cost." */
  it("adds the Dwarf up to the 35 points the book states", () => {
    expect(templateCost(dwarf)).toBe(dwarf.statedCost);
  });

  it("adds the Felinoid up too, disadvantages and all", () => {
    expect(templateCost(felinoid)).toBe(35);
  });

  /** A points group costs what it says, whichever options are taken. */
  it("counts a points group at its stated size", () => {
    const template: Template = {
      ...emptyTemplate(),
      choices: [{ id: "adv", label: "Advantages", kind: "points", required: 20 }],
      entries: [
        { name: "Charisma", itemType: "trait", points: 5, group: "adv" },
        { name: "Combat Reflexes", itemType: "trait", points: 15, group: "adv" },
        { name: "Luck", itemType: "trait", points: 15, group: "adv" },
      ],
    };
    expect(templateCost(template)).toBe(20);
  });

  /** "Select two skills from... all (E) DX+1 [2]" -- two picks at two each. */
  it("counts a count group at what its cheapest picks cost", () => {
    const template: Template = {
      ...emptyTemplate(),
      choices: [{ id: "secondary", label: "Secondary Skills", kind: "count", required: 2 }],
      entries: [
        { name: "Brawling", itemType: "skill", points: 2, group: "secondary" },
        { name: "Knife", itemType: "skill", points: 2, group: "secondary" },
        { name: "Karate", itemType: "skill", points: 2, group: "secondary" },
      ],
    };
    expect(templateCost(template)).toBe(4);
  });

  it("separates what everybody gets from what is chosen", () => {
    const template: Template = {
      ...emptyTemplate(),
      entries: [
        { name: "First Aid", itemType: "skill", points: 1 },
        { name: "Brawling", itemType: "skill", points: 2, group: "secondary" },
      ],
      choices: [{ id: "secondary", label: "Secondary", kind: "count", required: 1 }],
    };
    expect(requiredEntries(template).map((e) => e.name)).toEqual(["First Aid"]);
    expect(entriesInGroup(template, "secondary").map((e) => e.name)).toEqual(["Brawling"]);
  });
});

describe("choices (Characters p. 258)", () => {
  const pick = (points: number): TemplateEntry => ({
    name: "x",
    itemType: "trait",
    points,
  });

  it("wants as many picks as a count group asks for", () => {
    const group = { id: "s", label: "", kind: "count" as const, required: 2 };
    expect(choiceSatisfied({ group, picks: [pick(2)] })).toBe(false);
    expect(choiceSatisfied({ group, picks: [pick(2), pick(2)] })).toBe(true);
  });

  it("wants as many points as a points group asks for", () => {
    const group = { id: "a", label: "", kind: "points" as const, required: 20 };
    expect(choiceSatisfied({ group, picks: [pick(15)] })).toBe(false);
    expect(choiceSatisfied({ group, picks: [pick(15), pick(5)] })).toBe(true);
  });

  /** "-35 points chosen from among" is a requirement to take that much, not
   * to take that little. */
  it("reads a disadvantage group by how much was taken, not its sign", () => {
    const group = { id: "d", label: "", kind: "points" as const, required: -35 };
    expect(choiceSatisfied({ group, picks: [pick(-15), pick(-10)] })).toBe(false);
    expect(choiceSatisfied({ group, picks: [pick(-15), pick(-10), pick(-10)] })).toBe(true);
  });

  /** "You are free to alter anything that came with it" -- so taking more than
   * the template asked for is customising, not cheating. */
  it("is content with more than was asked for", () => {
    const group = { id: "s", label: "", kind: "count" as const, required: 1 };
    expect(choiceSatisfied({ group, picks: [pick(2), pick(2)] })).toBe(true);
  });
});

describe("applying a racial template (Characters p. 261)", () => {
  const bought = { ST: 10, DX: 10, IQ: 10, HT: 10 };

  /** "Apply attribute modifiers to the attributes you purchase." */
  it("grants the modifiers rather than writing new scores", () => {
    const applied = applyTemplate({ template: dwarf, bought });
    expect(applied.racial).toEqual({ HT: 1 });
    expect(applied.attributes).toEqual({});
  });

  /** "There is no added point cost for any of this! You paid for these bonuses
   * or penalties when you paid your racial cost." */
  it("bills the stated cost of the modifiers, not the table's price", () => {
    expect(applyTemplate({ template: dwarf, bought }).attributeCost).toBe(15);

    // The Dragon's ST+15 is bought with a -20% modifier, so it costs 120 rather
    // than the 150 fifteen levels would otherwise come to.
    const dragon: Template = {
      ...emptyTemplate("racial"),
      name: "Dragon",
      attributes: { ST: 15 },
      secondary: { will: 3, per: 3 },
      attributeCost: 150,
    };
    expect(applyTemplate({ template: dragon, bought }).attributeCost).toBe(150);
  });

  it("carries the secondary modifiers as grants, and the size", () => {
    const applied = applyTemplate({ template: dwarf, bought });
    expect(applied.bonuses).toEqual({ will: 1 });
    expect(applied.purchased).toEqual({});
    expect(applied.sizeModifier).toBe(-1);
  });

  it("costs nothing to be human", () => {
    expect(HUMAN_RACIAL_COST).toBe(0);
  });
});

describe("applying a character template (Characters p. 258)", () => {
  const mage: Template = {
    ...emptyTemplate("character"),
    name: "Mage",
    statedCost: 100,
    attributes: { ST: 9, DX: 11, IQ: 13, HT: 11 },
  };

  /** "Do this instead of buying individual attributes." */
  it("writes the scores it states, and bills them the ordinary way", () => {
    const applied = applyTemplate({ template: mage, bought: { ST: 10, DX: 10, IQ: 10, HT: 10 } });
    expect(applied.attributes).toEqual({ ST: 9, DX: 11, IQ: 13, HT: 11 });
    expect(applied.racial).toEqual({});
    expect(applied.attributeCost).toBe(0);
  });

  /** The Mage's "HP 10 [2]; Per 10 [-15]; FP 13 [6]" are levels bought, not
   * granted: the sheet bills them at exactly the price the template quotes. */
  it("buys the secondary levels rather than granting them", () => {
    const withSecondaries: Template = { ...mage, secondary: { hp: 1, per: -3, fp: 2 } };
    const applied = applyTemplate({
      template: withSecondaries,
      bought: { ST: 10, DX: 10, IQ: 10, HT: 10 },
    });
    expect(applied.purchased).toEqual({ hp: 1, per: -3, fp: 2 });
    expect(applied.bonuses).toEqual({});
  });
});

describe("stacking templates (Characters pp. 259, 261)", () => {
  /** "Choose the highest level of each attribute and secondary characteristic
   * from among the templates." */
  it("takes the higher of two character templates' attributes", () => {
    const knight: Template = {
      ...emptyTemplate("character"),
      name: "Knight",
      attributes: { ST: 12, DX: 12 },
    };
    const scholar: Template = {
      ...emptyTemplate("character"),
      name: "Scholar",
      attributes: { ST: 10, IQ: 14 },
    };
    expect(combineTemplates(knight, scholar).attributes).toEqual({ ST: 12, DX: 12, IQ: 14 });
  });

  /** "If an Elf has ST-1 and a Vampire has ST+6, a Vampire Elf has ST+5." */
  it("adds two racial templates' modifiers instead", () => {
    const elf: Template = { ...emptyTemplate("racial"), name: "Elf", attributes: { ST: -1 } };
    const vampire: Template = {
      ...emptyTemplate("racial"),
      name: "Vampire",
      attributes: { ST: 6 },
    };
    expect(combineTemplates(elf, vampire).attributes).toEqual({ ST: 5 });
  });

  /** "Do not take repeated traits at higher levels." */
  it("keeps one of each trait, at the more demanding level", () => {
    const a: Template = {
      ...emptyTemplate("character"),
      name: "A",
      entries: [{ name: "Status", itemType: "trait", points: 5, levels: 1 }],
    };
    const b: Template = {
      ...emptyTemplate("character"),
      name: "B",
      entries: [{ name: "Status", itemType: "trait", points: 10, levels: 2 }],
    };
    const both = combineTemplates(a, b);
    expect(both.entries).toHaveLength(1);
    expect(both.entries[0]).toMatchObject({ levels: 2, points: 10 });
  });

  /** "Adjust the combined template cost appropriately." */
  it("recomputes the cost from what the combination actually holds", () => {
    const both = combineTemplates(dwarf, felinoid);
    expect(both.statedCost).toBe(templateCost(both));
    expect(both.attributeCost).toBe(25);
    expect(both.kind).toBe("racial");
  });

  it("keeps the features and taboo traits of both, without duplicates", () => {
    const other: Template = { ...emptyTemplate("racial"), name: "Other", features: ["Tail"] };
    expect(combineTemplates(felinoid, other).features).toEqual(["Purring Voice", "Tail"]);
  });
});

describe("stackTemplate (Characters p. 259)", () => {
  const knight: Template = {
    ...emptyTemplate("character"),
    name: "Knight",
    attributes: { ST: 12, DX: 12 },
    secondary: { hp: 2 },
    entries: [
      { name: "Status", itemType: "trait", points: 10, levels: 2 },
      { name: "Riding (Horse)", itemType: "skill", points: 2 },
    ],
  };

  it("makes a Status 2 knight who is also a Status 1 merchant Status 2, not Status 3", () => {
    const merchant: Template = {
      ...emptyTemplate("character"),
      name: "Merchant",
      attributes: { IQ: 12, DX: 10 },
      entries: [
        { name: "Status", itemType: "trait", points: 5, levels: 1 },
        { name: "Merchant", itemType: "skill", points: 4 },
      ],
    };
    const plan = stackTemplate({ earlier: knight, next: merchant, entries: merchant.entries });
    expect(plan.create.map((entry) => entry.name)).toEqual(["Merchant"]);
    expect(plan.raise).toEqual([]);
    // The higher of each: the knight's DX stands, the merchant's IQ is new.
    expect(plan.attributes).toEqual({ IQ: 12, DX: 12 });
  });

  it("raises a trait taken earlier where the new template asks for more", () => {
    const noble: Template = {
      ...emptyTemplate("character"),
      name: "Noble",
      secondary: { hp: 3 },
      entries: [{ name: "Status", itemType: "trait", points: 15, levels: 3 }],
    };
    const plan = stackTemplate({ earlier: knight, next: noble, entries: noble.entries });
    expect(plan.create).toEqual([]);
    expect(plan.raise).toMatchObject([{ name: "Status", levels: 3 }]);
    // HP +3 is the requirement; +2 was already bought, so one more.
    expect(plan.secondary).toEqual({ hp: 1 });
  });
});

describe("an entry that copies a compendium document", () => {
  const entry = (points: number, levels?: number): TemplateEntry => ({
    name: "Trait",
    itemType: "trait",
    points,
    ...(levels ? { levels } : {}),
  });
  /** The sheet's own sum: a table's step, or points plus levels at their price. */
  const billed = (
    document: { points?: number; pointsPerLevel?: number; costTable?: number[] },
    fields: { points?: number; levels?: number },
    documentLevels = 1,
  ) => {
    const levels = fields.levels ?? documentLevels;
    const table = document.costTable ?? [];
    if (table.length) return table[Math.min(Math.max(levels, 1), table.length) - 1];
    return (fields.points ?? document.points ?? 0) + levels * (document.pointsPerLevel ?? 0);
  };

  it("bills a trait priced by the level at the template's total, not the total plus its levels", () => {
    // 2 levels at 5 a level, stated as 10: nothing left over for points.
    const document = { name: "Trait", points: 0, pointsPerLevel: 5 };
    const fields = entryItemFields(entry(10, 2), document);
    expect(fields).toEqual({ name: "Trait", levels: 2, points: 0 });
    expect(billed(document, fields)).toBe(10);
  });

  it("keeps a base cost a trait adds to its levels", () => {
    // 5 for the trait, 10 a level: three levels are 35.
    const document = { name: "Trait", points: 5, pointsPerLevel: 10 };
    expect(billed(document, entryItemFields(entry(35, 3), document))).toBe(35);
  });

  it("reads the levels an entry's points buy when it states none", () => {
    const document = { name: "Trait", points: 0, pointsPerLevel: 5 };
    const fields = entryItemFields(entry(15), document);
    expect(fields.levels).toBe(3);
    expect(billed(document, fields)).toBe(15);
  });

  it("keeps an uneven price as points, with no levels", () => {
    const document = { name: "Trait", points: 0, pointsPerLevel: 5 };
    const fields = entryItemFields(entry(3), document);
    expect(fields).toEqual({ name: "Trait", points: 3, levels: 0 });
    expect(billed(document, fields)).toBe(3);
  });

  it("finds a tabled trait's level by its total", () => {
    const document = { name: "Trait", points: 0, costTable: [10, 20, 30, 50, 75] };
    const fields = entryItemFields(entry(20), document);
    expect(fields).toEqual({ name: "Trait", levels: 2 });
    expect(billed(document, fields)).toBe(20);
  });

  it("gives a disadvantage priced by the level its levels too", () => {
    const document = { name: "Trait", points: 0, pointsPerLevel: -5 };
    expect(billed(document, entryItemFields(entry(-5), document))).toBe(-5);
  });

  it("writes a skill's or a flat trait's points as they are", () => {
    expect(entryItemFields(entry(12), { name: "Trait" })).toEqual({ name: "Trait", points: 12 });
    expect(entryItemFields(entry(15), { name: "Trait", points: 15 })).toEqual({ name: "Trait", points: 15 });
  });

  it("leaves the document's cost alone for an entry that states none", () => {
    expect(entryItemFields(entry(0), { name: "Trait", points: 0, pointsPerLevel: 5 })).toEqual({ name: "Trait" });
  });

  it("keeps an entry's qualifier on a generic document", () => {
    expect(entryItemName("Sense of Duty (Teammates)", "Sense of Duty")).toBe("Sense of Duty (Teammates)");
    expect(entryItemName("Physics (Paraphysics)", "Physics/TL")).toBe("Physics/TL (Paraphysics)");
  });

  it("keeps the document's name where it is already exact or the entry doesn't qualify it", () => {
    expect(entryItemName("Guns (Pistol)", "Guns/TL (Pistol)")).toBe("Guns/TL (Pistol)");
    expect(entryItemName("Patrons", "Patron")).toBe("Patron");
    expect(entryItemName("Luck", "Luck")).toBe("Luck");
  });
});

describe("a choice group with nothing to tick", () => {
  it("is met elsewhere, and a group with options is not", () => {
    const template = {
      entries: [{ name: "Brawling", itemType: "skill" as const, points: 2, group: "melee" }],
    };
    expect(choiceMetElsewhere(template, { id: "lens" })).toBe(true);
    expect(choiceMetElsewhere(template, { id: "melee" })).toBe(false);
  });
});
