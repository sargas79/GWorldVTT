import { afterEach, describe, expect, it, vi } from "vitest";

import { applyDamageToActor, takeInjury } from "../damage.js";

const globals = globalThis as Record<string, unknown>;

afterEach(() => {
  delete globals.Hooks;
  delete globals.fromUuidSync;
  vi.restoreAllMocks();
});

/**
 * A character the damage code can write to: an update moves the pool, and the
 * status the sheet would work out follows the HP the way the data model has it.
 */
function character(hp = 10, maxHp = 10) {
  const statuses = new Set<string>();
  const actor = {
    name: "Target",
    isOwner: true,
    statuses,
    items: [] as unknown[],
    system: {
      hp: { value: hp, max: maxHp },
      fp: { value: 10, max: 10 },
      aim: { turns: 0 },
      derived: { status: "ok" },
    },
    update: vi.fn(async (changes: Record<string, number>) => {
      for (const [path, value] of Object.entries(changes)) {
        const [, pool] = path.split(".");
        if (pool === "hp" || pool === "fp") actor.system[pool].value = value;
      }
      const current = actor.system.hp.value;
      actor.system.derived.status = current < 1 ? "collapsing" : current < maxHp / 3 ? "reeling" : "ok";
    }),
    toggleStatusEffect: vi.fn(async (id: string, { active }: { active: boolean }) => {
      if (active) statuses.add(id);
      else statuses.delete(id);
    }),
  };
  return actor;
}

/** The item a damage card names, for sargas79/GWorldVTT#264. */
describe("damage hooks name the item", () => {
  it("gives the injury and afterDamage listeners the item the card was rolled from", async () => {
    const sword = { uuid: "Actor.a.Item.sword", name: "Broadsword" };
    globals.fromUuidSync = (uuid: string) => (uuid === sword.uuid ? sword : null);
    const seen: Array<[string, unknown]> = [];
    globals.Hooks = { callAll: (event: string, context: { item: unknown }) => { seen.push([event, context.item]); } };

    const target = character();
    const result = await applyDamageToActor(target, {
      basicDamage: 4, type: "cr", armorDivisor: 1, hitLocation: "torso", itemUuid: sword.uuid,
    } as never);

    expect(result?.injury).toBe(4);
    expect(seen).toEqual([["gworld.injury", sword], ["gworld.afterDamage", sword]]);
  });

  it("gives them the mode the card was rolled from (#270)", async () => {
    const rifle = { uuid: "Actor.a.Item.rifle" };
    globals.fromUuidSync = () => rifle;
    const seen: unknown[] = [];
    globals.Hooks = { callAll: (_event: string, context: { mode: unknown }) => { seen.push(context.mode); } };
    await applyDamageToActor(character(), { basicDamage: 3, type: "pi", armorDivisor: 1, hitLocation: "torso", itemUuid: rifle.uuid, mode: { index: 1, ranged: true } } as never);
    expect(seen).toEqual([{ index: 1, ranged: true }, { index: 1, ranged: true }]);
  });

  it("gives them null for a blow with no item", async () => {
    const seen: unknown[] = [];
    globals.Hooks = { callAll: (_event: string, context: { item: unknown }) => { seen.push(context.item); } };
    await applyDamageToActor(character(), { basicDamage: 2, type: "cr", armorDivisor: 1, hitLocation: "torso" } as never);
    expect(seen).toEqual([null, null]);
  });
});

describe("takeInjury", () => {
  it("takes 3 HP off, and makes a character below a third of their HP Reeling", async () => {
    const target = character(5, 12);
    const taken = await takeInjury(target, { amount: 3, label: "Burn" });
    expect(taken).toEqual({ pool: "hp", from: 5, to: 2, label: "Burn" });
    expect(target.system.hp.value).toBe(2);
    expect(target.statuses.has("reeling")).toBe(true);
  });

  it("takes fatigue from FP and leaves HP alone", async () => {
    const target = character();
    expect(await takeInjury(target, { amount: 2, fatigue: true })).toEqual({ pool: "fp", from: 10, to: 8, label: "" });
    expect(target.system.hp.value).toBe(10);
  });

  it("refuses an actor the user doesn't own, and an amount that isn't positive", async () => {
    const target = character();
    expect(await takeInjury({ ...target, isOwner: false }, { amount: 3 })).toBeNull();
    expect(await takeInjury(target, { amount: 0 })).toBeNull();
    expect(await takeInjury(target, { amount: Number.NaN })).toBeNull();
    expect(target.update).not.toHaveBeenCalled();
  });
});
