import { afterEach, describe, expect, it } from "vitest";

import { adjustWeaponAttacks, COMBAT_HOOKS } from "../combat-extensions.js";
import { createApi } from "../api.js";
import { familiarWith, setFamiliar } from "../tech-level.js";

/** Gear hooks: the punch and kick, and familiarity from the API (sargas79/GWorldVTT#693). */

const globals = globalThis as Record<string, unknown>;

afterEach(() => {
  delete globals.Hooks;
});

describe("gworld.unarmedAttacks", () => {
  /** A punch and a kick as the character's preparation hands them over. */
  const unarmed = () => [
    { kind: "melee" as const, mode: { naturalKey: "punch", unarmed: true }, row: { naturalKey: "punch", damage: "1d-2", damageType: "cr", skillLevel: 12, reach: "C", parry: 9 }, basis: { st: 10, damage: "1d-2" } },
    { kind: "melee" as const, mode: { naturalKey: "kick", unarmed: true }, row: { naturalKey: "kick", damage: "1d-1", damageType: "cr", skillLevel: 10, reach: "C, 1", parry: null }, basis: { st: 10, damage: "1d-1" } },
  ];
  const helpers = {
    damageAt: () => "1d",
    rangeAt: () => ({ halfDamageRange: 0, maxRange: 0 }),
    addToDamage: (formula: string, bonus: number) => (bonus ? `${formula}+${bonus}` : formula),
    isRollable: () => true,
  };

  it("lets a listener change the punch and kick under their own hook, with no item", () => {
    const seen: string[] = [];
    globals.Hooks = {
      callAll: (event: string, context: any) => {
        seen.push(event);
        if (event !== COMBAT_HOOKS.unarmedAttacks || context.item !== null) return;
        // Boots: +1 to the kick (Characters p. 271).
        const kick = context.rows.find((entry: any) => entry.mode.naturalKey === "kick");
        kick.row.damage = context.addToDamage(kick.row.damage, 1);
      },
    };
    const rows = unarmed();
    adjustWeaponAttacks({ actor: {}, item: null, rows: rows as never, hook: COMBAT_HOOKS.unarmedAttacks, ...helpers });
    expect(seen).toEqual(["gworld.unarmedAttacks"]);
    expect(rows[1]!.row).toMatchObject({ damage: "1d-1+1", damageRollable: true });
    expect(rows[0]!.row).toMatchObject({ damage: "1d-2", parry: 9, notes: [] });
  });

  it("puts the rows back where a listener fails", () => {
    globals.Hooks = { callAll: (_event: string, context: any) => { context.rows[0].row.damage = "9d"; throw new Error("boom"); } };
    const rows = unarmed();
    const warn = console.warn;
    console.warn = () => {};
    try {
      adjustWeaponAttacks({ actor: {}, item: null, rows: rows as never, hook: COMBAT_HOOKS.unarmedAttacks, ...helpers });
    } finally {
      console.warn = warn;
    }
    expect(rows[0]!.row.damage).toBe("1d-2");
  });
});

describe("actors.setFamiliar and actors.isFamiliar", () => {
  const character = (familiarities: string[] | undefined, isOwner = true) => {
    const actor: any = {
      isOwner,
      system: familiarities === undefined ? {} : { familiarities },
      update: async (changes: Record<string, unknown>) => {
        actor.system.familiarities = changes["system.familiarities"];
      },
    };
    return actor;
  };

  it("adds and takes out a name, compared as the sheet compares it", async () => {
    const actor = character(["Colt M1911"]);
    expect(familiarWith(actor, "Jeep")).toBe(false);
    expect(await setFamiliar(actor, "Jeep", true)).toBe(true);
    expect(actor.system.familiarities).toEqual(["Colt M1911", "Jeep"]);
    // Already familiar: nothing written twice.
    expect(await setFamiliar(actor, "jeep", true)).toBe(true);
    expect(actor.system.familiarities).toHaveLength(2);
    expect(await setFamiliar(actor, "Colt M1911", false)).toBe(false);
    expect(actor.system.familiarities).toEqual(["Jeep"]);
  });

  it("is null for an actor that keeps none, a user who can't change it, or no name", async () => {
    expect(familiarWith(character(undefined), "Jeep")).toBeNull();
    expect(await setFamiliar(character(undefined), "Jeep", true)).toBeNull();
    expect(await setFamiliar(character([], false), "Jeep", true)).toBeNull();
    expect(await setFamiliar(character([]), "  ", true)).toBeNull();
  });

  it("is on the API under actors", async () => {
    const api = createApi();
    const actor = character([]);
    expect(await api.actors.setFamiliar(actor, "Jeep")).toBe(true);
    expect(api.actors.isFamiliar(actor, "Jeep")).toBe(true);
  });
});
