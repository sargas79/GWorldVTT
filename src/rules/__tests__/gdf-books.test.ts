import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

// The parser is plain JavaScript run by node, but which book a record is
// filed under, and what page it says it came from, is what tells a
// module's pack apart from the system's. A wrong reading there puts the
// same trait in two packs, or cites the wrong book on every sheet.
import {
  assertCitesBook,
  bookPrefix,
  classifyCitation,
  entryName,
  fullLoad,
  groupsOf,
  parseDamage,
  handKeptTraitNames,
  isBookkeeping,
  parseSkillUsed,
  techLevel,
  traitCategoryOf,
  linkedLine,
  minimumRangeOf,
  guidanceOf,
  scopeAccOf,
  parseRadius,
  areaNote,
  LINKED_MODE,
  FOLLOW_UP_MODE,
  fragmentsOf,
  parseEquipment,
  parseRateOfFire,
  placeholderDamage,
  STATE_MODE,
  parseSkillUsedWithModifier,
  unarmedSkillsIn,
  powerOfRecord,
  qualityVariantOf,
  reference,
  STANDARD_SELF_CONTROL,
  takesSelfControlRoll,
  talentSkillsOf,
  techniqueDefault,
  techniqueDefaults,
  techniqueRebasing,
  traitAttackModes,
} from "../../../tools/parse-gdf.mjs";
import { nameOf, records } from "../../../tools/gdf.mjs";

// GCA wraps a name holding a comma in quotes or braces; an inch mark written
// as two apostrophes is kept, as the Basic Set packs spell it
// (sargas79/GWorldVTT#626).
describe("names in braces and doubled inch marks", () => {
  const nameIn = (line: string) => nameOf(records(`[EQUIPMENT]\n${line}\n`)[0]!);

  it("drops one enclosing pair of braces, as it does quotes", () => {
    expect(nameIn("{Revolver, .36}, 400, page(B279)")).toBe("Revolver, .36");
    expect(nameIn('"Revolver, .36", 400, page(B279)')).toBe("Revolver, .36");
    expect(nameIn("{Revolver, .36} Deluxe, 400, page(B279)")).toBe("{Revolver, .36} Deluxe");
  });

  it("keeps an inch mark written as two apostrophes", () => {
    expect(nameIn("\"Rope, 3/8'' (per 10 yards)\", 10, page(B288)")).toBe("Rope, 3/8'' (per 10 yards)");
    expect(nameIn("{Shell, 0.8''}, 10, page(B279)")).toBe("Shell, 0.8''");
  });

  it("unwraps a braced name in a reference", () => {
    expect(parseSkillUsed("{SK:Guns (Rifle, Musket)}, ST:DX-4")).toBe("Guns (Rifle, Musket)");
    expect(techniqueDefaults("{SK:Guns (Rifle, Musket)::level} - 4")).toEqual([{ from: "skill", skill: "Guns (Rifle, Musket)", modifier: -4 }]);
    expect(techniqueDefault("{SK:Guns (Rifle, Musket)::level} - 4")).toEqual({ prerequisite: "Guns (Rifle, Musket)", modifier: -4 });
  });
});

describe("reference", () => {
  it("cites the book being read, and only that book", () => {
    expect(reference("MA52, B203", "MA", "Test Book")).toBe("Test Book p. 52");
    expect(reference("B203, MA52", "B", "Basic Set: Characters")).toBe("Basic Set: Characters p. 203");
  });

  it("lists every page of the book a record spans", () => {
    expect(reference("B271, B276", "B", "Basic Set: Characters")).toBe("Basic Set: Characters p. 271, 276");
  });

  // The Basic Set's one prefix covers two volumes: Characters is pp. 1-336
  // and Campaigns carries on at 337 (sargas79/GWorldVTT#155).
  it("names the Basic Set volume a page is in, on each side of p. 336", () => {
    expect(reference("B336", "B", "Basic Set: Characters")).toBe("Basic Set: Characters p. 336");
    expect(reference("B337", "B", "Basic Set: Characters")).toBe("Basic Set: Campaigns p. 337");
    expect(reference("B460", "B", "Basic Set: Characters")).toBe("Basic Set: Campaigns p. 460");
  });

  it("names each volume for a record that cites both", () => {
    expect(reference("B88, B400, B401", "B", "Basic Set: Characters"))
      .toBe("Basic Set: Characters p. 88; Basic Set: Campaigns p. 400, 401");
    expect(reference("B400, B88", "B", "Basic Set: Characters"))
      .toBe("Basic Set: Campaigns p. 400; Basic Set: Characters p. 88");
  });

  it("leaves a supplement's pages under its own name, however high they run", () => {
    expect(reference("MA400", "MA", "Test Book")).toBe("Test Book p. 400");
    expect(reference("B400, MA52", "MA", "Test Book")).toBe("Test Book p. 52");
  });

  it("names the book alone when the record cites no page of it", () => {
    expect(reference("B203", "MA", "Test Book")).toBe("Test Book");
    expect(reference(undefined, "B", "Basic Set: Characters")).toBe("Basic Set: Characters");
  });

  it("does not mistake one prefix for the start of another", () => {
    expect(reference("LTC12", "LT", "Old Tools")).toBe("Old Tools");
    expect(reference("LT12", "LT", "Old Tools")).toBe("Old Tools p. 12");
  });

  // GCA writes a numbered series as `MH1:23`, and the prefix is the same
  // whether or not whoever runs the parser types the colon.
  it("reads a citation written with a colon, given the prefix either way", () => {
    expect(reference("MH1:23", "MH1", "Test Series 1")).toBe("Test Series 1 p. 23");
    expect(reference("MH1:23", "MH1:", "Test Series 1")).toBe("Test Series 1 p. 23");
    expect(reference("MH1:41, MH1:42", "MH1", "Test Series 1")).toBe("Test Series 1 p. 41, 42");
    expect(reference("B:203", "B", "Basic Set: Characters")).toBe("Basic Set: Characters p. 203");
  });

  it("does not read one numbered book as another", () => {
    // Test Series 11 is not page 15 of Test Series 1...
    expect(reference("DF11:5", "DF1", "Test Series 1")).toBe("Test Series 1");
    // ...and a numbered book is not page 1 of a book called "MH".
    expect(reference("MH1:23", "MH", "MH")).toBe("MH");
  });
});

describe("bookPrefix", () => {
  it("drops GCA's colon and nothing else", () => {
    expect(bookPrefix("MH1:")).toBe("MH1");
    expect(bookPrefix("MH1")).toBe("MH1");
    expect(bookPrefix(" MA ")).toBe("MA");
  });
});

describe("assertCitesBook", () => {
  const recs = [
    { section: "ADVANTAGES", text: `"Brave", 1, page(MH1:25)` },
    { section: "ADVANTAGES", text: `"Resistant to Disease", 10, page(B80)` },
    { section: "SKILLS", text: `"Blade!", DX/WC, page(MH1:29)` },
  ];

  it("passes when any record cites the book", () => {
    expect(() => assertCitesBook(recs, "MH1")).not.toThrow();
    expect(() => assertCitesBook(recs, "MH1:")).not.toThrow();
  });

  it("fails, naming the forms the file uses, when none does", () => {
    expect(() => assertCitesBook(recs, "MH")).toThrow(/MH1: \(2\), B \(1\)/);
  });
});

