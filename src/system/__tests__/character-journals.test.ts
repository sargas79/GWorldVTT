import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Each character's journal entries in a folder of its own, named after its
 * token (sargas79/GWorldVTT#887).
 */

import {
  CHARACTER_FLAG,
  FOLDER_QUERY,
  PARENT_FLAG,
  addFileOption,
  answerFolderQuery,
  charactersLinking,
  fileIntoCharacterFolder,
  characterFolderId,
  characterFolderName,
  fileCharacterJournals,
  findCharacterFolder,
  registerCharacterJournals,
  renameCharacterFolder,
} from "../character-journals.js";

const globals = globalThis as Record<string, unknown>;

const PLAYER = { id: "player", isGM: false };
const STRANGER = { id: "stranger", isGM: false };
const GM = { id: "gm", isGM: true, isSelf: true, query: vi.fn() };

let folders: any[];
let entries: Map<string, any>;
let created: any[];
let nextId: number;

function actor(id: string, name: string, token: string, owners: string[] = []) {
  return {
    id,
    uuid: `Actor.${id}`,
    name,
    documentName: "Actor",
    type: "character",
    prototypeToken: { name: token },
    system: { journalLinks: [] as Array<{ uuid: string; kind: string }> },
    get isOwner() {
      const user = (globals.game as any)?.user;
      return user?.isGM === true || owners.includes(user?.id);
    },
    testUserPermission: (user: any, level: string) => level === "OWNER" && (user?.isGM === true || owners.includes(user?.id)),
  };
}

function entry(id: string, name: string, ownership: Record<string, number>, folder: string | null = null) {
  const document = {
    id,
    name,
    ownership,
    folder,
    update: vi.fn(async (changes: any) => {
      Object.assign(document, changes);
    }),
  };
  entries.set(id, document);
  return document;
}

function asUser(user: any) {
  (globals.game as any).user = user;
}

beforeEach(() => {
  folders = [];
  entries = new Map();
  created = [];
  nextId = 1;
  GM.query = vi.fn();
  globals.Folder = {
    implementation: {
      create: vi.fn(async (data: any) => {
        const folder = {
          ...data,
          id: `folder${nextId++}`,
          update: vi.fn(async (changes: any) => {
            Object.assign(folder, changes);
          }),
        };
        folders.push(folder);
        created.push(folder);
        return folder;
      }),
    },
  };
  globals.game = {
    user: GM,
    users: Object.assign([PLAYER, STRANGER, GM], { activeGM: GM }),
    folders,
    journal: { get: (id: string) => entries.get(id) },
    actors: [],
    i18n: { localize: (key: string) => key },
  };
  globals.CONFIG = { queries: {} };
  globals.Hooks = { on: vi.fn() };
});

afterEach(() => {
  for (const key of ["Folder", "game", "CONFIG", "Hooks", "fromUuid"]) delete globals[key];
});

describe("the folder's name", () => {
  it("is the token's name, else the actor's", () => {
    expect(characterFolderName(actor("a", "Althea Bradstreet", "Allie"))).toBe("Allie");
    expect(characterFolderName(actor("a", "Althea Bradstreet", " "))).toBe("Althea Bradstreet");
  });
});

describe("a character's folder", () => {
  it("is made on the GM's client inside one parent folder, and found again by the actor's id", async () => {
    const allie = actor("a", "Althea", "Allie");
    const id = await characterFolderId(allie);
    expect(created).toHaveLength(2);
    const [parent, own] = created;
    expect(parent.flags.gworld[PARENT_FLAG]).toBe(true);
    expect(own).toMatchObject({ name: "Allie", type: "JournalEntry", folder: parent.id });
    expect(own.flags.gworld[CHARACTER_FLAG]).toBe("a");
    expect(id).toBe(own.id);

    expect(await characterFolderId(allie)).toBe(own.id);
    expect(created).toHaveLength(2);
  });

  it("is one per character, even for two of the same name", async () => {
    const one = await characterFolderId(actor("a", "Sam", "Sam"));
    const two = await characterFolderId(actor("b", "Sam", "Sam"));
    expect(one).not.toBe(two);
    expect(created.filter((f) => f.flags.gworld[PARENT_FLAG])).toHaveLength(1);
  });

  it("is made once when asked for twice at the same moment", async () => {
    const allie = actor("a", "Althea", "Allie");
    const [one, two] = await Promise.all([characterFolderId(allie), characterFolderId(allie)]);
    expect(one).toBe(two);
    expect(created).toHaveLength(2);
  });

  it("is still found by its flag after the GM renames or moves it", async () => {
    const allie = actor("a", "Althea", "Allie");
    const id = await characterFolderId(allie);
    Object.assign(findCharacterFolder(allie), { name: "Party / Allie", folder: null });
    expect(await characterFolderId(allie)).toBe(id);
  });
});

describe("a player's entry", () => {
  it("asks the active GM's client for the folder", async () => {
    GM.isSelf = false;
    GM.query = vi.fn(async () => "folder9");
    asUser(PLAYER);
    const allie = actor("a", "Althea", "Allie", ["player"]);
    expect(await characterFolderId(allie)).toBe("folder9");
    expect(GM.query).toHaveBeenCalledWith(FOLDER_QUERY, { actorUuid: "Actor.a" }, expect.anything());
    GM.isSelf = true;
  });

  it("is made loose with no GM connected", async () => {
    asUser(PLAYER);
    (globals.game as any).users.activeGM = null;
    expect(await characterFolderId(actor("a", "Althea", "Allie", ["player"]))).toBeNull();
    expect(created).toHaveLength(0);
  });

  it("is made loose when the GM's client doesn't answer", async () => {
    GM.isSelf = false;
    GM.query = vi.fn(async () => {
      throw new Error("timed out");
    });
    asUser(PLAYER);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await characterFolderId(actor("a", "Althea", "Allie", ["player"]))).toBeNull();
    warn.mockRestore();
    GM.isSelf = true;
  });
});

