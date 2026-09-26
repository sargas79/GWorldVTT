/**
 * Which party an actor is in.
 *
 * A party lists its members; a character does not name its party. So the
 * question "which party is this character in?" is answered from an index
 * built over the world's parties, kept until one of them changes. It is built
 * from the parties' stored data, which is there from the moment the world's
 * actors are constructed, before any of them is prepared -- so a character's
 * first preparation already finds its party.
 *
 * When a party's members change, every member is prepared again and its open
 * windows redrawn, because their sheets name the party. The campaign's terms
 * are world settings (campaign.ts), not the party's.
 */

import { SYSTEM_ID } from "./constants.js";
import {
  addMembers as addToList,
  PINNED_FLAG,
  canJoin,
  partyAwardPoints,
  partyAwardRecipients,
  removeMember as removeFromList,
} from "./party/roster.js";
import { withAward, type PointAward } from "../rules/character-points.js";
import { registerPartySidebar } from "./party/sidebar.js";

export const PARTY_TYPE = "party";

/** Fired with the party and its members whenever a party's membership changes. */
export const PARTY_CHANGED_HOOK = "gworld.partyChanged";

const L = (key: string, data?: Record<string, unknown>) =>
  data ? game.i18n.format(`GWORLD.Party.${key}`, data) : game.i18n.localize(`GWORLD.Party.${key}`);

export function isParty(actor: any): boolean {
  return actor?.type === PARTY_TYPE;
}

/** Every party in the world, in the sidebar's order. */
export function worldParties(): any[] {
  // Read off the global so a test without Foundry gets an empty world, not a throw.
  const actors = (globalThis as any).game?.actors;
  if (!actors) return [];
  return [...actors].filter((a: any) => a?.type === PARTY_TYPE);
}

/** Member UUID to party id. Null until asked for, and again after a party changes. */
let index: Map<string, string> | null = null;

/** What each party's members were when last seen, so a member that left is refreshed too. */
const lastMembers = new Map<string, string[]>();

function memberUuids(party: any): string[] {
  return ((party?.system?.members ?? []) as Array<{ uuid: string }>).map((m) => String(m?.uuid ?? ""));
}

/** Records every party's members as they stand, so the first change after a load knows who left. */
function rememberMembers(): void {
  for (const party of worldParties()) lastMembers.set(String(party.id), memberUuids(party));
}

function buildIndex(): Map<string, string> {
  const map = new Map<string, string>();
  for (const party of worldParties()) {
    for (const member of party.system?.members ?? []) {
      const uuid = String(member?.uuid ?? "");
      if (uuid && !map.has(uuid)) map.set(uuid, String(party.id));
    }
  }
  return map;
}

export function invalidatePartyIndex(): void {
  index = null;
}

/** The UUID a party lists an actor under: a token's actor is listed by its world actor. */
function memberUuid(actor: any): string | null {
  const base = actor?.isToken ? (actor.token?.baseActor ?? null) : actor;
  const uuid = base?.uuid;
  return typeof uuid === "string" && uuid.startsWith("Actor.") ? uuid : null;
}

/** The party an actor belongs to, or null. */
export function partyOf(actor: any): any | null {
  const uuid = memberUuid(actor);
  if (!uuid) return null;
  index ??= buildIndex();
  const id = index.get(uuid);
  return id ? ((globalThis as any).game?.actors?.get?.(id) ?? null) : null;
}

/** A world actor by UUID, or null. */
export function resolveMember(uuid: string): any | null {
  try {
    return fromUuidSync(uuid, { strict: false }) ?? null;
  } catch {
    return null;
  }
}

/** A party's members that still exist, in the party's order. */
export function membersOf(party: any): any[] {
  return ((party?.system?.members ?? []) as Array<{ uuid: string }>)
    .map((m) => resolveMember(String(m?.uuid ?? "")))
    .filter((actor) => actor !== null);
}

/** Prepares an actor again and redraws every window showing it: its sheet, the guided build. */
export function refreshActor(actor: any): void {
  if (!actor) return;
  try {
    actor.reset?.();
  } catch (error) {
    console.warn(`${SYSTEM_ID} | could not prepare ${actor.name} again`, error);
  }
  const instances = (foundry.applications as any).instances as Map<number, any> | undefined;
  for (const app of instances?.values() ?? []) {
    if (app?.document === actor || app?.options?.actor === actor) void app.render?.();
  }
}

/** Prepares every member again, and anyone who was a member the last time the party was seen. */
export function refreshMembers(party: any): void {
  const now = memberUuids(party);
  const before = lastMembers.get(String(party?.id)) ?? [];
  lastMembers.set(String(party?.id), now);
  for (const uuid of new Set([...before, ...now])) refreshActor(resolveMember(uuid));
}

/**
 * Puts actors into a party. Only people join -- a vehicle or another party is
 * refused, as is somebody already in -- and an actor in some other party
 * leaves it first: one party per actor.
 */
