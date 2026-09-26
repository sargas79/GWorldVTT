/**
 * Containers: a backpack, a pouch, a chest -- equipment that other gear is
 * kept inside.
 *
 * An item says which container it is in by the container's id on the same
 * actor (`system.containerId`); a container is equipment with
 * `system.container` set, and may give a capacity in pounds. A container's
 * contents follow it between carried and stored, so everything that reads
 * `system.carried` -- encumbrance, what is to hand -- needs to know nothing
 * about containers.
 *
 * Nothing here is a book's rule: a container has no statistics beyond its own
 * weight and cost. A reference to a container that is gone, or is no longer a
 * container, or would put an item inside itself, reads as loose.
 *
 * Kept apart from Foundry so it can be tested without it.
 */

/** As much of an item as containers need to know. */
export interface ContainedItem {
  id?: string | null;
  type?: string;
  system?: { container?: unknown; containerId?: unknown; capacity?: unknown } | null;
}

/** Whether an item is a container that can hold other gear. */
export function isContainer(item: ContainedItem | null | undefined): boolean {
  return item?.type === "equipment" && item.system?.container === true;
}

function indexOf(items: Iterable<ContainedItem>): Map<string, ContainedItem> {
  const byId = new Map<string, ContainedItem>();
  for (const item of items) if (item?.id) byId.set(String(item.id), item);
  return byId;
}

/**
 * The container an item is in, or null where it is loose: the container must
 * be on the same actor, be a container, and not be the item or inside it.
 */
export function containerIdOf(items: Iterable<ContainedItem>, id: string): string | null {
  const byId = indexOf(items);
  const first = String(byId.get(id)?.system?.containerId ?? "");
  if (!first || !isContainer(byId.get(first))) return null;
  // Walk up: a loop anywhere above means the chain is broken, and the item is loose.
  const seen = new Set<string>([id]);
  for (let at: string = first; at; at = String(byId.get(at)?.system?.containerId ?? "")) {
    if (seen.has(at)) return null;
    seen.add(at);
    if (!isContainer(byId.get(at))) break;
  }
  return first;
}

/** Everything inside a container, however deep, in no particular order. */
export function contentsOf(items: Iterable<ContainedItem>, containerId: string): string[] {
  const list = [...items];
  const found: string[] = [];
  const queue = [containerId];
  const seen = new Set<string>([containerId]);
  while (queue.length) {
    const parent = queue.shift()!;
    for (const item of list) {
      const id = String(item?.id ?? "");
      if (!id || seen.has(id)) continue;
      if (containerIdOf(list, id) !== parent) continue;
      seen.add(id);
      found.push(id);
      queue.push(id);
    }
  }
  return found;
}

/** Whether an item may go inside a container: not into itself, nor into anything it holds. */
export function canPutInside(items: Iterable<ContainedItem>, itemId: string, containerId: string): boolean {
  const list = [...items];
  const container = list.find((i) => String(i?.id ?? "") === containerId);
  if (!isContainer(container) || itemId === containerId) return false;
  const item = list.find((i) => String(i?.id ?? "") === itemId);
  if (!item || !["equipment", "armor", "shield"].includes(String(item.type))) return false;
  return !contentsOf(list, itemId).includes(containerId);
}

/** A list row a container's contents can be folded under. */
export interface NestableRow {
  id: string;
  weight: number;
  cost: number;
}

export type NestedRow<R extends NestableRow> = R & {
  contents: Array<NestedRow<R>>;
  /** What the contents weigh and cost, however deep, and how many rows they are. */
  inside: { weight: number; cost: number; count: number };
};

/**
 * Folds rows under the container each is in, where that container is one of
 * the same rows; the rest stay at the top, in the order given. A row's weight
 * and cost are its own (times its quantity); `inside` adds up its contents.
 */
export function nestRows<R extends NestableRow>(rows: readonly R[], parentOf: (id: string) => string | null): Array<NestedRow<R>> {
  const nested = new Map<string, NestedRow<R>>(
    rows.map((row) => [row.id, { ...row, contents: [], inside: { weight: 0, cost: 0, count: 0 } }]),
  );
  const top: Array<NestedRow<R>> = [];
  for (const row of rows) {
    const node = nested.get(row.id)!;
    const parent = parentOf(row.id);
    const holder = parent && parent !== row.id ? nested.get(parent) : undefined;
    if (holder) holder.contents.push(node);
    else top.push(node);
  }
  const total = (node: NestedRow<R>, seen: Set<string>): void => {
    for (const child of node.contents) {
      if (seen.has(child.id)) continue;
      seen.add(child.id);
      total(child, seen);
      node.inside.weight += (Number(child.weight) || 0) + child.inside.weight;
      node.inside.cost += (Number(child.cost) || 0) + child.inside.cost;
      node.inside.count += 1 + child.inside.count;
    }
    node.inside.weight = Math.round(node.inside.weight * 100) / 100;
  };
  for (const node of top) total(node, new Set([node.id]));
  return top;
}

/** How full a container is against its capacity, or null where it gives none. */
export function capacityOf(capacity: unknown, used: number): { used: number; capacity: number; over: boolean } | null {
  const limit = Number(capacity) || 0;
  if (limit <= 0) return null;
  const load = Math.round((Number(used) || 0) * 100) / 100;
  return { used: load, capacity: limit, over: load > limit };
}