describe("a GM's entry", () => {
  it("is made loose when the folder can't be made", async () => {
    (globals.Folder as any).implementation.create = vi.fn(async () => {
      throw new Error("too deep");
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await characterFolderId(actor("a", "Althea", "Allie"))).toBeNull();
    warn.mockRestore();
  });
});

describe("the GM's side of the query", () => {
  it("makes the folder for the character's owner, and for nobody else", async () => {
    const allie = actor("a", "Althea", "Allie", ["player"]);
    globals.fromUuid = vi.fn(async () => allie);
    expect(await answerFolderQuery({ actorUuid: "Actor.a" }, { user: STRANGER })).toBeNull();
    expect(created).toHaveLength(0);
    const id = await answerFolderQuery({ actorUuid: "Actor.a" }, { user: PLAYER });
    expect(id).toBe(findCharacterFolder(allie).id);
  });

  it("refuses anything but an actor", async () => {
    globals.fromUuid = vi.fn(async () => ({ documentName: "Scene" }));
    expect(await answerFolderQuery({ actorUuid: "Scene.x" }, { user: GM })).toBeNull();
    expect(await answerFolderQuery(null, { user: GM })).toBeNull();
  });

  it("is registered as a user query", () => {
    registerCharacterJournals();
    expect((globals.CONFIG as any).queries[FOLDER_QUERY]).toBe(answerFolderQuery);
  });
});

describe("renaming", () => {
  it("follows the token's name", async () => {
    const allie = actor("a", "Althea", "Allie");
    await characterFolderId(allie);
    allie.prototypeToken.name = "Al";
    await renameCharacterFolder(allie, { prototypeToken: { name: "Al" } });
    expect(findCharacterFolder(allie).name).toBe("Al");
  });

  it("is left to the active GM, and ignores other changes", async () => {
    const allie = actor("a", "Althea", "Allie");
    await characterFolderId(allie);
    allie.prototypeToken.name = "Al";
    await renameCharacterFolder(allie, { system: {} });
    expect(findCharacterFolder(allie).name).toBe("Allie");
    GM.isSelf = false;
    await renameCharacterFolder(allie, { prototypeToken: { name: "Al" } });
    expect(findCharacterFolder(allie).name).toBe("Allie");
    GM.isSelf = true;
  });
});

describe("filing by hand", () => {
  it("finds the characters linking the entry or one of its pages", () => {
    const allie = actor("a", "Althea", "Allie");
    const sam = actor("b", "Sam", "Sam");
    const npc = { ...actor("c", "Thug", "Thug"), type: "npc" };
    allie.system.journalLinks = [{ uuid: "JournalEntry.p1", kind: "note" }];
    sam.system.journalLinks = [{ uuid: "JournalEntry.p1.JournalEntryPage.x", kind: "clue" }];
    npc.system.journalLinks = [{ uuid: "JournalEntry.p1", kind: "note" }];
    const found = (list: any[]) => list.map((a) => a.id);
    expect(found(charactersLinking({ uuid: "JournalEntry.p1" }, [allie, sam, npc]))).toEqual(["a", "b"]);
    expect(found(charactersLinking({ uuid: "JournalEntry.p10" }, [allie, sam]))).toEqual([]);
  });

  it("moves the entry into the character's folder, from wherever it was", async () => {
    const allie = actor("a", "Althea", "Allie");
    const info = entry("p1", "Personal Information", { default: 0, gm: 3 }, "gmFolder");
    const folder = await fileIntoCharacterFolder(info, allie);
    expect(folder.name).toBe("Allie");
    expect(info.folder).toBe(folder.id);
  });

  it("is offered to a GM, for the world's entries only", () => {
    const options: any[] = [];
    const world = { id: "p1" };
    const packed = { id: "p2", pack: "world.notes" };
    const collection = new Map([["p1", world], ["p2", packed]]);
    addFileOption({ collection }, options);
    const row = (id: string) => ({ closest: () => ({ dataset: { entryId: id } }) }) as any;
    expect(options).toHaveLength(1);
    expect(options[0].visible(row("p1"))).toBe(true);
    expect(options[0].visible(row("p2"))).toBe(false);
    asUser(PLAYER);
    expect(options[0].visible(row("p1"))).toBe(false);
  });
});

describe("filing loose entries", () => {
  it("moves the character's own loose entries and leaves the rest", async () => {
    const allie = actor("a", "Althea", "Allie", ["player"]);
    const note = entry("n1", "Find a Room", { default: 0, player: 3 });
    const named = entry("n2", "Althea: New quest", { default: 0, gm: 3 });
    const handout = entry("h1", "Incident Record", { default: 2, gm: 3 });
    const filed = entry("n3", "Old note", { player: 3 }, "gmFolder");
    allie.system.journalLinks = [
      { uuid: "JournalEntry.n1", kind: "note" },
      { uuid: "JournalEntry.n2", kind: "quest" },
      { uuid: "JournalEntry.h1", kind: "clue" },
      { uuid: "JournalEntry.n3", kind: "note" },
      { uuid: "JournalEntry.n1.JournalEntryPage.p1", kind: "note" },
      { uuid: "Actor.b", kind: "person" },
    ];
    const result = await fileCharacterJournals([allie]);
    const folder = findCharacterFolder(allie).id;
    expect(result).toEqual({ changed: 2, failed: 0 });
    expect(note.folder).toBe(folder);
    expect(named.folder).toBe(folder);
    expect(handout.folder).toBeNull();
    expect(filed.folder).toBe("gmFolder");
  });

  it("makes no folder for a character with nothing to file", async () => {
    const allie = actor("a", "Althea", "Allie", ["player"]);
    entry("h1", "Incident Record", { default: 2 });
    allie.system.journalLinks = [{ uuid: "JournalEntry.h1", kind: "clue" }];
    await fileCharacterJournals([allie]);
    expect(created).toHaveLength(0);
  });

  it("does not file an entry owned by a player who doesn't own the character", async () => {
    const allie = actor("a", "Althea", "Allie", ["player"]);
    const theirs = entry("s1", "Stranger's note", { stranger: 3 });
    allie.system.journalLinks = [{ uuid: "JournalEntry.s1", kind: "note" }];
    await fileCharacterJournals([allie]);
    expect(theirs.folder).toBeNull();
  });
});