describe("entryName", () => {
  const siblings = new Set(["Basic Gear", "Brave", "Riding (Horse)"]);

  it("takes GCA's hiding underscore off a supplement's record", () => {
    expect(entryName("_Basic Gear", siblings)).toBe("Basic Gear");
  });

  it("files a trait with only a blank for its specialty under its own name", () => {
    expect(entryName("Weapon Bond (%WeaponList%)", siblings)).toBe("Weapon Bond");
    expect(entryName("Grimoire Collection ([name])", siblings)).toBe("Grimoire Collection");
  });

  it("leaves a blank that is part of a longer name, or a menu over real specialties", () => {
    expect(entryName("Higher Purpose (Hunt [monsters])", siblings)).toBe("Higher Purpose (Hunt [monsters])");
    expect(entryName("Riding (%beast%)", siblings)).toBe("Riding (%beast%)");
    expect(entryName("Brave ([kind])", siblings)).toBe("Brave ([kind])");
  });

  it("files the Basic Set's blank-specialty entries under their own names (#152)", () => {
    const basicSet = { supplement: false };
    expect(entryName("Incompetence ([skill])", siblings, basicSet)).toBe("Incompetence");
    expect(entryName("Area Knowledge ([Area])", siblings, basicSet)).toBe("Area Knowledge");
    expect(entryName("Riding (%beast%)", siblings, basicSet)).toBe("Riding (%beast%)");
  });

  it("drops the Basic Set's GCA bookkeeping records, but not a supplement's hidden entries", () => {
    expect(isBookkeeping("_Unused Quirk 1", { supplement: false })).toBe(true);
    expect(isBookkeeping("_New Alternative Attacks", { supplement: false })).toBe(true);
    expect(isBookkeeping("_Basic Gear", { supplement: true })).toBe(false);
    expect(isBookkeeping("Brave", { supplement: false })).toBe(false);
  });

  it("leaves a skill or technique its blank, since it needs the skill it is bought for", () => {
    const skills = { blankSpecialty: false };
    expect(entryName("Feint (%Melee Combat Skill%)", siblings, skills)).toBe("Feint (%Melee Combat Skill%)");
    expect(entryName("_Hidden Lore", siblings, skills)).toBe("Hidden Lore");
  });
});

describe("a Talent's skills", () => {
  // As a supplement's file writes them, in two sections of the file.
  const text = [
    "[ADVANTAGES]",
    '"Craftiness", 5/10, gives(+1 To GR:Craftiness), page(MH1:25), cat(Mundane, Mental, Talents)',
    "[GROUPS]",
    "<Craftiness>",
    "",
    "SK:Acting",
    "SK:Camouflage",
    "SK:Holdout",
    "* a comment",
    "<Voice>",
    "SK:Singing",
    "[EQUIPMENT]",
    '"Rope", basecost(1)',
    "[GROUPS]",
    "<Craftiness>",
    "SK:Stealth",
    "ST:Per",
  ].join("\n");
  const groups = groupsOf(text);

  it("reads every group, gathering a group listed twice", () => {
    expect(groups.get("Craftiness")).toEqual(["SK:Acting", "SK:Camouflage", "SK:Holdout", "SK:Stealth", "ST:Per"]);
    expect(groups.get("Voice")).toEqual(["SK:Singing"]);
  });

  it("gives a Talent the skills of the group named for it, and nothing else", () => {
    const talent = new Map([["gives", "+1 To GR:Craftiness"], ["cat", "Mundane, Mental, Talents"]]);
    expect(talentSkillsOf("Craftiness", talent, groups)).toEqual(["Acting", "Camouflage", "Holdout", "Stealth"]);
  });

  it("leaves alone a trait that gives to a group but is not a Talent", () => {
    // Voice is +2 to its group, which the system reads as a rule of its own.
    const voice = new Map([["gives", "+2 To GR:Voice"], ["cat", "Mundane, Physical"]]);
    expect(talentSkillsOf("Voice", voice, groups)).toEqual([]);
    // A power Talent names no group; its skills are a blank GCA fills in.
    const power = new Map([["gives", "+1 to SK:Skill Name Here"], ["cat", "Paranormal, Talents - Powers"]]);
    expect(talentSkillsOf("Mysticism Talent", power, groups)).toEqual([]);
  });
});

describe("the power a record belongs to", () => {
  // A supplement may file its powers as "_MH <power>", and its psionics as
  // "_MH Psionics - <power>"; the book's pattern says so.
  const pattern = /^_MH (?:Psionics - )?(.+)$/;

  it("reads the power from the category the book's pattern names", () => {
    const ability = new Map([["cat", "_MH Psionics - ESP"]]);
    expect(powerOfRecord(ability, pattern)).toEqual({ power: "ESP", powerTalent: false });
    const bio = new Map([["cat", "_MH Bioenhancement"]]);
    expect(powerOfRecord(bio, pattern)).toEqual({ power: "Bioenhancement", powerTalent: false });
  });

  it("knows the Talent by GCA's Talents - Powers category", () => {
    const talent = new Map([["cat", "_MH ESP, Paranormal, Mental, Talents - Powers"]]);
    expect(powerOfRecord(talent, pattern)).toEqual({ power: "ESP", powerTalent: true });
  });

  it("gives no power without a pattern, or where no category matches", () => {
    expect(powerOfRecord(new Map([["cat", "_MH Mysticism"]]), null)).toEqual({ power: "", powerTalent: false });
    expect(powerOfRecord(new Map([["cat", "Mundane, Mental, Talents"]]), pattern)).toEqual({ power: "", powerTalent: false });
  });
});

describe("the attack an advantage is", () => {
  it("reads an Innate Attack as dice per level with its weapon columns (Characters p. 61)", () => {
    const burning = new Map([
      ["damage", "$solver(%level)d"], ["damtype", "burn"], ["acc", "3"],
      ["rangehalfdam", "10"], ["rangemax", "100"], ["rof", "1"], ["rcl", "1"],
      ["skillused", "%examplealiaslist%"],
    ]);
    const { rangedModes, note } = traitAttackModes(burning);
    expect(note).toBeUndefined();
    expect(rangedModes).toHaveLength(1);
    expect(rangedModes[0]).toMatchObject({
      damageFormula: "1d", damageType: "burn", perLevel: true, malediction: 0,
      accuracy: 3, halfDamageRange: 10, maxRange: 100, skill: "Innate Attack (Projectile)",
    });
  });

  it("reads Speed/Range as the second Malediction, rolled against the attribute named", () => {
    // An attack bought as "1d-1 fatigue damage per level".
    const cryokinesis = new Map([
      ["damage", "$solver(%level)d-$solver(%level)"], ["damtype", "fat"],
      ["rangemax", "Speed/Range"], ["skillused", "Will"],
    ]);
    expect(traitAttackModes(cryokinesis).rangedModes[0]).toMatchObject({
      damageFormula: "1d-1", damageType: "fat", perLevel: true, malediction: 2,
      accuracy: 0, maxRange: 0, skill: "Will",
    });
  });

  it("reads a stun as an affliction resisted by the attribute its damage names", () => {
    const mentalBlow = new Map([["damage", "Will"], ["damtype", "stun"], ["rangemax", "Speed/Range"], ["skillused", "Will"]]);
    expect(traitAttackModes(mentalBlow).rangedModes[0]).toMatchObject({
      affliction: true, afflictionAttribute: "Will", malediction: 2,
    });
  });

  it("makes no attack of what the sheet works out, and says why", () => {
    const affliction = new Map([["damage", "HT-$solver(me::level - 1)"], ["damtype", "aff"], ["rangemax", "100"]]);
    expect(traitAttackModes(affliction)).toMatchObject({ rangedModes: [], note: expect.stringContaining("worked out") });
    const innate = new Map([["damage", "$solver(%level)d"], ["damtype", "%Typealt2list%"], ["rangemax", "100"]]);
    expect(traitAttackModes(innate)).toMatchObject({ rangedModes: [], note: expect.stringContaining("chosen") });
    // Spines hurt whoever grapples you; there is no range to attack at.
    const spines = new Map([["damage", "1d-2"], ["damtype", "imp"], ["reach", "C"]]);
    expect(traitAttackModes(spines).rangedModes).toEqual([]);
    expect(traitAttackModes(new Map())).toEqual({ rangedModes: [], meleeModes: [] });
  });
});

