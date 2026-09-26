/**
 * Moving gear in and out of containers, and keeping a container's contents
 * with it: carried or stored as it is, taken out when it is deleted, and
 * copied along when it is given to another actor. The rules of what may go
 * where are in containers.ts.
 */

import { canPutInside, containerIdOf, contentsOf, isContainer } from "./containers.js";

/** Puts an item inside a container on the same actor, or takes it out with null. */
export async function putInside(item: any, container: any | null): Promise<void> {
  const actor = item?.parent;
  if (!actor || actor.documentName !== "Actor") return;
  if (!container) {
    if (item.system?.containerId) await item.update({ "system.containerId": "" });
    return;
  }
  if (container.parent !== actor || !canPutInside(actor.items, String(item.id), String(container.id))) return;
  // It goes where the container is: into storage with a stored chest, and out of hand.
  const carried = container.system?.carried !== false;
  await item.update({
    "system.containerId": String(container.id),
    "system.carried": carried,
    ...(carried ? {} : { "system.equipped": false }),
  });
}

/**
 * After a container is carried or stowed, its contents go with it. Run by
 * the client that made the change, so it happens once.
 */
export async function carryContentsWith(container: any): Promise<void> {
  const actor = container?.parent;
  if (!actor || actor.documentName !== "Actor" || !isContainer(container)) return;
  const carried = container.system?.carried !== false;
  const updates = contentsOf(actor.items, String(container.id))
    .map((id) => actor.items.get(id))
    .filter((item: any) => item && (item.system?.carried !== false) !== carried)
    .map((item: any) => ({ _id: item.id, "system.carried": carried, ...(carried ? {} : { "system.equipped": false }) }));
  if (updates.length) await actor.updateEmbeddedDocuments("Item", updates);
}

/** After a container is deleted, what was in it is loose rather than pointing at nothing. */
export async function takeOutContentsOf(containerId: string, actor: any): Promise<void> {
  if (!actor || actor.documentName !== "Actor") return;
  const updates = [...actor.items]
    .filter((item: any) => item.system?.containerId === containerId)
    .map((item: any) => ({ _id: item.id, "system.containerId": "" }));
  if (updates.length) await actor.updateEmbeddedDocuments("Item", updates);
}

/**
 * A container given to another actor takes its contents with it: copies of
 * everything inside, however deep, still inside the copy. `created` is the
 * container as made on the new actor, `source` the one it was copied from.
 */
export async function copyContentsWith(source: any, created: any): Promise<void> {
  const from = source?.parent;
  const to = created?.parent;
  if (!from || !to || from === to || !isContainer(source)) return;
  const inside = contentsOf(from.items, String(source.id)).map((id) => from.items.get(id)).filter(Boolean);
  if (!inside.length) return;
  // New ids where the old ones are taken on the new actor; the map keeps each inside its own container.
  const ids = new Map<string, string>([[String(source.id), String(created.id)]]);
  for (const item of inside) {
    const id = String(item.id);
    ids.set(id, to.items.has(id) ? foundry.utils.randomID() : id);
  }
  const data = inside.map((item: any) => {
    const copy = item.toObject();
    copy._id = ids.get(String(item.id));
    copy.system = { ...copy.system, containerId: ids.get(String(item.system?.containerId ?? "")) ?? "" };
    return copy;
  });
  await to.createEmbeddedDocuments("Item", data, { keepId: true });
}

/**
 * Containers for add-on modules (since API 1.159.0): which items are
 * containers, what is in one, which one an item is kept in, and putting an
 * item in or taking it out.
 */
export const containersApi = Object.freeze({
  /** Whether an item is a container. */
  isContainer: (item: unknown): boolean => isContainer(item as any),
  /** The container an item is kept in, or null where it is loose. */
  containerOf: (item: any): any | null => {
    const actor = item?.parent;
    if (!actor || actor.documentName !== "Actor") return null;
    const id = containerIdOf(actor.items, String(item.id));
    return id ? actor.items.get(id) ?? null : null;
  },
  /** Everything inside a container, however deep. */
  contentsOf: (container: any): any[] => {
    const actor = container?.parent;
    if (!actor || actor.documentName !== "Actor") return [];
    return contentsOf(actor.items, String(container.id)).map((id) => actor.items.get(id)).filter(Boolean);
  },
  /** Puts an item inside a container on the same actor, or takes it out with null; it goes where the container is. */
  putInside,
});
