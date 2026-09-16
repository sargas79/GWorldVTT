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
    // armorDr fires between them, from inside the pipeline, and names the
    // item too, so a listener can read a piece against this weapon.
    expect(seen).toEqual([
      ["gworld.injury", sword],
      ["gworld.armorDr", sword],
      ["gworld.afterDamage", sword],
    ]);
  });

  it("gives them the mode the card was rolled from (#270)", async () => {
    const rifle = { uuid: "Actor.a.Item.rifle" };
    globals.fromUuidSync = () => rifle;
    const seen: unknown[] = [];
    globals.Hooks = { callAll: (_event: string, context: { mode: unknown }) => { seen.push(context.mode); } };
    await applyDamageToActor(character(), { basicDamage: 3, type: "pi", armorDivisor: 1, hitLocation: "torso", itemUuid: rifle.uuid, mode: { index: 1, ranged: true } } as never);
    expect(seen).toEqual([
      { index: 1, ranged: true }, { index: 1, ranged: true }, { index: 1, ranged: true },
    ]);
  });

  it("gives them null for a blow with no item", async () => {
    const seen: unknown[] = [];
    globals.Hooks = { callAll: (_event: string, context: { item: unknown }) => { seen.push(context.item); } };
    await applyDamageToActor(character(), { basicDamage: 2, type: "cr", armorDivisor: 1, hitLocation: "torso" } as never);
    expect(seen).toEqual([null, null, null]);
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

/** Armour as a piece, before any of it is added up (since 1.48.0). */
describe("gworld.armorDr", () => {
  /** A character in one piece of armour the damage code can read and write. */
  function armoured(options: { dr: number; ablative?: string; drLost?: number; forceField?: boolean } ) {
    const actor = character(20, 20) as any;
    const piece = {
      id: "armor1",
      type: "armor",
      name: "Plate",
      system: {
        dr: options.dr, drSplit: null, drSplitAppliesTo: [], locations: ["torso"],
        flexible: false, frontOnly: false, concealable: false, equipped: true,
        hardened: 0, ablative: options.ablative ?? "none", drLost: options.drLost ?? 0,
        forceField: options.forceField ?? false,
      },
    };
    actor.items = [piece];
    actor.updateEmbeddedDocuments = vi.fn(async (_type: string, changes: Array<Record<string, unknown>>) => {
      for (const change of changes) {
        if (change._id === piece.id) piece.system.drLost = Number(change["system.drLost"]);
      }
    });
    return { actor, piece };
  }

  it("names each piece and what it is worth against this blow", async () => {
    const { actor } = armoured({ dr: 6 });
    let seen: unknown = null;
    globals.Hooks = {
      callAll: (event: string, context: { lines?: unknown }) => {
        if (event === "gworld.armorDr") seen = context.lines;
      },
    };
    await applyDamageToActor(actor, { basicDamage: 10, type: "cr", armorDivisor: 1, hitLocation: "torso" } as never);
    expect(seen).toEqual([
      { label: "Plate", dr: 6, applies: true, forceField: false, flexible: false, hardened: 0 },
    ]);
  });

  it("lets a listener refuse a piece against one kind of attack", async () => {
    const { actor } = armoured({ dr: 6 });
    globals.Hooks = {
      callAll: (event: string, context: { damageType?: string; lines?: Array<{ applies: boolean }> }) => {
        if (event === "gworld.armorDr" && context.damageType === "cr") context.lines![0]!.applies = false;
      },
    };
    const result = await applyDamageToActor(actor, { basicDamage: 10, type: "cr", armorDivisor: 1, hitLocation: "torso" } as never);
    expect(result?.effectiveDr).toBe(0);
    expect(result?.penetrating).toBe(10);
  });

  it("lets a listener double a piece, or harden it", async () => {
    const { actor } = armoured({ dr: 6 });
    globals.Hooks = {
      callAll: (event: string, context: { lines?: Array<{ dr: number; hardened: number }> }) => {
        if (event !== "gworld.armorDr") return;
        context.lines![0]!.dr *= 2;
        context.lines![0]!.hardened = 1;
      },
    };
    // DR 12 against a (5) divisor is 2; hardened once the divisor is a (3), so 4.
    const result = await applyDamageToActor(actor, { basicDamage: 10, type: "cr", armorDivisor: 5, hitLocation: "torso" } as never);
    expect(result?.effectiveDr).toBe(4);
  });
});

describe("ablative DR spent by a blow (Characters p. 47)", () => {
  /** The same character, with the piece exposed so its pool can be read after. */
  function armoured(options: { dr: number; ablative: string }) {
    const actor = character(20, 20) as any;
    const piece = {
      id: "armor1", type: "armor", name: "Reactive Plate",
      system: {
        dr: options.dr, drSplit: null, drSplitAppliesTo: [], locations: ["torso"],
        flexible: false, frontOnly: false, concealable: false, equipped: true,
        hardened: 0, ablative: options.ablative, drLost: 0, forceField: false,
      },
    };
    actor.items = [piece];
    actor.updateEmbeddedDocuments = vi.fn(async (_type: string, changes: Array<Record<string, unknown>>) => {
      for (const change of changes) {
        if (change._id === piece.id) piece.system.drLost = Number(change["system.drLost"]);
      }
    });
    return { actor, piece };
  }

  it("destroys a point of ablative DR for every point it stopped", async () => {
    const { actor, piece } = armoured({ dr: 10, ablative: "ablative" });
    await applyDamageToActor(actor, { basicDamage: 4, type: "cr", armorDivisor: 1, hitLocation: "torso" } as never);
    expect(piece.system.drLost).toBe(4);
  });

  it("spends it even where the blow did no injury at all", async () => {
    // "Your DR stops damage once", whether or not anything got through.
    const { actor, piece } = armoured({ dr: 10, ablative: "ablative" });
    const result = await applyDamageToActor(actor, { basicDamage: 3, type: "cr", armorDivisor: 1, hitLocation: "torso" } as never);
    expect(result?.injury).toBe(0);
    expect(piece.system.drLost).toBe(3);
  });

  it("spends semi-ablative DR a point per 10 points rolled", async () => {
    const { actor, piece } = armoured({ dr: 10, ablative: "semiAblative" });
    await applyDamageToActor(actor, { basicDamage: 25, type: "cr", armorDivisor: 1, hitLocation: "torso" } as never);
    expect(piece.system.drLost).toBe(2);
  });

  it("spends nothing on ordinary armour", async () => {
    const { actor, piece } = armoured({ dr: 10, ablative: "none" });
    await applyDamageToActor(actor, { basicDamage: 25, type: "cr", armorDivisor: 1, hitLocation: "torso" } as never);
    expect(piece.system.drLost).toBe(0);
    expect(actor.updateEmbeddedDocuments).not.toHaveBeenCalled();
  });

  it("spends nothing on a piece covering somewhere the blow did not land", async () => {
    const { actor, piece } = armoured({ dr: 10, ablative: "ablative" });
    await applyDamageToActor(actor, { basicDamage: 8, type: "cr", armorDivisor: 1, hitLocation: "leg" } as never);
    expect(piece.system.drLost).toBe(0);
  });
});