describe("qualityVariantOf", () => {
  const siblings = new Set(["Camera, Digital", "Lockpicks"]);

  it("recognises a record that restates its base item at another grade", () => {
    expect(qualityVariantOf("Camera, Digital (Good)", siblings)).toBe("Camera, Digital");
    expect(qualityVariantOf("Lockpicks (Fine)", siblings)).toBe("Lockpicks");
  });

  it("keeps a graded record whose base the file does not carry", () => {
    expect(qualityVariantOf("Disguise Kit (Good)", siblings)).toBeNull();
    expect(qualityVariantOf("Camera, Digital", siblings)).toBeNull();
  });
});

describe("classifyCitation", () => {
  it("keeps a record that cites the book being read", () => {
    expect(classifyCitation("MA52", "MA")).toBe("own");
    expect(classifyCitation("MA52, MA68", "MA")).toBe("own");
  });

  it("passes over a record that cites some other book", () => {
    expect(classifyCitation("B203", "MA")).toBe("elsewhere");
    expect(classifyCitation("", "MA")).toBe("elsewhere");
    expect(classifyCitation(undefined, "MA")).toBe("elsewhere");
  });

  it("leaves to the Basic Set a supplement's record that also cites it", () => {
    expect(classifyCitation("MA52, B203", "MA")).toBe("overlap");
    expect(classifyCitation("B203, MA52", "MA")).toBe("overlap");
  });

  it("never overlaps when the Basic Set itself is being read", () => {
    expect(classifyCitation("B203, MA52", "B")).toBe("own");
  });

  it("can be told which book is the base", () => {
    expect(classifyCitation("MA52, LT10", "MA", "LT")).toBe("overlap");
    expect(classifyCitation("MA52, B203", "MA", "LT")).toBe("own");
  });
});

describe("the skill a weapon is used with (#174)", () => {
  it("reads the Basic Set's SK: form, skipping wildcards and defaults", () => {
    expect(parseSkillUsed("SK:Sword!, SK:Broadsword, ST:DX-5, SK:Rapier-4")).toBe("Broadsword");
    expect(parseSkillUsed("ST:DX-4, SK:Shield (Buckler)-2, SK:Shield (Shield)")).toBe("Shield (Shield)");
  });

  it("reads a bare name, as some supplements write them", () => {
    expect(parseSkillUsed("Gun!, Guns (Submachine Gun), DX-4, Guns (Pistol)-2")).toBe("Guns (Submachine Gun)");
    expect(parseSkillUsed("Knife, DX-4, Force Sword-3")).toBe("Knife");
  });

  it("names no skill for an attribute or a blank the player fills in", () => {
    expect(parseSkillUsed("Will")).toBe("");
    expect(parseSkillUsed("%examplealiaslist%")).toBe("");
  });
  // "Skill score includes -2 to Hit": GCA writes a weapon's to-hit penalty
  // into every entry, the skill included (sargas79/GWorldVTT#199).
  it("reads a penalty every entry shares as the mode's to-hit modifier", () => {
    expect(parseSkillUsedWithModifier("SK:Spear-2, ST:DX-5-2, SK:Polearm-4-2, SK:Staff-2-2"))
      .toEqual({ skill: "Spear", modifier: -2 });
    expect(parseSkillUsedWithModifier("SK:Brawling-2, SK:Karate-2, ST:DX-2"))
      .toEqual({ skill: "Brawling", modifier: -2 });
    expect(parseSkillUsedWithModifier("SK:Sword!-2, SK:Knife-2, ST:DX-4-2, SK:Force Sword-3-2"))
      .toEqual({ skill: "Knife", modifier: -2 });
  });

  it("finds the unarmed skills a list names outright, for one mode apiece (#196)", () => {
    expect(unarmedSkillsIn("SK:Brawling, SK:Karate, ST:DX")).toEqual(["Brawling", "Karate"]);
    expect(unarmedSkillsIn("SK:Boxing, SK:Brawling, SK:Karate, ST:DX")).toEqual(["Boxing", "Brawling", "Karate"]);
    // A default at a penalty is not a skill the blow is struck with.
    expect(unarmedSkillsIn("SK:Brawling-2, SK:Karate-2, ST:DX-2")).toEqual([]);
    expect(unarmedSkillsIn("SK:Broadsword, ST:DX-5")).toEqual([]);
  });

  it("reads any other list with no modifier, as before", () => {
    expect(parseSkillUsedWithModifier("ST:DX-4, SK:Shield (Buckler)-2, SK:Shield (Shield)"))
      .toEqual({ skill: "Shield (Shield)", modifier: 0 });
    expect(parseSkillUsedWithModifier("SK:Sword!, SK:Broadsword, ST:DX-5, SK:Rapier-4"))
      .toEqual({ skill: "Broadsword", modifier: 0 });
    // Defaults at different penalties are defaults, not a shared penalty.
    expect(parseSkillUsedWithModifier("ST:DX-5, SK:Polearm-4"))
      .toEqual({ skill: "", modifier: 0 });
  });
});

describe("a technique's default (#193)", () => {
  it("reads the bare form", () => {
    expect(techniqueDefault("SK:Broadsword::level - 5")).toEqual({ prerequisite: "Broadsword", modifier: -5 });
    expect(techniqueDefault("SK:Judo::level")).toEqual({ prerequisite: "Judo", modifier: 0 });
  });

  // The quote closes after ::level, and the penalty follows it.
  it("keeps the penalty of a quoted default", () => {
    expect(techniqueDefault('"SK:Bow::level" - 4')).toEqual({ prerequisite: "Bow", modifier: -4 });
    expect(techniqueDefault('"SK:Beam Weapons (Pistol)::level" - 4')).toEqual({ prerequisite: "Beam Weapons (Pistol)", modifier: -4 });
    expect(techniqueDefault('"SK:Guns (Pistol)::level" - 4, SK:Gun! - 4')).toEqual({ prerequisite: "Guns (Pistol)", modifier: -4 });
    expect(techniqueDefault('"SK:Karate::level"')).toEqual({ prerequisite: "Karate", modifier: 0 });
  });

  it("is null when the default is not a skill's level", () => {
    expect(techniqueDefault('"ST:DX::score" - 2')).toBeNull();
    expect(techniqueDefault(undefined)).toBeNull();
  });
});

