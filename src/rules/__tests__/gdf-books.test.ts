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
  groupsOf,
  powerOfRecord,
  qualityVariantOf,
  reference,
  talentSkillsOf,
} from "../../../tools/parse-gdf.mjs";

describe("reference", () => {
  it("cites the book being read, and only that book", () => {
    expect(reference("MA52, B203", "MA", "Martial Arts")).toBe("Martial Arts p. 52");
    expect(reference("B203, MA52", "B", "Basic Set: Characters")).toBe("Basic Set: Characters p. 203");
  });

  it("lists every page of the book a record spans", () => {
    expect(reference("B271, B276", "B", "Basic Set: Characters")).toBe("Basic Set: Characters p. 271, 276");
  });

  it("names the book alone when the record cites no page of it", () => {
    expect(reference("B203", "MA", "Martial Arts")).toBe("Martial Arts");
    expect(reference(undefined, "B", "Basic Set: Characters")).toBe("Basic Set: Characters");
  });

  it("does not mistake one prefix for the start of another", () => {
    expect(reference("LTC12", "LT", "Low-Tech")).toBe("Low-Tech");
    expect(reference("LT12", "LT", "Low-Tech")).toBe("Low-Tech p. 12");
  });

  // GCA writes a numbered series as `MH1:23`, and the prefix is the same
  // whether or not whoever runs the parser types the colon.
  it("reads a citation written with a colon, given the prefix either way", () => {
    expect(reference("MH1:23", "MH1", "Monster Hunters 1")).toBe("Monster Hunters 1 p. 23");
    expect(reference("MH1:23", "MH1:", "Monster Hunters 1")).toBe("Monster Hunters 1 p. 23");
    expect(reference("MH1:41, MH1:42", "MH1", "Monster Hunters 1")).toBe("Monster Hunters 1 p. 41, 42");
    expect(reference("B:203", "B", "Basic Set: Characters")).toBe("Basic Set: Characters p. 203");
  });

  it("does not read one numbered book as another", () => {
    // Dungeon Fantasy 11 is not page 15 of Dungeon Fantasy 1...
    expect(reference("DF11:5", "DF1", "Dungeon Fantasy 1")).toBe("Dungeon Fantasy 1");
    // ...and Monster Hunters 1 is not page 1 of a book called "MH".
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

  it("changes nothing for the Basic Set, whose published names are kept", () => {
    const basicSet = { supplement: false };
    expect(entryName("_Unused Quirk 1", siblings, basicSet)).toBe("_Unused Quirk 1");
    expect(entryName("Area Knowledge ([Area])", siblings, basicSet)).toBe("Area Knowledge ([Area])");
  });

  it("leaves a skill or technique its blank, since it needs the skill it is bought for", () => {
    const skills = { blankSpecialty: false };
    expect(entryName("Feint (%Melee Combat Skill%)", siblings, skills)).toBe("Feint (%Melee Combat Skill%)");
    expect(entryName("_Hidden Lore", siblings, skills)).toBe("Hidden Lore");
  });
});

describe("a Talent's skills", () => {
  // As the Monster Hunters 1 file writes them, in two sections of the file.
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
  // Monster Hunters 1 files its powers as "_MH <power>", and its psionics as
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
