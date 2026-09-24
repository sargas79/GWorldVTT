import { describe, expect, it, vi } from "vitest";

import { createApi } from "../api.js";

/** A stack of something a character carries, with an update that writes back. */
function stack(quantity: unknown, extra: Record<string, unknown> = {}) {
  const item = {
    type: "equipment",
    isOwner: true,
    system: { quantity, weight: 0.5, cost: 2 } as Record<string, unknown>,
    update: vi.fn(async (change: Record<string, unknown>) => { item.system.quantity = change["system.quantity"]; }),
    ...extra,
  };
  return item;
}

/** Changing an item's quantity through the API (sargas79/GWorldVTT#741). */
describe("items.changeQuantity (since 1.123.0)", () => {
  it("adds to and takes from a stack, and says what it went from and to", async () => {
    const api = createApi();
    const box = stack(30);
    expect(await api.items.changeQuantity(box, 20, { reason: "Bought" })).toEqual({ from: 30, to: 50, reason: "Bought" });
    expect(await api.items.changeQuantity(box, -12)).toEqual({ from: 50, to: 38, reason: "" });
    expect(box.system.quantity).toBe(38);
    // Weight and cost stay per unit: only the quantity is written.
    expect(box.update).toHaveBeenLastCalledWith({ "system.quantity": 38 });
    expect(box.system.weight).toBe(0.5);
    expect(box.system.cost).toBe(2);
  });

  it("never takes a stack below 0, and keeps the emptied item", async () => {
    const api = createApi();
    const rations = stack(3);
    expect(await api.items.changeQuantity(rations, -10)).toEqual({ from: 3, to: 0, reason: "" });
    expect(rations.system.quantity).toBe(0);
    expect(await api.items.changeQuantity(rations, -1)).toEqual({ from: 0, to: 0, reason: "" });
    expect(rations.update).toHaveBeenCalledTimes(1);
  });

  it("writes nothing for no change, and drops a fraction toward none", async () => {
    const api = createApi();
    const torches = stack(4);
    expect(await api.items.changeQuantity(torches, 0)).toEqual({ from: 4, to: 4, reason: "" });
    expect(await api.items.changeQuantity(torches, 0.9)).toEqual({ from: 4, to: 4, reason: "" });
    expect(torches.update).not.toHaveBeenCalled();
    expect((await api.items.changeQuantity(torches, -1.9))?.to).toBe(3);
  });

  it("refuses an item with no quantity, a user who doesn't own it, or a change that isn't a number", async () => {
    const api = createApi();
    expect(await api.items.changeQuantity({ type: "skill", isOwner: true, system: {}, update: vi.fn() }, 1)).toBeNull();
    expect(await api.items.changeQuantity(stack(5, { isOwner: false }), 1)).toBeNull();
    expect(await api.items.changeQuantity(stack(5), Number.NaN)).toBeNull();
    expect(await api.items.changeQuantity(stack(5), "lots" as unknown as number)).toBeNull();
    expect(await api.items.changeQuantity(null, 1)).toBeNull();
  });
});