describe("a technique's defaults beyond a skill (#195)", () => {
  it("reads the Parry or Block a skill gives", () => {
    expect(techniqueDefaults('"SK:Judo::parrylevel" - 1')).toEqual([{ from: "parry", skill: "Judo", modifier: -1 }]);
    expect(techniqueDefaults('"SK:Shield (Buckler)::blocklevel" - 1')).toEqual([{ from: "block", skill: "Shield (Buckler)", modifier: -1 }]);
  });

  it("reads Dodge and the attributes, quoted or bare", () => {
    expect(techniqueDefaults('"ST:Dodge::score" - 2')).toEqual([{ from: "dodge", skill: "", modifier: -2 }]);
    expect(techniqueDefaults('"ST:ST::score" - 4')).toEqual([{ from: "ST", skill: "", modifier: -4 }]);
    expect(techniqueDefaults("ST:ST - 4")).toEqual([{ from: "ST", skill: "", modifier: -4 }]);
    expect(techniqueDefaults('"ST:DX::score"')).toEqual([{ from: "DX", skill: "", modifier: 0 }]);
  });

  it("reads every default of a list, skipping a wildcard", () => {
    expect(techniqueDefaults('"SK:Guns (Pistol)::level" - 4, SK:Gun! - 4')).toEqual([{ from: "skill", skill: "Guns (Pistol)", modifier: -4 }]);
    expect(techniqueDefaults('"ST:ST::score" - 4, "SK:Wrestling::level" - 2')).toEqual([
      { from: "ST", skill: "", modifier: -4 },
      { from: "skill", skill: "Wrestling", modifier: -2 },
    ]);
  });

  it("is null for a form it cannot read", () => {
    expect(techniqueDefaults("@if(foo)")).toBeNull();
    expect(techniqueDefaults(undefined)).toBeNull();
  });

  // GCA writes "this technique is ST-based rather than DX-based" as arithmetic
  // on the default. The model has no field for it, so the skill and its penalty
  // are kept and the rebasing is reported (#368).
  it("keeps the skill and penalty of a default that rebases on an attribute", () => {
    expect(techniqueDefaults('"SK:Jitte/Sai::level" - 4 + ST:ST - ST:DX')).toEqual([
      { from: "skill", skill: "Jitte/Sai", modifier: -4 },
    ]);
    expect(techniqueRebasing('"SK:Jitte/Sai::level" - 4 + ST:ST - ST:DX')).toBe("+ST-DX");
    expect(techniqueRebasing('"SK:Judo::level" - 4')).toBe("");
    expect(techniqueRebasing("ST:ST - 4")).toBe("");
    expect(techniqueRebasing(undefined)).toBe("");
  });

  // Anything left unread stays out of the prerequisite, rather than becoming
  // part of the skill's name (#368).
  it("is null when the default holds arithmetic it cannot read", () => {
    expect(techniqueDefaults('"SK:Judo::level" - 4 + AD:Trained by a Master::level')).toBeNull();
  });
});

