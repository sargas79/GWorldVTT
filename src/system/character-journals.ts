/**
 * A folder in the Journal sidebar for each character's own entries
 * (sargas79/GWorldVTT#887).
 *
 * The character sheet's Journal tab makes quests, clues, people, places and
 * notes as world journal entries. Players rename them, so a sidebar of loose
 * "Find a Room" and "Personal Information" entries soon says nothing about
 * whose they are. Each character's entries go in a folder named after its
 * token, inside one parent folder that keeps them out of the GM's own tree.
 *
 * The folder is found by the actor's id, kept in a flag, never by its name:
 * two characters of one name get a folder each, and a renamed token's folder
 * is renamed with it. Only a GM may make a folder, so a player's first entry
 * asks the active GM's client for it through a Foundry user query, which
 * makes it only for a GM or the character's owner. With no GM connected the
 * entry is made where it always was, and the GM's next load files it, as it
 * files the entries made before the folders.
 *
 * Players see a folder only where they can see an entry in it, so each sees
 * their own character's folder and nobody else's.
 */

import { SYSTEM_ID } from "./constants.js";
import { readLinks } from "./sheet-v2/journal-links.js";

/** The flag on a character's folder: the actor's id. */
export const CHARACTER_FLAG = "characterJournal";

/** The flag on the parent folder that holds every character's. */
export const PARENT_FLAG = "characterJournals";

/** The query the GM's client answers with a character's folder. */
export const FOLDER_QUERY = `${SYSTEM_ID}.characterJournal`;

/** How long to wait for the GM's client before giving up. */
const QUERY_TIMEOUT_MS = 10_000;

/** The name of a character's folder: its token's name, else its own. */
export function characterFolderName(actor: any): string {
  const token = String(actor?.prototypeToken?.name ?? "").trim();
  return token || String(actor?.name ?? "").trim() || "?";
}

function journalFolders(): any[] {
  const folders = (game as any).folders;
  if (!folders) return [];
  return [...folders].filter((folder: any) => folder?.type === "JournalEntry");
}

function flagOf(folder: any, key: string): unknown {
  return folder?.flags?.[SYSTEM_ID]?.[key];
}

/** The character's folder, where one has been made. */
export function findCharacterFolder(actor: any): any {
  const id = actor?.id;
  if (!id) return null;
  return journalFolders().find((folder) => flagOf(folder, CHARACTER_FLAG) === id) ?? null;
}

function findParentFolder(): any {
  return journalFolders().find((folder) => flagOf(folder, PARENT_FLAG) === true) ?? null;
}

function createFolder(data: object): Promise<any> {
  return (globalThis as any).Folder.implementation.create(data);
}

/** Made once per load, however many characters ask at the same moment. */
let parentMaking: Promise<any> | null = null;
const characterMaking = new Map<string, Promise<any>>();

async function parentFolder(): Promise<any> {
  const found = findParentFolder();
  if (found) return found;
  parentMaking ??= createFolder({
    name: game.i18n.localize("GWORLD.CharacterJournals.Folder"),
    type: "JournalEntry",
    flags: { [SYSTEM_ID]: { [PARENT_FLAG]: true } },
  }).finally(() => {
    parentMaking = null;
  });
  return parentMaking;
}

/**
 * The character's folder, made where there is none yet. Only a GM's client
 * can make it; anywhere else, null.
 */
export async function makeCharacterFolder(actor: any): Promise<any> {
  const found = findCharacterFolder(actor);
  if (found) return found;
  if ((game as any).user?.isGM !== true || !actor?.id) return null;
  let making = characterMaking.get(actor.id);
  if (!making) {
    making = (async () => {
      const parent = await parentFolder();
      return createFolder({
        name: characterFolderName(actor),
        type: "JournalEntry",
        folder: parent?.id ?? null,
        flags: { [SYSTEM_ID]: { [CHARACTER_FLAG]: actor.id } },
      });
    })().finally(() => characterMaking.delete(actor.id));
    characterMaking.set(actor.id, making);
  }
  return making;
}

/**
 * The id of the folder a new entry for the character goes in: made here for
 * a GM, asked of the active GM's client for the character's owner, and null
 * where neither can be had, so the entry is made loose as before.
 */
