/**
 * Which party an actor is in, and what its campaign says.
 *
 * A party lists its members; a character does not name its party. So the
 * question "which party is this character in?" is answered from an index
 * built over the world's parties, kept until one of them changes. It is built
 * from the parties' stored data, which is there from the moment the world's
 * actors are constructed, before any of them is prepared -- so a character's
 * first preparation already finds its party.
 *
 * When a party's members or terms change, every member is prepared again and
 * its open windows redrawn, because their sheets read the party's terms.
 */

import { SYSTEM_ID } from "./constants.js";
import {
  addMembers as addToList,
  canJoin,
  moveMember as moveInList,
  removeMember as removeFromList,
  termsFrom,
  type CampaignTerms,
} from "./party/roster.js";
import { registerPartySidebar } from "./party/sidebar.js";

export const PARTY_TYPE = "party";

/** Fired with the party and its members whenever a party's membership or terms change. */
export const PARTY_CHANGED_HOOK = "gworld.partyChanged";

const L = (key: string, data?: Record<string, unknown>) =>
  data ? game.i18n.format(`GWORLD.Party.${key}`, data) : game.i18n.localize(`GWORLD.Party.${key}`);

export function isParty(actor: any): boolean {
  return actor?.type === PARTY_TYPE;
}

/** Every party in the world, in the sidebar's order. */
export function worldParties(): any[] {
  const actors = (game as any)?.actors;
  if (!actors) return [];
  return [...actors].filter((a: any) => a?.type === PARTY_TYPE);
}

/** Member UUID to party id. Null until asked for, and again after a party changes. */
let index: Map<string, string> | null = null;

/** What each party's members were when last seen, so a member that left is refreshed too. */
const lastMembers = new Map<string, string[]>();

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
  return id ? ((game as any).actors?.get?.(id) ?? null) : null;
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

/** The campaign's terms as they reach one actor, with the party they come from. */
export interface ActorCampaignTerms extends CampaignTerms {
  party: { id: string; uuid: string; name: string };
}

/**
 * The terms of the party an actor is in, nulls kept for what the GM left
 * blank; null for an actor in no party.
 */
export function campaignTerms(actor: any): ActorCampaignTerms | null {
  const party = partyOf(actor);
  if (!party) return null;
  return {
    party: { id: String(party.id), uuid: String(party.uuid), name: String(party.name ?? "") },
    ...termsFrom(party.system?.campaign),
  };
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
  const now = ((party?.system?.members ?? []) as Array<{ uuid: string }>).map((m) => String(m.uuid));
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

export async function moveMember(party: any, uuid: string, by: -1 | 1): Promise<void> {
  if (!party?.isOwner || !uuid) return;
  await party.update({ "system.members": moveInList(party.system?.members ?? [], uuid, by) });
}

/** Wires the index, the members' refresh, a new party's ownership and the sidebar. Called at init. */
export function registerPartyHooks(): void {
  // Players can read the party; only the GM changes it.
  Hooks.on("preCreateActor", (document: any, data: any) => {
    if (data?.type !== PARTY_TYPE || data?.ownership) return;
    document.updateSource({ ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER } });
  });

  const changed = (party: any, membersChanged: boolean) => {
    invalidatePartyIndex();
    refreshMembers(party);
    // The directory redraws itself only for a name, an image, ownership, a
    // sort or a folder; a member joining is none of those.
    if (membersChanged) void ui.actors?.render?.();
    Hooks.callAll(PARTY_CHANGED_HOOK, party, membersOf(party));
  };

  Hooks.on("createActor", (document: any) => {
    if (isParty(document)) changed(document, true);
  });
  Hooks.on("updateActor", (document: any, diff: any) => {
    if (!isParty(document)) return;
    const members = diff?.system?.members !== undefined;
    const campaign = diff?.system?.campaign !== undefined;
    if (members || campaign) changed(document, members);
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
