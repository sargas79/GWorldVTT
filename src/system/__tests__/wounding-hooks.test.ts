import { afterEach, describe, expect, it, vi } from "vitest";

import { resolveDamageAgainst, type IncomingDamage } from "../damage.js";

// An injury cap a module sets on a blow, and the row fields for overpenetration
// and a first hit's own line (sargas79/GWorldVTT#596).

/** A 10 HP man with nothing on. */
const man = () => ({
  name: "Man",
  system: { hp: { value: 10, max: 10 }, fp: { value: 10, max: 10 }, attributes: { ST: 10 } },
  items: [],
});

const blow = (options: Partial<IncomingDamage> = {}) =>
  ({ basicDamage: 6, type: "cut", armorDivisor: 1, hitLocation: "torso", ...options }) as IncomingDamage;

describe("an injury cap on a blow", () => {
  it("costs no more than the cap, and keeps the uncapped figure", () => {
    // 6 cutting is 9 injury to the torso; capped at 4.
    const result = resolveDamageAgainst(man(), blow({ injuryCap: 4, injuryCapReason: "test" }));
    expect(result.injury).toBe(4);
    expect(result.current).toBe(6);
    expect(result.uncappedInjury).toBe(9);
    expect(result.injuryCap).toEqual({ cap: 4, lost: 5, reason: "test" });
    // Shock and a major wound follow from what was taken.
    expect(result.consequences.shock).toBe(-4);
    expect(result.consequences.majorWound).toBe(false);
    // Whether it bleeds is read off the wound.
    expect(result.bleeds).toBe(true);
  });

  it("says nothing where the cap took nothing off", () => {
    const result = resolveDamageAgainst(man(), blow({ injuryCap: 20 }));
    expect(result.injury).toBe(9);
    expect(result.uncappedInjury).toBe(9);
    expect(result.injuryCap).toBeNull();
  });

  it("holds beside the Basic Set's own limb cap, the lower winning", () => {
    // 6 cutting to the arm is 9; the arm is crippled past 5, and the rest is
    // lost (p. 421).
    const limb = resolveDamageAgainst(man(), blow({ hitLocation: "arm" }));
    expect(limb.crippled).toBe(true);
    expect(limb.injury + limb.excessLost).toBe(9);
    expect(limb.uncappedInjury).toBe(9);
    expect(limb.injuryCap).toBeNull();

    const capped = resolveDamageAgainst(man(), blow({ hitLocation: "arm", injuryCap: 3 }));
    expect(capped.injury).toBe(3);
    expect(capped.crippled).toBe(true);
    expect(capped.uncappedInjury).toBe(9);
    expect(capped.injuryCap).toEqual({ cap: 3, lost: limb.injury - 3, reason: "" });

    const looser = resolveDamageAgainst(man(), blow({ hitLocation: "arm", injuryCap: 8 }));
    expect(looser.injury).toBe(limb.injury);
    expect(looser.injuryCap).toBeNull();
  });

  it("leaves a blow alone without one", () => {
    const result = resolveDamageAgainst(man(), blow({ injuryCap: null }));
    expect(result.injury).toBe(9);
    expect(result.injuryCap).toBeNull();
  });
});

describe("a ranged row's overpenetration and first hit", () => {
  const globals = globalThis as Record<string, unknown>;
  afterEach(() => {
    delete globals.Hooks;
    vi.restoreAllMocks();
  });

  const basis = { st: 10, damage: "1d+1", damageType: "pi", armorDivisor: 1, halfDamageRange: 50, maxRange: 125, accuracy: 3, malfunction: null };
  const entries = () => [
    { kind: "ranged" as const, mode: {}, row: { skillLevel: 12, damage: "1d+1", damageType: "pi", projectiles: 9, halfDamageRange: 50, maxRange: 125, damageRollable: true }, basis },
    { kind: "ranged" as const, mode: {}, row: { skillLevel: 12, damage: "2d", damageType: "pi", damageRollable: true }, basis },
  ];
  const helpers = {
    damageAt: () => "1d+1",
    rangeAt: () => ({ halfDamageRange: 50, maxRange: 125 }),
    addToDamage: (formula: string) => formula,
    isRollable: () => true,
  };

  it("start false and null, and keep what a listener sets in shape", async () => {
    vi.resetModules();
    const api = await import("../combat-extensions.js");
    const rows = entries();
    globals.Hooks = {
      callAll: (_event: string, context: any) => {
        Object.assign(context.rows[0].row, {
          noOverpenetration: 1,
          firstHit: { damage: " 2d+2 ", damageType: "pi+", armorDivisor: "2", label: "ball" },
        });
        Object.assign(context.rows[1].row, { firstHit: { damage: "lots" } });
      },
    };
    api.adjustWeaponAttacks({ actor: {}, item: {}, rows: rows as never, ...helpers } as never);
    expect(rows[0]!.row).toMatchObject({
      noOverpenetration: false,
      firstHit: { damage: "2d+2", damageType: "pi+", armorDivisor: 2, label: "ball" },
    });
    // Dice that don't parse are no line at all.
    expect(rows[1]!.row).toMatchObject({ noOverpenetration: false, firstHit: null });
  });

  it("refuse overpenetration only when set true", async () => {
    vi.resetModules();
    const api = await import("../combat-extensions.js");
    const rows = entries();
    globals.Hooks = {
      callAll: (_event: string, context: any) => {
        context.rows[0].row.noOverpenetration = true;
        context.rows[0].row.firstHit = { damage: "2d" };
      },
    };
    api.adjustWeaponAttacks({ actor: {}, item: {}, rows: rows as never, ...helpers } as never);
    expect(rows[0]!.row).toMatchObject({ noOverpenetration: true, firstHit: { damage: "2d", damageType: "", armorDivisor: 0, label: "" } });
  });
});