describe("handKeptTraitNames", () => {
  const withPacks = (files: Record<string, Array<{ _id: string; name: string }>>) => {
    const dir = mkdtempSync(join(tmpdir(), "gdf-hand-"));
    for (const [path, docs] of Object.entries(files)) {
      mkdirSync(join(dir, path, ".."), { recursive: true });
      writeFileSync(join(dir, path), JSON.stringify(docs));
    }
    return dir;
  };

  it("reads the names in a supplement's hand-kept trait files, not in the parser's own", () => {
    const dir = withPacks({
      "advantages/a-book-advantages.json": [{ _id: "a", name: "Parsed Talent" }],
      "advantages/a-book-by-hand.json": [{ _id: "b", name: "Corrected Talent" }],
      "disadvantages/a-book-disadvantages.json": [{ _id: "c", name: "Parsed Flaw" }],
      "disadvantages/a-book-by-hand.json": [{ _id: "d", name: "Corrected Flaw" }],
    });
    try {
      expect([...handKeptTraitNames(dir, false, "A Book")].sort()).toEqual(["Corrected Flaw", "Corrected Talent"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("finds none for the Basic Set, whose only trait files are the parser's", () => {
    const dir = withPacks({
      "advantages/basic-set-advantages.json": [{ _id: "a", name: "Luck" }],
      "disadvantages/basic-set-disadvantages.json": [{ _id: "b", name: "Greed" }],
    });
    try {
      expect(handKeptTraitNames(dir, true, "Basic Set").size).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("finds none where a pack has no directory yet", () => {
    const dir = mkdtempSync(join(tmpdir(), "gdf-hand-"));
    try {
      expect(handKeptTraitNames(dir, false, "A Book").size).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("fullLoad", () => {
  it("counts a magazine and the round already chambered", () => {
    expect(fullLoad("30+1(3)")).toBe(31);
    expect(fullLoad("5(3i)")).toBe(5);
  });

  it("reads a magazine written with a thousands separator", () => {
    // A data file writes a large power cell the way the book prints it. Read
    // without the separator the number stops at the comma, and a 9,000-shot
    // cell arrives holding nine.
    expect(fullLoad("9,000(3)")).toBe(9000);
    expect(fullLoad("3,600(3)")).toBe(3600);
    expect(fullLoad("1,000(5)")).toBe(1000);
  });

  it("counts a thrown weapon as the one in hand", () => {
    expect(fullLoad("T(1)")).toBe(1);
  });

  it("counts nothing where the column is blank", () => {
    expect(fullLoad("")).toBe(0);
    expect(fullLoad(undefined)).toBe(0);
  });
});

describe("parseDamage: the damage modifiers of Characters pp. 104-105", () => {
  const extras = (damage: string, type: string): Record<string, unknown> => parseDamage(damage, type)!.fields;

  it("reads each modifier off the damage type", () => {
    expect(extras("2d", "burn inc").incendiary).toBe(true);
    expect(extras("2d", "burn rad").radiation).toBe(true);
    expect(extras("2d", "cr dkb").doubleKnockback).toBe(true);
    expect(extras("2d", "cr nkb").noKnockback).toBe(true);
    expect(extras("2d", "burn sur").surge).toBe(true);
  });

  it("leaves the damage type itself behind once they are stripped", () => {
    expect(extras("2d", "burn inc").damageType).toBe("burn");
    expect(extras("2d", "cr dkb").damageType).toBe("cr");
    expect(extras("6d", "tox rad").damageType).toBe("tox");
  });

  it("reads them in any order and any combination", () => {
    // A data file writes them as the book prints them, which is not one order,
    // and mixes them with the explosive and fragmentation notes.
    const burning = extras("3d", "burn ex sur");
    expect(burning.surge).toBe(true);
    expect(burning.explosive).toBe(true);
    expect(burning.damageType).toBe("burn");

    const toxic = extras("4d", "tox rad ex");
    expect(toxic.radiation).toBe(true);
    expect(toxic.explosive).toBe(true);
    expect(toxic.damageType).toBe("tox");

    const shoving = extras("2d", "cr dkb ex");
    expect(shoving.doubleKnockback).toBe(true);
    expect(shoving.explosive).toBe(true);
    expect(shoving.damageType).toBe("cr");

    // A fragmentation note sits among them and is still read as one.
    const burst = extras("5d", "cr ex inc [2d]");
    expect(burst.incendiary).toBe(true);
    expect(burst.fragmentation).toBe("2d");
    expect(burst.damageType).toBe("cr");
  });

  it("reads one written with a footnote dagger beside it", () => {
    const daggered = extras("2d", "tox rad†");
    expect(daggered.radiation).toBe(true);
    expect(daggered.damageType).toBe("tox");
  });

  it("writes none of them out for a plain damage type", () => {
    // The model defaults them all to false, and nothing in the Basic Set's own
    // file sets any of them. Writing them out anyway would add five lines to
    // every weapon in its packs and say nothing, so an unset one is absent.
    const plain = extras("2d", "cr");
    expect(plain.incendiary).toBeUndefined();
    expect(plain.radiation).toBeUndefined();
    expect(plain.doubleKnockback).toBeUndefined();
    expect(plain.noKnockback).toBeUndefined();

    // Surge predates them and is written either way, which is what keeps the
    // Basic Set's own packs exactly as they are.
    expect(plain.surge).toBe(false);
  });

  it("does not mistake a type that merely contains a modifier's letters", () => {
    // No whole word in either of these is one of the modifiers.
    expect(extras("1d", "cut").incendiary).toBeUndefined();
    expect(extras("1d", "imp").incendiary).toBeUndefined();
  });
});

describe("techLevel", () => {
  it("keeps a plain figure", () => {
    expect(techLevel("7")).toBe("7");
    expect(techLevel("11")).toBe("11");
    expect(techLevel(" 0 ")).toBe("0");
  });

  it("keeps a superscience tech level as the book prints it", () => {
    // "the rules give the TL of superscience developments as '^' instead of a
    // number" (Campaigns p. 513): a caret after the figure, or on its own.
    expect(techLevel("11^")).toBe("11^");
    expect(techLevel("^")).toBe("^");
  });

  it("drops anything that is not a tech level", () => {
    expect(techLevel("Var.")).toBe("");
    expect(techLevel("[techlevel]")).toBe("");
    expect(techLevel("")).toBe("");
    expect(techLevel(undefined)).toBe("");
    expect(techLevel("^11")).toBe("");
  });
});

describe("traitCategoryOf", () => {
  const flat = (points: number) => ({ points, pointsPerLevel: 0, costTable: [] as number[] });
  const perLevel = (points: number) => ({ points: 0, pointsPerLevel: points, costTable: [] as number[] });
  const table = (...steps: number[]) => ({ points: 0, pointsPerLevel: 0, costTable: steps });

  it("keeps the section's word where the cost agrees with it", () => {
    expect(traitCategoryOf("ADVANTAGES", flat(15))).toBe("advantage");
    expect(traitCategoryOf("DISADVANTAGES", flat(-10))).toBe("disadvantage");
    expect(traitCategoryOf("PERKS", flat(1))).toBe("perk");
    expect(traitCategoryOf("QUIRKS", flat(-1))).toBe("quirk");
  });

  it("reads a trait that costs negative points as a disadvantage, whichever section holds it", () => {
    // A book whose cybernetic implants all sit under Advantages has some that
    // cost points rather than buying them.
    expect(traitCategoryOf("ADVANTAGES", flat(-3))).toBe("disadvantage");
    expect(traitCategoryOf("PERKS", flat(-1))).toBe("quirk");
  });

  it("reads a trait that costs positive points as an advantage, likewise", () => {
    expect(traitCategoryOf("DISADVANTAGES", flat(5))).toBe("advantage");
    expect(traitCategoryOf("QUIRKS", flat(1))).toBe("perk");
  });

  it("reads the per-level price where the flat cost is nothing", () => {
    expect(traitCategoryOf("ADVANTAGES", perLevel(-10))).toBe("disadvantage");
    expect(traitCategoryOf("DISADVANTAGES", perLevel(10))).toBe("advantage");
    expect(traitCategoryOf("DISADVANTAGES", perLevel(-10))).toBe("disadvantage");
  });

  it("reads the first step of a cost table where there is neither", () => {
    expect(traitCategoryOf("ADVANTAGES", table(-15, -25, -35))).toBe("disadvantage");
    expect(traitCategoryOf("DISADVANTAGES", table(-10, -20))).toBe("disadvantage");
  });

  it("keeps the section's word for a trait that costs nothing at all", () => {
    expect(traitCategoryOf("ADVANTAGES", flat(0))).toBe("advantage");
    expect(traitCategoryOf("DISADVANTAGES", flat(0))).toBe("disadvantage");
  });

  it("says nothing for a section that holds no traits", () => {
    expect(traitCategoryOf("EQUIPMENT", flat(5))).toBeUndefined();
  });
});

/**
 * A second attack that lands with the first rather than instead of it
 * (Characters p. 106). The Basic Set prints three: both electrolasers and the
 * cattle prod, each with a "linked" row under its own.
 */
describe("a linked or follow-up mode", () => {
  it("knows the names a data file gives one", () => {
    expect(LINKED_MODE.test("Linked")).toBe(true);
    expect(LINKED_MODE.test("linked")).toBe(true);
    expect(FOLLOW_UP_MODE.test("Follow-Up")).toBe(true);
    expect(FOLLOW_UP_MODE.test("Follow Up")).toBe(true);
    expect(FOLLOW_UP_MODE.test("Followup")).toBe(true);
  });

  it("does not mistake a mode whose name merely begins the same way", () => {
    expect(LINKED_MODE.test("Linkedin Mode")).toBe(false);
    expect(LINKED_MODE.test("Beam")).toBe(false);
    expect(FOLLOW_UP_MODE.test("Follower")).toBe(false);
  });

  it("carries an affliction's resistance roll rather than damage", () => {
    // The electrolaser's linked line is "HT-4(2) aff".
    const line = linkedLine(
      {
        affliction: true, afflictionAttribute: "HT", afflictionModifier: -4,
        armorDivisor: 2, damageType: "cr",
      },
      false,
      "Linked",
    );
    expect(line).toEqual({
      damage: "HT-4",
      damageType: "cr",
      armorDivisor: 2,
      affliction: true,
      afflictionAttribute: "HT",
      afflictionModifier: -4,
      label: "Linked",
    });
  });

  it("carries a damage formula where the second line does damage", () => {
    const line = linkedLine(
      { damageFormula: "2d", damageType: "burn", armorDivisor: 1, explosive: true, fragmentation: "1d" },
      false,
      "Linked",
    );
    expect(line.damage).toBe("2d");
    expect(line.damageType).toBe("burn");
    expect(line.explosive).toBe(true);
    expect(line.fragmentation).toBe("1d");
  });

  it("says which of the two it is", () => {
    const linked = linkedLine({ damageFormula: "1d", damageType: "cr", armorDivisor: 1 }, false, "Linked");
    const follows = linkedLine({ damageFormula: "1d", damageType: "cr", armorDivisor: 1 }, true, "Follow-Up");
    // A linked attack is rolled separately against DR; a follow-up only lands
    // if the carrier hits, and then ignores DR.
    expect(linked.followUp).toBeUndefined();
    expect(follows.followUp).toBe(true);
  });

  it("writes nothing it was not given", () => {
    const line = linkedLine({ damageFormula: "1d", damageType: "cr", armorDivisor: 1 }, false, "");
    expect(line.explosive).toBeUndefined();
    expect(line.fragmentation).toBeUndefined();
    expect(line.affliction).toBeUndefined();
    expect(line.label).toBeUndefined();
  });
});

/**
 * How far an area attack reaches from where it lands (Campaigns p. 413). A
 * circle says its radius; a cone says its width instead, and the two are
 * different shapes.
 */
describe("parseRadius", () => {
  it("reads the yards a record's own column states", () => {
    expect(parseRadius("10yd")).toBe(10);
    expect(parseRadius("1.5yd")).toBe(1.5);
    expect(parseRadius("10 yd.")).toBe(10);
    expect(parseRadius("1000yd")).toBe(1000);
    expect(parseRadius("2 yards")).toBe(2);
  });

  it("reads a bare figure as yards, which is the unit the column is in", () => {
    expect(parseRadius("4")).toBe(4);
  });

  it("reads nothing from a blank or unreadable column", () => {
    expect(parseRadius("")).toBe(0);
    expect(parseRadius(undefined)).toBe(0);
    expect(parseRadius("varies")).toBe(0);
  });
});

describe("areaNote", () => {
  it("finds the figure a book prints beside the damage type", () => {
    // Read to be reported, not to be used: the stun grenade's is a radius and
    // a dazzle weapon's is a cone's width, and the column does not say which.
    expect(areaNote("aff (10 yd.)")).toBe(10);
    expect(areaNote("aff (3 yd)")).toBe(3);
    expect(areaNote("(2yd.)")).toBe(2);
  });

  it("finds nothing in a plain damage type", () => {
    expect(areaNote("burn")).toBe(0);
    expect(areaNote("cr ex")).toBe(0);
    expect(areaNote("cr ex [2d]")).toBe(0);
    expect(areaNote("")).toBe(0);
    expect(areaNote(undefined)).toBe(0);
  });
});

// The book prices Bad Temper and the rest "for a self-control number of 12",
// and the file says which they are with a modifier group rather than a
// number (sargas79/GWorldVTT#547).
describe("takesSelfControlRoll", () => {
  it("reads the Self-Control group off a disadvantage's modifiers", () => {
    expect(takesSelfControlRoll("Self-Control")).toBe(true);
    expect(takesSelfControlRoll("Self-Control, Berserk")).toBe(true);
    expect(takesSelfControlRoll(" self-control ")).toBe(true);
  });

  it("leaves a trait with other groups, or none, without a roll", () => {
    expect(takesSelfControlRoll("Fanaticism")).toBe(false);
    expect(takesSelfControlRoll("Self-Control Enhancements")).toBe(false);
    expect(takesSelfControlRoll("")).toBe(false);
    expect(takesSelfControlRoll(undefined)).toBe(false);
  });

  it("stamps the book's standard number", () => {
    expect(STANDARD_SELF_CONTROL).toBe(12);
  });
});

// Fragments may be written before the damage type as well as after it, and
// the brackets may say more than the dice (sargas79/GWorldVTT#591).
describe("the fragments beside a damage type", () => {
  const withNote = (damage: string, type: string) =>
    parseDamage(damage, type) as unknown as { fields: Record<string, unknown>; fragmentNote?: string };

  it("reads them after the type, as the Basic Set's file writes them", () => {
    expect(parseDamage("5d", "cr ex [2d]")!.fields).toMatchObject({ damageType: "cr", explosive: true, fragmentation: "2d" });
    expect(parseDamage("4d", "cr ex[1d]")!.fields.fragmentation).toBe("1d");
  });

  it("reads them before the type the same way", () => {
    expect(parseDamage("4d-1", "[2d] cr ex")).toEqual(parseDamage("4d-1", "cr ex [2d]"));
    expect(parseDamage("6dx3", "[4d-1] cr ex")!.fields.fragmentation).toBe("4d-1");
  });

  // Since API 1.72.0 the mode holds both (sargas79/GWorldVTT#595).
  it("keeps the fragments' own divisor and type in the mode", () => {
    const divisor = withNote("2d", "[1d(0.2)] burn ex");
    expect(divisor.fields).toMatchObject({ damageType: "burn", explosive: true, fragmentation: "1d", fragmentationDivisor: 0.2 });
    expect(divisor.fields.fragmentationType).toBeUndefined();
    expect(divisor.fragmentNote).toBeUndefined();

    const typed = withNote("1d+1", "[1d-1 cr] cr ex");
    expect(typed.fields).toMatchObject({ damageType: "cr", explosive: true, fragmentation: "1d-1", fragmentationType: "cr" });
    expect(typed.fields.fragmentationDivisor).toBeUndefined();
    expect(typed.fragmentNote).toBeUndefined();

    expect(withNote("2d", "[1d(2) pi] cr ex").fields).toMatchObject({ fragmentationType: "pi", fragmentationDivisor: 2 });
  });

  it("notes a fragment type the model does not know", () => {
    const odd = withNote("2d", "[1d zap] cr ex");
    expect(odd.fields.fragmentation).toBe("1d");
    expect(odd.fields.fragmentationType).toBeUndefined();
    expect(odd.fragmentNote).toMatch(/damage type zap/);
  });

  it("carries the fragments' type and divisor onto a second line", () => {
    const line = linkedLine(
      { damageFormula: "2d", damageType: "cr", armorDivisor: 1, explosive: true, fragmentation: "1d", fragmentationType: "burn", fragmentationDivisor: 0.2 },
      true,
      "",
    );
    expect(line).toMatchObject({ fragmentation: "1d", fragmentationType: "burn", fragmentationDivisor: 0.2 });
  });

  it("reads a bracket left unclosed", () => {
    expect(fragmentsOf("cr ex [1d(0.2)")).toMatchObject({ rest: "cr ex", dice: "1d" });
    expect(parseDamage("2d", "burn ex [1d(0.2)")!.fields.fragmentation).toBe("1d");
    expect(parseDamage("2d", "[1d(0.2) burn ex")!.fields).toMatchObject({ damageType: "burn", explosive: true, fragmentation: "1d" });
  });

  it("says nothing more of fragments that are plain cutting", () => {
    expect(fragmentsOf("[2d cut] cr ex")).toEqual({ rest: "cr ex", dice: "2d", type: "", divisor: 1, note: "" });
    expect(withNote("4d", "[2d] cr ex").fragmentNote).toBeUndefined();
  });

  it("finds none in a type without them, or in GCA's own placeholder", () => {
    expect(fragmentsOf("cr ex")).toEqual({ rest: "cr ex", dice: "", type: "", divisor: 1, note: "" });
    expect(fragmentsOf("[damagetype]").dice).toBe("");
  });

  it("does not give fragments to an attack that does not explode", () => {
    expect(parseDamage("2d", "[1d] cr")).toBeNull();
  });
});

// The RoF column's marks and second rate (Characters p. 270).
describe("parseRateOfFire", () => {
  it("reads a plain rate as it always has, with nothing extra", () => {
    expect(parseRateOfFire("3")).toEqual({ rateOfFire: 3, projectiles: 1 });
    expect(parseRateOfFire("3x9")).toEqual({ rateOfFire: 3, projectiles: 9 });
    expect(parseRateOfFire("Jet")).toEqual({ rateOfFire: 1, projectiles: 1 });
    expect(parseRateOfFire(undefined)).toEqual({ rateOfFire: 1, projectiles: 1 });
  });

  it("keeps the full-auto-only mark", () => {
    expect(parseRateOfFire("8!")).toEqual({ rateOfFire: 8, projectiles: 1, rateOfFireMark: "!" });
  });

  it("keeps a book's own mark and a second rate after a slash", () => {
    expect(parseRateOfFire("9#/7")).toEqual({
      rateOfFire: 9, projectiles: 1, rateOfFireMark: "#", rateOfFireSecond: 7,
    });
    expect(parseRateOfFire("33!/66!")).toEqual({
      rateOfFire: 33, projectiles: 1, rateOfFireMark: "!", rateOfFireSecond: 66, rateOfFireSecondMark: "!",
    });
  });
});

describe("placeholderDamage", () => {
  it("names a damage column that states an effect rather than damage", () => {
    expect(placeholderDamage("Special", "")).toMatch(/names an effect/);
    expect(placeholderDamage("Smoke (7 yd.)", undefined)).toMatch(/names an effect/);
    expect(placeholderDamage("", "drug effect")).toMatch(/no damage beside "drug effect"/);
    expect(placeholderDamage(undefined, "paint splat")).toMatch(/paint splat/);
  });

  it("leaves real damage, the table's spec., and a blank line alone", () => {
    expect(placeholderDamage("2d", "cr")).toBe("");
    expect(placeholderDamage("sw+1", "cut")).toBe("");
    expect(placeholderDamage("HT-3", "aff")).toBe("");
    expect(placeholderDamage("", "spcl.")).toBe("");
    expect(placeholderDamage("", "")).toBe("");
    // Damage the model cannot read but which is still damage is a reject, not a skip.
    expect(placeholderDamage("slam+1", "cr")).toBe("");
  });
});

describe("the equipment a data file's modes make", () => {
  const source = {
    prefix: "XX",
    book: "Test Book",
    outDir: join(tmpdir(), "gworld-parser-no-packs"),
    overlap: () => {},
    basicIds: new Set<string>(),
  };
  const run = (...texts: string[]) => {
    const rejects: string[] = [];
    const notes: string[] = [];
    const out = parseEquipment(
      texts.map((text) => ({ section: "EQUIPMENT", text })),
      (what, why) => rejects.push(`${what}: ${why}`),
      (n) => notes.push(n),
      source,
    );
    return { ...out, rejects, notes };
  };
  const ranged = "minst(20M), rangehalfdam(500), rangemax(3000), acc(3), rof(1), shots(1), skillused(SK:Artillery)";

  it("gives a second line written after two modes of the same round to both", () => {
    const { gear, rejects } = run(
      "Test Gun, page(XX10), cost(100), weight(10), techlvl(6),"
      + ` newmode(Indirect fire, damage(6dx5), armordivisor(0.5), damtype(pi++), ${ranged}),`
      + ` newmode(Direct fire, damage(6dx5), armordivisor(0.5), damtype(pi++), ${ranged}),`
      + ` newmode(Follow-up, damage(6d), damtype([3d-1] cr ex), ${ranged})`,
    );
    expect(rejects).toEqual([]);
    const modes = gear[0]!.system.rangedModes;
    expect(modes.map((m: { name: string }) => m.name)).toEqual(["Indirect fire", "Direct fire"]);
    for (const mode of modes) {
      expect(mode.linked).toMatchObject({ damage: "6d", explosive: true, fragmentation: "3d-1", followUp: true });
    }
    expect(modes[0]!.linked).not.toBe(modes[1]!.linked);
  });

  it("marks a pick where the mode's own note says it may get stuck (Campaigns p. 405)", () => {
    const melee = "reach(1), parry(0U), minst(12), skillused(SK:Axe/Mace)";
    const { gear, notes } = run(
      `Test Pick, page(XX10), cost(70), weight(3), techlvl(3), damage(sw+1), damtype(imp), ${melee}, itemnotes({May get stuck; see Picks (p. B405).})`,
      "Test Polearm, page(XX10), cost(150), weight(12), techlvl(3),"
      + ` newmode(Swing/cut, damage(sw+5), damtype(cut), ${melee}),`
      + ` newmode(Swing/imp, damage(sw+4), damtype(imp), ${melee}),`
      + ` newmode(Thrust, damage(thr+3), damtype(imp), ${melee}),`
      + " itemnotes({} | {May get stuck; see Picks (p. B405).} | {})",
      // A note that doesn't line up with the modes names none of them.
      "Test Hook, page(XX10), cost(50), weight(4), techlvl(3),"
      + ` newmode(Swing, damage(sw), damtype(cut), ${melee}),`
      + ` newmode(Hook, damage(sw), damtype(imp), ${melee}),`
      + " itemnotes({May get stuck.})",
      `Test Axe, page(XX10), cost(50), weight(4), techlvl(0), damage(sw+2), damtype(cut), ${melee}`,
    );
    const modes = (name: string) => gear.find((g) => g.name === name)!.system.meleeModes.map((m) => m.pick === true);
    expect(modes("Test Pick")).toEqual([true]);
    expect(modes("Test Polearm")).toEqual([false, true, false]);
    expect(modes("Test Hook")).toEqual([false, false]);
    expect(notes.some((n) => n.startsWith("Test Hook") && /may get stuck/.test(n))).toBe(true);
    expect(modes("Test Axe")).toEqual([false]);
  });

  it("gives it only to the mode before it when that fires another round", () => {
    const { gear } = run(
      "Test Gun, page(XX10), cost(100), weight(10), techlvl(6),"
      + ` newmode(Shot, damage(1d+1), damtype(pi), ${ranged}),`
      + ` newmode(Shell, damage(5d), damtype(pi++), ${ranged}),`
      + ` newmode(Linked, damage(2d), damtype(cr ex), ${ranged})`,
    );
    const [shot, shell] = gear[0]!.system.rangedModes;
    expect(shot!.linked).toBeUndefined();
    expect(shell!.linked).toMatchObject({ damage: "2d" });
  });

  it("keeps a follow-up and a linked line on every mode of the round (Characters p. 269)", () => {
    const { gear, rejects, notes } = run(
      "Missile Test, page(XX10), cost(100), weight(10), techlvl(8),"
      + ` newmode(w/o Bipod, damage(6dx3), armordivisor(10), damtype(cr ex), ${ranged}),`
      + ` newmode(w/ Bipod, damage(6dx3), armordivisor(10), damtype(cr ex), ${ranged}),`
      + ` newmode(Follow-up, damage(6dx11), armordivisor(10), damtype(cr ex), ${ranged}),`
      + ` newmode(Linked, damage(7dx4), damtype(cr ex), ${ranged})`,
    );
    expect(rejects).toEqual([]);
    const modes = gear[0]!.system.rangedModes;
    expect(modes).toHaveLength(2);
    for (const mode of modes) {
      expect(mode.linked).toMatchObject({ damage: "6dx11", followUp: true, label: "Follow-up" });
      expect(mode.linkedAlso).toMatchObject({ damage: "7dx4", label: "Linked" });
      expect((mode.linkedAlso as { followUp?: boolean }).followUp).toBeUndefined();
    }
    expect(notes.some((n) => /not kept/.test(n))).toBe(false);
  });

  it("does not write a second line of the same kind over the first, and says so", () => {
    const { gear, notes } = run(
      "Double Test, page(XX10), cost(100), weight(10), techlvl(8),"
      + ` newmode(Shot, damage(3d), damtype(pi), ${ranged}),`
      + ` newmode(Linked, damage(1d), damtype(burn), ${ranged}),`
      + ` newmode(Linked, damage(2d), damtype(cr), ${ranged})`,
    );
    const [shot] = gear[0]!.system.rangedModes;
    expect(shot!.linked).toMatchObject({ damage: "1d", damageType: "burn" });
    expect(shot!.linkedAlso).toBeUndefined();
    expect(notes).toContain("Double Test: Linked: Shot already has a linked line; this one is not kept");
  });

  it("reads a scope written as scopeacc() when the Acc has none of its own (Characters p. 269)", () => {
    expect(scopeAccOf("2")).toBe(2);
    expect(scopeAccOf("+1")).toBe(1);
    expect(scopeAccOf("")).toBe(0);
    expect(scopeAccOf(undefined)).toBe(0);
    expect(scopeAccOf("owner::scopeacc")).toBe(0);
    const { gear } = run(
      "Scope Test, page(XX10), cost(100), weight(5), techlvl(9), damage(4d), damtype(pi-), acc(6), scopeacc(1), rangehalfdam(700), rangemax(2900), rof(16), shots(80(3)), minst(9), skillused(SK:Guns (Rifle))",
      "Two Scope Test, page(XX11), cost(100), weight(5), techlvl(9),"
      + " newmode(Rifle, damage(6d), damtype(pi), acc(4), scopeacc(2), rangehalfdam(700), rangemax(4000), rof(15), shots(25(3)), minst(10), skillused(SK:Guns (Rifle))),"
      + " newmode(Written, damage(6d), damtype(pi), acc(4+3), scopeacc(2), rangehalfdam(700), rangemax(4000), rof(15), shots(25(3)), minst(10), skillused(SK:Guns (Rifle)))",
    );
    expect(gear[0]!.system.rangedModes[0]).toMatchObject({ accuracy: 6, scopeBonus: 1 });
    const [rifle, written] = gear[1]!.system.rangedModes;
    expect(rifle).toMatchObject({ accuracy: 4, scopeBonus: 2 });
    // The Acc's own "+3" is what the table prints, and wins.
    expect(written).toMatchObject({ accuracy: 4, scopeBonus: 3 });
  });

  it("skips a mode that states no damage and keeps the record", () => {
    const { gear, rejects, notes } = run(
      "Smoke Test, page(XX11), cost(10), weight(1), techlvl(6), damage(Smoke (7 yd.)), acc(0), rof(1), shots(T(1)), minst(5), skillused(SK:Throwing)",
      "Dart Test, page(XX12), cost(10), weight(1), techlvl(8),"
      + ` newmode(Primary, damage(1d), damtype(pi-), ${ranged}),`
      + " newmode(Follow-up, damage(), damtype(drug effect), rangehalfdam(45), rangemax(150), skillused(SK:Artillery))",
    );
    expect(rejects).toEqual([]);
    expect(gear.map((g) => g.name)).toEqual(["Smoke Test", "Dart Test"]);
    expect(gear[0]!.system.rangedModes).toEqual([]);
    expect(gear[1]!.system.rangedModes).toHaveLength(1);
    expect(gear[1]!.system.rangedModes[0]!.linked).toBeUndefined();
    expect(notes).toEqual(expect.arrayContaining([
      expect.stringMatching(/^Smoke Test: attack: damage "Smoke \(7 yd\.\)" names an effect.*skipped$/),
      expect.stringMatching(/^Dart Test: Follow-up: no damage beside "drug effect".*skipped$/),
    ]));
  });

  it("keeps a weapon whose fragments come before the type, with their own type", () => {
    const { gear, rejects, notes } = run(
      "Grenade Test, page(XX13), cost(10), weight(1), techlvl(7), damage(1d+1), damtype([1d-1 cr] cr ex), acc(0), rof(1), shots(T(1)), minst(5), skillused(SK:Throwing)",
    );
    expect(rejects).toEqual([]);
    expect(gear[0]!.system.rangedModes[0]).toMatchObject({ damageType: "cr", explosive: true, fragmentation: "1d-1", fragmentationType: "cr" });
    // Since API 1.72.0 the mode holds the type, so nothing is left to report.
    expect(notes.some((n) => /^Grenade Test: attack: fragments carry/.test(n))).toBe(false);
  });

  it("reports modes that may be states of one weapon, and keeps them", () => {
    expect(STATE_MODE.test("Folded Stock")).toBe(true);
    expect(STATE_MODE.test("Shot; Folded Stock")).toBe(true);
    expect(STATE_MODE.test("w/o Bipod")).toBe(true);
    expect(STATE_MODE.test("w/ Bipod")).toBe(true);
    expect(STATE_MODE.test("Direct fire")).toBe(false);
    const { gear, notes } = run(
      "Stock Test, page(XX14), cost(100), weight(5), techlvl(7),"
      + ` newmode(Standard, damage(3d), damtype(pi), ${ranged}),`
      + ` newmode(Folded Stock, damage(3d), damtype(pi), ${ranged})`,
    );
    expect(gear[0]!.system.rangedModes).toHaveLength(2);
    expect(notes).toContain('Stock Test: modes "Folded Stock" may be states of one weapon rather than modes; kept as modes');
  });

  it("keeps the RoF's marks on the mode", () => {
    const { gear } = run(
      "Gun Test, page(XX15), cost(100), weight(5), techlvl(8), damage(4d+2), damtype(pi), acc(4), rof(9#/7), rangehalfdam(300), rangemax(3000), shots(45(3)), minst(9), skillused(SK:Guns (Rifle))",
    );
    expect(gear[0]!.system.rangedModes[0]).toMatchObject({ rateOfFire: 9, rateOfFireMark: "#", rateOfFireSecond: 7 });
  });

  it("reads a minimum range only where the record's notes say plainly what it is", () => {
    const launcher = { halfDamageRange: 30, maxRange: 440 };
    expect(minimumRangeOf("{First Range figure is minimum range, not 1/2D.}", launcher)).toEqual({ minRange: 30, halfDamageRange: 0 });
    expect(minimumRangeOf("{Minimum range is 25% of maximum range.},{Requires crew.}", { halfDamageRange: 55, maxRange: 70 })).toEqual({ minRange: 17.5 });
    // A note naming several weapons' minimums does not say which is this one's.
    expect(minimumRangeOf("{Has a minimum range: 10 yards for one launcher, 30 for another.}", launcher)).toBeNull();
    expect(minimumRangeOf(undefined, launcher)).toBeNull();
    expect(minimumRangeOf("{First Range figure is minimum range, not 1/2D.}", { ...launcher, rangeIsStMultiple: true })).toBeNull();
  });

  it("reads a guided or homing missile from notes naming the rule (Campaigns pp. 412-413)", () => {
    expect(guidanceOf("{Guided attack (see p. B412). Gunner uses Artillery (Guided Missile) to attack.}")).toEqual({ guidance: "guided" });
    expect(guidanceOf("{Homing attack (see p. B413). Gunner uses Artillery (Guided Missile) to aim.}"))
      .toEqual({ guidance: "homing", aimingSkill: "Artillery (Guided Missile)" });
    expect(guidanceOf("{Homing (Hyperspectral Vision) attack (see p. B413), at the missile's skill of 10. Firer rolls against Artillery (Guided Missile) to aim. On a success, the missile gets its Acc bonus.}"))
      .toEqual({ guidance: "homing", aimingSkill: "Artillery (Guided Missile)", guidedSkillLevel: 10 });
    // Only the notes' own wording is read, not a mention in passing.
    expect(guidanceOf("{Can be fitted with a homing seeker.}")).toBeNull();
    expect(guidanceOf(undefined)).toBeNull();
    const { gear } = run(
      "Missile Test, page(XX18), cost(100), weight(5), techlvl(8), damage(6dx3), damtype(cr ex), acc(7), rangehalfdam(1000), rangemax(8800), rof(1), shots(1(20)), minst(10), skillused(SK:Artillery (Guided Missile)),"
      + " itemnotes({Homing (Hyperspectral Vision) attack (see p. B413), at the missile's skill of 10. Firer rolls against Artillery (Guided Missile) to aim.})",
    );
    expect(gear[0]!.system.rangedModes[0]).toMatchObject({ guidance: "homing", aimingSkill: "Artillery (Guided Missile)", guidedSkillLevel: 10 });
  });

  it("moves the first Range figure to the minimum on every ranged mode, and reports a note it cannot tie", () => {
    const notes = "itemnotes({First Range figure is minimum range, not 1/2D.})";
    const { gear } = run(
      `Launcher Test, page(XX17), cost(100), weight(5), techlvl(7), ${notes},`
      + " newmode(Primary, damage(4d), armordivisor(10), damtype(cr ex), rangehalfdam(35), rangemax(2200), acc(2), rof(1), shots(1(3)), skillused(SK:Guns (Grenade Launcher))),"
      + " newmode(Linked, damage(4d+1), damtype([2d] cr ex), rangehalfdam(35), rangemax(2200), skillused(SK:Guns (Grenade Launcher)))",
    );
    expect(gear[0]!.system.rangedModes).toHaveLength(1);
    expect(gear[0]!.system.rangedModes[0]).toMatchObject({ minRange: 35, halfDamageRange: 0, maxRange: 2200 });

    const listed = run(
      "Missile Test, page(XX18), cost(100), weight(5), techlvl(7), itemnotes({Missile has a minimum range: 30 for one; 70 for another.}),"
      + ` damage(6dx8), damtype(cr ex), ${ranged}`,
    );
    expect(listed.gear[0]!.system.rangedModes[0]!.minRange).toBeUndefined();
    expect(listed.notes).toContain("Missile Test: its notes give a minimum range this reader cannot tie to the record; none is set");
  });

  it("names the record and both readings when a split DR and the TL disagree", () => {
    const { armor, rejects } = run("Vest Test, page(XX16), cost(100), weight(5), techlvl(6), dr(6/2), location(torso)");
    expect(armor).toEqual([]);
    expect(rejects).toHaveLength(1);
    expect(rejects[0]).toMatch(/^Vest Test: split DR footnote and TL6 disagree: Vest Test has dr\(6\/2\), the high-tech footnote/);
    expect(rejects[0]).toMatch(/techlvl\(6\)/);
  });
});
