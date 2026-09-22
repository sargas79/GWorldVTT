/**
 * The party in the Actors sidebar: its members nested under it, as a folder's
 * contents are under the folder.
 *
 * Only the rendered list is changed; the actors' own folders are left alone.
 * Each render of the directory starts from a fresh list, so the nesting is
 * done again each time. Dropping an actor on the party's row puts it in the
 * party; a GM dragging a member out of it, to a folder or anywhere else in
 * the list, takes it out. The members are listed by name.
 */

import { addMembers, removeMember, resolveMember, worldParties } from "../party.js";
import { membersByName } from "./roster.js";

/** The parties folded shut, by id. Expanded until somebody folds one. */
const folded = new Set<string>();

/** The member being dragged out of the party's row, if one is. */
let dragged: { party: any; uuid: string } | null = null;

/** How long Foundry's search box waits before filtering (its SearchFilter's default delay), plus a little. */
const SEARCH_SETTLE_MS = 300;

/** A world actor's directory row, if the user can see it. */
function rowOf(html: HTMLElement, uuid: string): HTMLElement | null {
  const id = uuid.startsWith("Actor.") ? uuid.slice("Actor.".length) : "";
  return id ? html.querySelector<HTMLElement>(`li.directory-item.entry[data-entry-id="${id}"]`) : null;
}

function wireDrop(row: HTMLElement, party: any): void {
  row.addEventListener("dragover", (event) => {
    event.preventDefault();
    row.classList.add("gworld-party-over");
  });
  row.addEventListener("dragleave", (event) => {
    if (!row.contains(event.relatedTarget as Node | null)) row.classList.remove("gworld-party-over");
  });
  row.addEventListener("drop", (event) => {
    row.classList.remove("gworld-party-over");
    let data: Record<string, unknown>;
    try {
      data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
    } catch {
      return;
    }
    if (data?.type !== "Actor" || typeof data.uuid !== "string") return;
    // Foundry's own handler would sort the dropped actor; this drop is a join.
    event.preventDefault();
    event.stopPropagation();
    const actor = resolveMember(data.uuid);
    if (actor) void addMembers(party, [actor]);
  });
}

/** Nests each party's members under its row, with a fold toggle and a drop target. */
export function nestParties(html: HTMLElement): void {
  const parties = worldParties();
  if (parties.length === 0) return;

  for (const party of parties) {
    const row = rowOf(html, String(party.uuid));
    if (!row) continue;
    row.classList.add("gworld-party");
    row.classList.toggle("gworld-party-folded", folded.has(String(party.id)));

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "gworld-party-toggle";
    toggle.setAttribute("aria-label", game.i18n.localize("GWORLD.Party.Fold"));
    toggle.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const id = String(party.id);
      if (folded.has(id)) folded.delete(id);
      else folded.add(id);
      row.classList.toggle("gworld-party-folded", folded.has(id));
    });
    row.prepend(toggle);

    const list = document.createElement("ol");
    list.className = "subdirectory plain gworld-party-members";
    const members = ((party.system?.members ?? []) as Array<{ uuid: string }>).map((m) => {
      const uuid = String(m?.uuid ?? "");
      return { uuid, actor: resolveMember(uuid) };
    });
    for (const member of membersByName(members)) {
      const memberRow = rowOf(html, member.uuid);
      if (!memberRow || memberRow === row) continue;
      memberRow.addEventListener("dragstart", () => {
        dragged = { party, uuid: member.uuid };
      });
      memberRow.addEventListener("dragend", () => {
        dragged = null;
      });
      list.append(memberRow);
    }
    row.append(list);

    if (party.isOwner) wireDrop(row, party);
  }

  wireDragOut(html);

  // Foundry's search hides a row whose name does not match. A member that
  // matches stays visible, so its party's row must too, or the member is
  // hidden inside a hidden row.
  // The search box belongs to the directory's header, which is not redrawn
  // with the list, so the listener is added once rather than on every render.
  const search = html.querySelector<HTMLInputElement>("search input");
  if (!search || search.dataset.gworldParty) return;
  search.dataset.gworldParty = "wired";
  search.addEventListener("input", () => {
    setTimeout(() => {
      for (const row of html.querySelectorAll<HTMLElement>("li.gworld-party")) {
        const shown = [...row.querySelectorAll<HTMLElement>(".gworld-party-members > li")].some(
          (li) => li.style.display !== "none",
        );
        if (shown) row.style.display = "flex";
      }
    }, SEARCH_SETTLE_MS);
  });
}

/**
 * A member dropped anywhere in the list but a party's row leaves its party,
 * and Foundry then files it in the folder it was dropped on, if any. Only a GM
 * can take a member out: anyone else's drop is refused, and the member stays.
 * The directory's element outlives its renders, so this is wired once.
 */
function wireDragOut(html: HTMLElement): void {
  if (html.dataset.gworldPartyDragOut) return;
  html.dataset.gworldPartyDragOut = "wired";
  html.addEventListener("drop", (event) => {
    const leaving = dragged;
    dragged = null;
    if (!leaving) return;
    // On a party's row: its own drop handler joins that party, which takes
    // the member out of this one; on its own row, nothing changes.
    if ((event.target as HTMLElement | null)?.closest?.("li.gworld-party")) return;
    if (!game.user?.isGM) {
      event.preventDefault();
      event.stopImmediatePropagation();
      ui.notifications?.warn(game.i18n.localize("GWORLD.Party.OnlyGMTakesOut"));
      return;
    }
    void removeMember(leaving.party, leaving.uuid);
  }, { capture: true });
}

export function registerPartySidebar(): void {
  Hooks.on("renderActorDirectory", (_app: unknown, html: HTMLElement) => nestParties(html));
}
