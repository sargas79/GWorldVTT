import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { dualWeaponChoice, dualWeaponLine, rangedDialogLines, weaponStrikeHits } from "../roll.js";
import {
  consumeWeaponStrike,
  mayShootAtWeapons,
  rangedWeaponTargets,
  recordWeaponStrike,
  weaponStrikeLine,
  weaponTargetsFor,
  type WeaponTarget,
} from "../weapon-damage.js";

/**
 * A Dual-Weapon Attack with two pistols (Campaigns p. 417) and a shot at a
 * foe's weapon (Campaigns p. 400): sargas79/GWorldVTT#820 and #821.
 */

const globals = globalThis as Record<string, unknown>;

function world(rules: Record<string, boolean> = {}) {
  globals.game = {
    i18n: { localize: (key: string) => key, format: (key: string) => key },
    settings: { get: (_system: string, key: string) => (key === "optionalRules" ? rules : {}) },
    user: { targets: new Set() },
  };
}

beforeEach(() => world());

afterEach(() => {
  delete globals.game;
  delete globals.Hooks;
});

describe("dualWeaponLine", () => {
  it("is -4 for the primary hand and -8 for the off hand", () => {
    const primary = dualWeaponLine(dualWeaponChoice("primary", false), {});
    expect(primary.modifier).toMatchObject({ value: -4, key: "dualWeapon", hand: "primary" });
    expect(primary.defensePenalty).toBe(0);
    expect(dualWeaponLine(dualWeaponChoice("off", false), {}).modifier).toMatchObject({ value: -8, hand: "off" });
  });

  it("lets the technique and Ambidexterity buy the penalties back", () => {
    expect(dualWeaponLine(dualWeaponChoice("off", false), { ambidextrous: true }).modifier?.value).toBe(-4);
    expect(dualWeaponLine(dualWeaponChoice("off", false), { dualWeaponTechnique: 2, offHandTraining: 1 }).modifier?.value).toBe(-5);
    expect(dualWeaponLine(dualWeaponChoice("primary", false), { dualWeaponTechnique: 4 }).modifier?.value).toBe(0);
  });

  it("puts -1 on the defense of a foe both attacks come at", () => {
    expect(dualWeaponLine(dualWeaponChoice("primary", true), {}).defensePenalty).toBe(-1);
  });

  it("adds nothing for one weapon", () => {
    expect(dualWeaponChoice("no", true)).toBeNull();
    expect(dualWeaponLine(null, {})).toEqual({ modifier: null, defensePenalty: 0 });
  });
});

const pistol: WeaponTarget = {
  id: "pistol", name: "Pistol", penalty: -5, canDisarm: true, noParry: false, noDefenseBonus: false, disarmPenaltyForAll: false,
};
const rifle: WeaponTarget = { ...pistol, id: "rifle", name: "Rifle", penalty: -3 };

describe("rangedDialogLines", () => {
  const shooter = { damageType: "pi" as const, weaponTargets: [pistol, rifle] };

  it("puts the dual-weapon line on a shot, as on a blow", () => {
    const lines = rangedDialogLines({ dual: dualWeaponChoice("off", true) }, { ...shooter, dualWeaponTechnique: 1 });
    expect(lines.modifiers).toEqual([expect.objectContaining({ key: "dualWeapon", hand: "off", value: -7 })]);
    expect(lines.defensePenalty).toBe(-1);
    expect(lines.weaponStrike).toBeNull();
  });

  it("aims at the chosen weapon at its penalty, in place of a hit location", () => {
    const lines = rangedDialogLines({ calledShot: "skull", weaponStrike: "rifle" }, shooter);
    expect(lines.weaponStrike).toBe(rifle);
    expect(lines.aimed.shot).toBeNull();
    expect(lines.modifiers).toEqual([
      { label: "GWORLD.Breakage.StrikePenalty", value: -3, key: "strikeAtWeapon", itemId: "rifle" },
    ]);
  });

  it("keeps the called shot where no weapon is chosen", () => {
    const lines = rangedDialogLines({ calledShot: "skull", weaponStrike: "" }, shooter);
    expect(lines.weaponStrike).toBeNull();
    expect(lines.aimed.shot?.hitLocation).toBe("skull");
    expect(lines.modifiers.map((m) => m.value)).toEqual([-7]);
  });

  it("ignores a weapon the foe isn't offering", () => {
    expect(rangedDialogLines({ weaponStrike: "sword" }, shooter).weaponStrike).toBeNull();
  });
});

