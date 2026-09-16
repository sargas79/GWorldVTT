import { describe, expect, it } from "vitest";

import { addLink, kindForDrop, readLinks, removeLink } from "../sheet-v2/journal-links.js";

describe("a character's journal links", () => {
  it("reads stored links, dropping malformed ones and defaulting an unknown kind to a note", () => {
    expect(readLinks([{ uuid: "JournalEntry.a", kind: "quest" }, { uuid: "", kind: "clue" }, { kind: "place" }, { uuid: "Actor.b", kind: "rumour" }]))
      .toEqual([{ uuid: "JournalEntry.a", kind: "quest" }, { uuid: "Actor.b", kind: "note" }]);
    expect(readLinks(undefined)).toEqual([]);
  });

  it("adds a link once, and changes its kind when it is linked again", () => {
    const one = addLink([], "JournalEntry.a", "quest");
    expect(one).toEqual([{ uuid: "JournalEntry.a", kind: "quest" }]);
    expect(addLink(one, "JournalEntry.a", "clue")).toEqual([{ uuid: "JournalEntry.a", kind: "clue" }]);
    expect(addLink(one, "JournalEntry.b", "note")).toHaveLength(2);
  });

  it("removes a link", () => {
    expect(removeLink([{ uuid: "a", kind: "quest" }, { uuid: "b", kind: "note" }], "a")).toEqual([{ uuid: "b", kind: "note" }]);
  });

  it("links a dropped actor as a person, a scene as a place, and a journal as what is being looked at", () => {
    expect(kindForDrop("Actor", "quest")).toBe("person");
    expect(kindForDrop("Scene", "quest")).toBe("place");
    expect(kindForDrop("JournalEntryPage", "clue")).toBe("clue");
    expect(kindForDrop("JournalEntry", "profile")).toBe("note");
  });
});
