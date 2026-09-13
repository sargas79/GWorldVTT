import { describe, expect, it } from "vitest";

import {
  bookState,
  chosenSources,
  defaultSources,
  groupByBook,
  summarisePack,
  type PackSummary,
} from "../compendium-sources.js";

const packs: PackSummary[] = [
  { collection: "gworld.skills", label: "GURPS Skills", packageType: "system", packageName: "gworld", documentName: "Item" },
  { collection: "gworld.equipment", label: "GURPS Equipment", packageType: "system", packageName: "gworld", documentName: "Item" },
  { collection: "world.house-rules", label: "House rules", packageType: "world", packageName: "test-world", documentName: "Item" },
  { collection: "some-module.gear", label: "More gear", packageType: "module", packageName: "some-module", documentName: "Item" },
  { collection: "world.npcs", label: "NPCs", packageType: "world", packageName: "test-world", documentName: "Actor" },
];

describe("defaultSources", () => {
  it("is the system's own Item packs and nothing else", () => {
    expect(defaultSources(packs, "gworld")).toEqual(["gworld.skills", "gworld.equipment"]);
  });
});

describe("chosenSources", () => {
  it("honours a setting that names packs which exist", () => {
    expect(chosenSources(packs, ["world.house-rules", "gworld.skills"], "gworld")).toEqual([
      "world.house-rules",
      "gworld.skills",
    ]);
  });

  it("drops packs that are no longer there", () => {
    expect(chosenSources(packs, ["world.gone", "some-module.gear"], "gworld")).toEqual([
      "some-module.gear",
    ]);
  });

  /**
   * A world configured for a pack that has since been uninstalled must not
   * come up with an empty picker: the book is the fallback.
   */
  it("falls back to the system's packs when nothing named exists", () => {
    expect(chosenSources(packs, ["world.gone"], "gworld")).toEqual(["gworld.skills", "gworld.equipment"]);
    expect(chosenSources(packs, [], "gworld")).toEqual(["gworld.skills", "gworld.equipment"]);
    expect(chosenSources(packs, "nonsense", "gworld")).toEqual(["gworld.skills", "gworld.equipment"]);
  });

  it("never offers a pack of the wrong document type", () => {
    expect(chosenSources(packs, ["world.npcs"], "gworld")).toEqual(["gworld.skills", "gworld.equipment"]);
  });
});

describe("summarisePack", () => {
  it("reads the book a pack belongs to from its manifest flags", () => {
    const pack = {
      collection: "ma.skills",
      title: "Martial Arts Skills",
      documentName: "Item",
      metadata: {
        packageType: "module",
        packageName: "ma",
        flags: { gworld: { book: "martial-arts", bookTitle: "Martial Arts" } },
      },
    };
    expect(summarisePack(pack)).toMatchObject({
      collection: "ma.skills",
      book: "martial-arts",
      bookTitle: "Martial Arts",
    });
  });

  it("leaves the book off a pack that names none", () => {
    const summary = summarisePack({ collection: "world.x", documentName: "Item", metadata: {} });
    expect("book" in summary).toBe(false);
    expect("bookTitle" in summary).toBe(false);
  });
});

describe("groupByBook", () => {
  const ma = (name: string): PackSummary => ({
    collection: `ma.${name}`,
    label: name,
    packageType: "module",
    packageName: "ma",
    documentName: "Item",
    book: "martial-arts",
    bookTitle: "Martial Arts",
  });

  it("puts the packs of one book on one row, under the book's title", () => {
    const rows = groupByBook([ma("skills"), ma("techniques"), ma("gear")]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ title: "Martial Arts", flagged: true });
    expect(rows[0]?.packs.map((p) => p.collection)).toEqual(["ma.skills", "ma.techniques", "ma.gear"]);
  });

  it("falls back to the package name for packs that name no book", () => {
    const rows = groupByBook(packs.filter((p) => p.packageType !== "system"));
    expect(rows.map((r) => [r.title, r.flagged, r.packs.length])).toEqual([
      ["test-world", false, 2],
      ["some-module", false, 1],
    ]);
  });

  it("keeps two books of one module apart, and the same book of two modules apart", () => {
    const other = { ...ma("spells"), book: "magic", bookTitle: "Magic" };
    const elsewhere = { ...ma("more"), collection: "other.more", packageName: "other" };
    const rows = groupByBook([ma("skills"), other, elsewhere]);
    expect(rows.map((r) => r.title)).toEqual(["Martial Arts", "Magic", "Martial Arts"]);
  });

  it("uses the book's id as its title when no title was given", () => {
    const untitled = { ...ma("skills") };
    delete untitled.bookTitle;
    expect(groupByBook([untitled])[0]?.title).toBe("martial-arts");
  });
});

describe("bookState", () => {
  const row = groupByBook(packs.slice(0, 2))[0]!;

  it("is all, some or none by how many of the book's packs are ticked", () => {
    expect(bookState(row, new Set(["gworld.skills", "gworld.equipment"]))).toBe("all");
    expect(bookState(row, new Set(["gworld.skills"]))).toBe("some");
    expect(bookState(row, new Set(["world.house-rules"]))).toBe("none");
  });
});
