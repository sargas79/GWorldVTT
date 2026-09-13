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
  qualityVariantOf,
  reference,
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