describe("rangedWeaponTargets", () => {
  const items = new Map([["pistol", { id: "pistol", name: "Pistol" }], ["rifle", { id: "rifle", name: "Rifle" }]]);
  const foe = {
    items: { get: (id: string) => items.get(id) },
    system: { derived: { melee: [], ranged: [{ itemId: "pistol", name: "Pistol", bulk: -2 }, { itemId: "rifle", name: "Rifle", bulk: -5 }] } },
  };

  it("offers the foe's weapons at the penalty for their size", () => {
    globals.Hooks = { callAll: () => {} };
    const targets = rangedWeaponTargets({}, foe);
    expect(targets.map((t) => [t.id, t.penalty])).toEqual([["pistol", -5], ["rifle", -3]]);
    expect(weaponStrikeLine(targets[0]!)).toMatchObject({ key: "strikeAtWeapon", itemId: "pistol", value: -5 });
  });

  it("tells gworld.weaponTargets the strike is ranged", () => {
    const seen: unknown[] = [];
    globals.Hooks = { callAll: (_event: string, context: any) => seen.push(context.ranged) };
    rangedWeaponTargets({}, foe);
    weaponTargetsFor({}, foe);
    expect(seen).toEqual([true, false]);
  });

  it("offers nothing for an explosive or fragmenting shot, whose blast would be lost", () => {
    globals.Hooks = { callAll: () => {} };
    expect(rangedWeaponTargets({}, foe, { explosive: true })).toEqual([]);
    expect(rangedWeaponTargets({}, foe, { explosive: false, fragmentation: "2d" })).toEqual([]);
    expect(rangedWeaponTargets({}, foe, { explosive: false, fragmentation: "" })).toHaveLength(2);
    expect(mayShootAtWeapons(null)).toBe(true);
  });

  it("offers nothing with Weapon Breakage off, or no foe", () => {
    globals.Hooks = { callAll: () => {} };
    expect(rangedWeaponTargets({}, null)).toEqual([]);
    world({ weaponBreakage: false });
    expect(rangedWeaponTargets({}, foe)).toEqual([]);
  });
});

describe("recordWeaponStrike / consumeWeaponStrike", () => {
  function shooter() {
    const flags = new Map<string, unknown>();
    return {
      isOwner: true,
      getFlag: (_scope: string, key: string) => flags.get(key),
      setFlag: async (_scope: string, key: string, value: unknown) => void flags.set(key, value),
      unsetFlag: async (_scope: string, key: string) => void flags.delete(key),
    };
  }
  const rifle = { actorUuid: "Actor.foe", itemId: "rifle", name: "Rifle" };
  const pistolStrike = { actorUuid: "Actor.foe", itemId: "pistol", name: "Pistol" };

  it("carries the weapon from the attack to the damage roll, once", async () => {
    const actor = shooter();
    await recordWeaponStrike(actor, "gun|", rifle);
    expect(await consumeWeaponStrike(actor, "gun|")).toEqual(rifle);
    expect(await consumeWeaponStrike(actor, "gun|")).toBeNull();
  });

  it("lands every hit of a burst on the weapon, and no more", async () => {
    const actor = shooter();
    await recordWeaponStrike(actor, "smg|", rifle, 3);
    expect(await consumeWeaponStrike(actor, "smg|")).toEqual(rifle);
    expect(await consumeWeaponStrike(actor, "smg|")).toEqual(rifle);
    expect(await consumeWeaponStrike(actor, "smg|")).toEqual(rifle);
    expect(await consumeWeaponStrike(actor, "smg|")).toBeNull();
  });

  it("keeps each hand's strike of a Dual-Weapon Attack apart", async () => {
    const actor = shooter();
    await recordWeaponStrike(actor, "left|", rifle);
    await recordWeaponStrike(actor, "right|", pistolStrike);
    expect(await consumeWeaponStrike(actor, "right|")).toEqual(pistolStrike);
    expect(await consumeWeaponStrike(actor, "left|")).toEqual(rifle);
    expect(await consumeWeaponStrike(actor, "other|")).toBeNull();
  });

  it("is cleared by the row's next attack at anything else, and by a miss", async () => {
    const actor = shooter();
    await recordWeaponStrike(actor, "gun|", rifle);
    await recordWeaponStrike(actor, "other|", pistolStrike);
    await recordWeaponStrike(actor, "gun|", null);
    expect(await consumeWeaponStrike(actor, "gun|")).toBeNull();
    await recordWeaponStrike(actor, "gun|", rifle, 0);
    expect(await consumeWeaponStrike(actor, "gun|")).toBeNull();
    expect(await consumeWeaponStrike(actor, "other|")).toEqual(pistolStrike);
  });
});

describe("weaponStrikeHits", () => {
  it("is the burst's hits on a hit, one for a single shot, none on a miss", () => {
    // RoF 10 at Rcl 2 made by 4: one hit, plus one for every full 2 of margin.
    expect(weaponStrikeHits({ success: true, margin: 4 }, { shotsFired: 10, recoil: 2 })).toBe(3);
    expect(weaponStrikeHits({ success: true, margin: 0 }, { shotsFired: 1, recoil: 2 })).toBe(1);
    expect(weaponStrikeHits({ success: false, margin: -2 }, { shotsFired: 10, recoil: 2 })).toBe(0);
    expect(weaponStrikeHits(null, { shotsFired: 3, recoil: 2 })).toBe(0);
  });
});
