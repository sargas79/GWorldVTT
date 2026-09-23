import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../optional-rules.js", () => ({ isRuleOn: () => true }));

const outcomes: Array<{ success: boolean; criticalFailure?: boolean }> = [];
const rolled: any[] = [];
vi.mock("../roll.js", () => ({
  rollSuccess: async (options: any) => {
    rolled.push(options);
    return outcomes.shift() ?? null;
  },
}));

import { afflictionDrBonus } from "../../rules/affliction-resistance.js";
import { drMetByAttack } from "../damage.js";
import { afterPickBlow, freeStuckWeapon, letGoOfStuckWeapon, stuckWeaponOf } from "../picks.js";

const globals = globalThis as Record<string, unknown>;
const cards: string[] = [];

beforeEach(() => {
  cards.length = 0;
  rolled.length = 0;
  outcomes.length = 0;
  globals.foundry = { utils: { escapeHTML: (s: string) => s } };
  globals.CONST = { CHAT_MESSAGE_STYLES: { OTHER: 0 } };
  globals.ChatMessage = { implementation: { getSpeaker: () => ({}), create: async (data: any) => cards.push(data.content) } };
  globals.ui = { notifications: { warn: vi.fn() } };
});

afterEach(() => {
  delete globals.Hooks;
  delete globals.foundry;
  delete globals.CONST;
  delete globals.ChatMessage;
  delete globals.ui;
});

/** A warhammer in the hands of someone with ST 12, its flags kept as Foundry would. */
function warhammer(options: { readiesAfterAttack?: boolean } = {}) {
  const actor: any = {
    isOwner: true,
    system: {
      maneuver: "attack",
      derived: {
        attributes: { ST: 12 },
        melee: [{ itemId: "hammer", modeIndex: 0, readiesAfterAttack: options.readiesAfterAttack ?? true }],
      },
    },
    update: vi.fn(async (data: any) => { if (data["system.maneuver"]) actor.system.maneuver = data["system.maneuver"]; }),
  };
  const item: any = {
    id: "hammer",
    name: "Warhammer",
    type: "equipment",
    isOwner: true,
    parent: actor,
    flags: {},
    system: { unready: false },
    getFlag(scope: string, key: string) { return this.flags[scope]?.[key]; },
    async setFlag(scope: string, key: string, value: unknown) { this.flags[scope] = { ...(this.flags[scope] ?? {}), [key]: value }; },
    async unsetFlag(scope: string, key: string) { delete this.flags[scope]?.[key]; },
    update: vi.fn(async (data: any) => { if ("system.unready" in data) item.system.unready = data["system.unready"]; }),
  };
  return { actor, item };
}

const foe = { uuid: "Actor.foe", name: "Orc" };
const mode = { index: 0, ranged: false };
const through = { injury: 6, penetrating: 4, hitLocation: "torso" };

describe("a pick stuck in its victim (Campaigns p. 405)", () => {
  it("sticks after a blow that penetrates DR and does damage", async () => {
    const { item } = warhammer();
    expect(await afterPickBlow({ item, mode, target: foe, pick: true, result: through })).toBe(true);
    expect(stuckWeaponOf(item)).toEqual({ uuid: "Actor.foe", name: "Orc", forGood: false, held: true, modeIndex: 0 });
    expect(cards).toHaveLength(1);
  });

  it("does not stick after a blow armour stopped, or a weapon that is no pick", async () => {
    const { item } = warhammer();
    expect(await afterPickBlow({ item, mode, target: foe, pick: true, result: { injury: 0, penetrating: 0, hitLocation: "torso" } })).toBe(false);
    expect(await afterPickBlow({ item, mode, target: foe, pick: false, result: through })).toBe(false);
    expect(stuckWeaponOf(item)).toBeNull();
  });

  it("lets gworld.weaponStuck decide", async () => {
    const seen: any[] = [];
    globals.Hooks = { callAll: (event: string, context: any) => { if (event === "gworld.weaponStuck") { seen.push({ ...context }); context.stuck = !context.stuck; } } };
    const { item } = warhammer();
    // A listener keeps a pick's blow from sticking...
    expect(await afterPickBlow({ item, mode, target: foe, pick: true, result: through })).toBe(false);
    expect(seen[0]).toMatchObject({ pick: true, stuck: true, target: foe, mode, result: through });
    // ... or makes another blow stick.
    expect(await afterPickBlow({ item, mode, target: foe, pick: false, result: through })).toBe(true);
  });

  it("comes free on a ST roll, unready where it must be readied after an attack", async () => {
    const { actor, item } = warhammer();
    await afterPickBlow({ item, mode, target: foe, pick: true, result: through });
    outcomes.push({ success: true });
    expect(await freeStuckWeapon(actor, item)).toBe("freed");
    expect(rolled[0]).toMatchObject({ base: 12, kind: "attribute", tags: ["ST", "stuckWeapon"], item });
    expect(stuckWeaponOf(item)).toBeNull();
    expect(item.system.unready).toBe(true);
    expect(actor.system.maneuver).toBe("ready");
  });

  it("stays stuck on a failure, and for good on a critical failure", async () => {
    const { actor, item } = warhammer({ readiesAfterAttack: false });
    await afterPickBlow({ item, mode, target: foe, pick: true, result: through });
    outcomes.push({ success: false }, { success: false, criticalFailure: true });
    expect(await freeStuckWeapon(actor, item)).toBe("stuck");
    expect(stuckWeaponOf(item)).toMatchObject({ forGood: false, held: true });
    expect(await freeStuckWeapon(actor, item)).toBe("stuckForGood");
    expect(stuckWeaponOf(item)).toMatchObject({ forGood: true });
    // Stuck for good, only letting go is left.
    expect(await freeStuckWeapon(actor, item)).toBeNull();
    expect(rolled).toHaveLength(2);
    expect(await letGoOfStuckWeapon(actor, item)).toBe(true);
    expect(stuckWeaponOf(item)).toMatchObject({ forGood: true, held: false });
  });
});

describe("DR against an affliction's resistance roll (Characters p. 35)", () => {
  const target = (dr: number, natural = 0, hardened = 0) => ({
    name: "Target",
    system: { derived: { traitEffects: { damageResistance: natural } } },
    items: [{ type: "armor", system: { dr, locations: ["torso"], equipped: true, hardened, drSplit: null, drSplitAppliesTo: [] } }],
  });

  it("counts worn armour and the target's own DR, divided by the attack's divisor", () => {
    const met = drMetByAttack(target(4, 2), { hitLocation: "torso", damageType: "cr", armorDivisor: 2 });
    expect(met).toEqual({ dr: 6, armorDivisor: 2, ignoresDr: false });
    expect(afflictionDrBonus(met)).toBe(3);
  });

  it("lets Hardened step the divisor down", () => {
    const met = drMetByAttack(target(4, 0, 1), { hitLocation: "torso", damageType: "cr", armorDivisor: 2 });
    expect(afflictionDrBonus(met)).toBe(4);
  });

  it("gives nothing against an attack that ignores DR", () => {
    const met = drMetByAttack(target(4, 2), { hitLocation: "torso", damageType: "cr", armorDivisor: 1, ignoresDr: true });
    expect(afflictionDrBonus(met)).toBe(0);
  });
});
