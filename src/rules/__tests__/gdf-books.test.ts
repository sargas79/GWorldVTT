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
  handKeptTraitNames,
  isBookkeeping,
  parseSkillUsed,
  parseSkillUsedWithModifier,
  unarmedSkillsIn,
  powerOfRecord,
  qualityVariantOf,
  reference,
  talentSkillsOf,
  techniqueDefault,
  techniqueDefaults,
  techniqueRebasing,
  traitAttackModes,
} from "../../../tools/parse-gdf.mjs";

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