export async function addMembers(party: any, actors: readonly any[]): Promise<void> {
  if (!party?.isOwner) return;
  const current = (party.system?.members ?? []) as Array<{ uuid: string }>;
  const accepted: string[] = [];
  for (const actor of actors) {
    if (!actor) continue;
    const name = String(actor.name ?? "");
    if (!canJoin(actor.type)) {
      ui.notifications?.warn(L("CannotJoin", { name }));
      continue;
    }
    const uuid = memberUuid(actor);
    if (!uuid) continue;
    if (current.some((m) => m.uuid === uuid) || accepted.includes(uuid)) {
      ui.notifications?.info(L("AlreadyIn", { name, party: String(party.name ?? "") }));
      continue;
    }
    accepted.push(uuid);
  }
  if (accepted.length === 0) return;

  for (const other of worldParties()) {
    if (other === party || !other.isOwner) continue;
    const members = (other.system?.members ?? []) as Array<{ uuid: string }>;
    const leaving = accepted.filter((uuid) => members.some((m) => m.uuid === uuid));
    if (leaving.length === 0) continue;
    await other.update({ "system.members": leaving.reduce((list, uuid) => removeFromList(list, uuid), members) });
  }
  await party.update({ "system.members": addToList(current, accepted) });
}

export async function removeMember(party: any, uuid: string): Promise<void> {
  if (!party?.isOwner || !uuid) return;
  await party.update({ "system.members": removeFromList(party.system?.members ?? [], uuid) });
}

/** The characters in a party an award would reach: its members that still exist, less the NPCs. */
export function awardRecipientsOf(party: any): any[] {
  return partyAwardRecipients(membersOf(party));
}

/**
 * Awards the same character points to every character in the party (#871):
 * each gets the whole award, added to their own log exactly as the award on
 * their sheet adds it, and one chat message says who got what.
 *
 * Only a GM awards points. NPC members get nothing; a number that is not a
 * whole number above zero awards nothing. Resolves to the characters awarded.
 */
export async function awardPartyPoints(
  party: any,
  points: number,
  options: { note?: string; session?: string } = {},
): Promise<any[]> {
  if (!isParty(party) || (globalThis as any).game?.user?.isGM !== true) return [];
  const amount = partyAwardPoints(points);
  if (amount === null) return [];
  const recipients = awardRecipientsOf(party);
  if (recipients.length === 0) return [];

  const note = String(options.note ?? "").trim();
  const session = String(options.session ?? "").trim();
  const at = Date.now();
  for (const actor of recipients) {
    const awards = (actor.system?.points?.awards ?? []) as PointAward[];
    await actor.update({ "system.points.awards": withAward(awards, { points: amount, note, session, at }) });
  }

  const esc = foundry.utils.escapeHTML;
  const names = recipients.map((a: any) => String(a.name ?? "")).join(", ");
  const detail = [session, note].filter(Boolean).join(" · ");
  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ alias: String(party.name ?? "") }),
    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    content: `<div class="gworld gworld-chat"><div class="gc-head"><span class="gc-label">${esc(L("AwardChatTitle"))}</span>`
      + `<span class="gc-target">${esc(L("AwardChatPoints", { points: amount }))}</span></div>`
      + `<div class="gc-note">${esc(L("AwardChatWho", { names }))}</div>`
      + (detail ? `<div class="gc-note">${esc(detail)}</div>` : "")
      + `</div>`,
    flags: { [SYSTEM_ID]: { partyAward: { partyUuid: String(party.uuid), points: amount, members: recipients.map((a: any) => String(a.uuid)) } } },
  });
  return recipients;
}

/** Wires the index, the members' refresh, a new party's ownership and the sidebar. Called at init. */
export function registerPartyHooks(): void {
  // Players can read the party; only the GM changes it.
  Hooks.on("preCreateActor", (document: any, data: any) => {
    if (data?.type !== PARTY_TYPE || data?.ownership) return;
    document.updateSource({ ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER } });
  });

  const changed = (party: any) => {
    invalidatePartyIndex();
    refreshMembers(party);
    // The directory redraws itself only for a name, an image, ownership, a
    // sort or a folder; a member joining is none of those.
    void ui.actors?.render?.();
    Hooks.callAll(PARTY_CHANGED_HOOK, party, membersOf(party));
  };

  // The members as they stand when the world opens: a member that leaves in
  // the first change afterwards is prepared again like any other.
  Hooks.once("ready", rememberMembers);

  Hooks.on("createActor", (document: any) => {
    if (isParty(document)) changed(document);
  });
  Hooks.on("updateActor", (document: any, diff: any) => {
    if (!isParty(document)) return;
    if (diff?.system?.members !== undefined) changed(document);
    // Foundry redraws the directory for a name, sort or folder, not a flag:
    // pinning or unpinning the party has to ask, on every client.
    else if (PINNED_FLAG in (diff?.flags?.[SYSTEM_ID] ?? {})) void ui.actors?.render?.();
  });
  Hooks.on("deleteActor", (document: any) => {
    if (!isParty(document)) return;
    const members = membersOf(document);
    invalidatePartyIndex();
    lastMembers.delete(String(document.id));
    for (const member of members) refreshActor(member);
    void ui.actors?.render?.();
    Hooks.callAll(PARTY_CHANGED_HOOK, document, []);
  });

  registerPartySidebar();
}
