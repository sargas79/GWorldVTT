/** What `changeQuantity` did to a stack. */
export interface QuantityChanged {
  /** The quantity before and after. */
  from: number;
  to: number;
  reason: string;
}

/**
 * Adds to or takes from a stack of an item (since API 1.123.0): rounds put
 * in a box, supplies spent, something made or found. Weight and cost are
 * kept per unit, so the carried weight and the stack's worth follow the new
 * quantity with nothing else to change. The quantity never goes below 0;
 * taking more than there is empties the stack but leaves the item, since
 * whether an empty box is thrown away is the player's call, not the rule's.
 *
 * Null for an item that keeps no quantity, a user who doesn't own it, or a
 * change that isn't a number.
 */
export async function changeQuantity(item: any, delta: number, options: { reason?: string } = {}): Promise<QuantityChanged | null> {
  const change = Math.trunc(Number(delta));
  if (!item?.isOwner || typeof item.system?.quantity !== "number" || !Number.isFinite(change)) return null;
  const from = Math.max(0, Math.floor(item.system.quantity) || 0);
  const to = Math.max(0, from + change);
  if (to !== from) await item.update({ "system.quantity": to });
  return { from, to, reason: String(options?.reason ?? "") };
}