export async function characterFolderId(actor: any): Promise<string | null> {
  const found = findCharacterFolder(actor);
  if (found) return found.id ?? null;
  const user = (game as any).user;
  if (user?.isGM === true) return (await makeCharacterFolder(actor))?.id ?? null;
  if (!actor?.isOwner) return null;
  const gm = (game as any).users?.activeGM;
  if (!gm || gm.isSelf || typeof gm.query !== "function") return null;
  try {
    const id = await gm.query(FOLDER_QUERY, { actorUuid: String(actor.uuid ?? "") }, { timeout: QUERY_TIMEOUT_MS });
    return typeof id === "string" && id ? id : null;
  } catch (error) {
    console.warn(`${SYSTEM_ID} | the GM's client could not make a journal folder for ${String(actor?.name ?? "")}`, error);
    return null;
  }
}

/**
 * The GM's side of the query: the id of the character's folder, made for a
 * GM or the actor's owner. Who asks comes from the `user` Foundry hands the
 * handler, never from the payload.
 */
export async function answerFolderQuery(data: unknown, context?: { user?: any }): Promise<string | null> {
  const request = data as { actorUuid?: unknown } | null;
  if (!request || typeof request.actorUuid !== "string" || !request.actorUuid) return null;
  const actor = await fromUuid(request.actorUuid).catch(() => null);
  if (!actor || (actor as any).documentName !== "Actor") return null;
  const user = context?.user;
  if (!user) return null;
  if (user.isGM !== true && (actor as any).testUserPermission?.(user, "OWNER") !== true) return null;
  return (await makeCharacterFolder(actor))?.id ?? null;
}

/** Whether this client is the one GM that keeps the folders in step. */
function keepsFolders(): boolean {
  return (game as any).users?.activeGM?.isSelf === true;
}

/** Renames a character's folder when its token's name, or its own, changes. */
export async function renameCharacterFolder(actor: any, changes: any): Promise<void> {
  if (!keepsFolders()) return;
  if (changes?.name === undefined && changes?.prototypeToken?.name === undefined) return;
  const folder = findCharacterFolder(actor);
  const name = characterFolderName(actor);
  if (folder && folder.name !== name) await folder.update({ name });
}

/** A world journal entry's id from a link, or null for a page, a compendium's entry or anything else. */
function worldEntryId(uuid: string): string | null {
  const match = /^JournalEntry\.([^.]+)$/.exec(uuid);
  return match?.[1] ?? null;
}

/**
 * Whether the sheet made the entry for the character: a player who owns the
 * character owns the entry, as the sheet makes it, or it still has the name
 * the sheet gave it. A GM's handout the player only linked is neither.
 */
function madeForCharacter(entry: any, actor: any): boolean {
  if (String(entry?.name ?? "").startsWith(`${String(actor?.name ?? "")}: `)) return true;
  const ownership = entry?.ownership ?? {};
  for (const user of (game as any).users ?? []) {
    if (user?.isGM) continue;
    if (ownership[user.id] !== 3) continue;
    if (actor?.testUserPermission?.(user, "OWNER") === true) return true;
  }
  return false;
}

/**
 * Files a character's own entries left loose at the top of the sidebar: the
 * ones the sheet made, linked to the character, and in no folder. Entries
 * the GM has filed, pages and anything only linked are left where they are.
 * Returns how many moved.
 */
export async function fileCharacterJournals(actors: Iterable<any>): Promise<{ changed: number; failed: number }> {
  let changed = 0;
  let failed = 0;
  const journal = (game as any).journal;
  for (const actor of actors) {
    for (const link of readLinks(actor?.system?.journalLinks)) {
      const id = worldEntryId(link.uuid);
      const entry = id ? journal?.get?.(id) : null;
      if (!entry || entry.folder || !madeForCharacter(entry, actor)) continue;
      try {
        const folder = await makeCharacterFolder(actor);
        if (!folder) continue;
        await entry.update({ folder: folder.id });
        changed += 1;
      } catch (error) {
        failed += 1;
        console.error(`${SYSTEM_ID} | could not file the journal entry ${String(entry?.name ?? "")}`, error);
      }
    }
  }
  return { changed, failed };
}

/**
 * Files the loose entries on the GM's load: those made before the folders,
 * and those made while no GM was connected to make one.
 */
export async function fileLooseCharacterJournals(): Promise<void> {
  if (!keepsFolders()) return;
  await fileCharacterJournals((game as any).actors ?? []);
}

/**
 * Lets the GM's client make the folders, and keeps their names in step.
 * Called during `init`.
 */
export function registerCharacterJournals(): void {
  const queries = (CONFIG as any).queries;
  if (queries && typeof queries === "object") queries[FOLDER_QUERY] = answerFolderQuery;
  Hooks.on("updateActor", (actor: any, changes: any) => {
    void renameCharacterFolder(actor, changes).catch((error) =>
      console.warn(`${SYSTEM_ID} | could not rename the journal folder of ${String(actor?.name ?? "")}`, error),
    );
  });
}
