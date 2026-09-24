import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** A disarm names the weapon and knocks it away (sargas79/GWorldVTT#738). */

const contests: any[] = [];
let contestResult: { outcome: "first" | "second" | "tie"; marginOfVictory: number } = { outcome: "first", marginOfVictory: 2 };
let strike: { success: boolean; criticalFailure: boolean } | null = { success: true, criticalFailure: false };
const strikes: any[] = [];

vi.mock("../contest.js", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  rollQuickContest: vi.fn(async (options: any) => {
    contests.push(options);
    return contestResult;
  }),
}));
vi.mock("../roll.js", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  rollSuccess: vi.fn(async (options: any) => {
    strikes.push(options);
    return strike;
  }),
}));

import { holdingSkill, rollDisarm, strikingSkill } from "../disarm.js";
import { HELD_WEAPON_QUERY, answerHeldWeaponQuery, knockWeaponAway, registerHeldWeaponQuery, setWeaponUnready } from "../held-weapons.js";
import { createApi } from "../api.js";

const globals = globalThis as Record<string, unknown>;
const hooks: Array<{ event: string; context: any }> = [];
const notes: Array<{ level: string; text: string }> = [];

beforeEach(() => {
  contests.length = 0;
  strikes.length = 0;
  hooks.length = 0;
  notes.length = 0;
  contestResult = { outcome: "first", marginOfVictory: 2 };
  strike = { success: true, criticalFailure: false };
  globals.game = {
    i18n: { localize: (k: string) => k, format: (k: string, d: any) => `${k}:${JSON.stringify(d)}` },
    users: { activeGM: null },
  };
  globals.ui = {
    notifications: {
      info: (text: string) => notes.push({ level: "info", text }),
      warn: (text: string) => notes.push({ level: "warn", text }),
    },
  };
  globals.Hooks = { callAll: (event: string, context: any) => { hooks.push({ event, context }); return true; } };
});

afterEach(() => {
  for (const key of ["game", "ui", "Hooks", "CONFIG", "fromUuid"]) delete globals[key];
});

/** A piece of gear on an actor, whose updates land on its system data. */
function gear(options: { id: string; name: string; type?: string; isOwner?: boolean; system?: Record<string, unknown> }) {
  const item: any = {
    id: options.id,
    uuid: `Actor.foe.Item.${options.id}`,
    name: options.name,
    type: options.type ?? "equipment",
    isOwner: options.isOwner ?? true,
    actor: {},
    system: { carried: true, equipped: true, unready: false, ...(options.system ?? {}) },
    update: vi.fn(async (data: Record<string, unknown>) => {
      for (const [key, value] of Object.entries(data)) item.system[key.replace(/^system\./, "")] = value;
    }),
  };
  return item;
}

/** An actor with the given melee rows and items. */
function fighter(name: string, melee: any[], items: any[] = [], dx = 12) {
  const byId = new Map(items.map((i) => [i.id, i]));
  return { name, system: { derived: { melee, attributes: { DX: dx } } }, items: { get: (id: string) => byId.get(id) } };
}

describe("the skills a disarm is rolled at (Campaigns p. 401)", () => {
  it("has the foe roll their skill with the weapon struck at, not their best", () => {
    const foe = fighter("Foe", [
      { itemId: "sword", skillName: "Broadsword", skillLevel: 13 },
      { itemId: "knife", skillName: "Knife", skillLevel: 11 },
      { itemId: "knife", skillName: "Knife", skillLevel: 10 },
    ]);
    expect(holdingSkill(foe, "knife")).toEqual({ name: "Knife", level: 11 });
    expect(holdingSkill(foe, null)).toEqual({ name: "Broadsword", level: 13 });
  });

  it("has them roll DX for a missile weapon, which has no melee row", () => {
    const foe = fighter("Archer", [{ itemId: "sword", skillName: "Broadsword", skillLevel: 13 }], [], 14);
    expect(holdingSkill(foe, "bow")).toEqual({ name: "DX", level: 14 });
  });

  it("strikes with the best weapon that is ready and not stuck", () => {
    const actor = fighter("Me", [
      { itemId: "axe", skillName: "Axe/Mace", skillLevel: 16, unready: true },
      { itemId: "pick", skillName: "Axe/Mace", skillLevel: 15, stuck: { uuid: "x" } },
      { itemId: "sword", skillName: "Broadsword", skillLevel: 12 },
    ]);
    expect(strikingSkill(actor)).toEqual({ name: "Broadsword", level: 12, itemId: "sword" });
  });
});

describe("a disarm's contest and what it does", () => {
  const target = { id: "knife", name: "Knife", penalty: -4, canDisarm: true, noParry: false, noDefenseBonus: false, disarmPenaltyForAll: false };

  function setup(foeOwned = true) {
    const sword = gear({ id: "sword", name: "Sword" });
    const knife = gear({ id: "knife", name: "Knife", isOwner: foeOwned });
    const actor = fighter("Me", [{ itemId: "sword", skillName: "Broadsword", skillLevel: 14 }], [sword]);
    const foe = fighter("Foe", [
      { itemId: "axe", skillName: "Axe/Mace", skillLevel: 15 },
      { itemId: "knife", skillName: "Knife", skillLevel: 11 },
    ], [knife]);
    return { sword, knife, actor, foe };
  }

  it("names both weapons on the contest, and rolls the foe's skill with the one struck at", async () => {
    const { sword, knife, actor, foe } = setup();
    await rollDisarm({ actor, foe, fencingWeapon: false, jitteOrWhip: false, foeTwoHanded: false, target });
    expect(strikes[0]?.item).toBe(sword);
    expect(contests[0]?.first).toMatchObject({ item: sword, base: 14, note: "Broadsword" });
    expect(contests[0]?.second).toMatchObject({ item: knife, base: 11, note: "Knife" });
  });

  it("knocks the weapon out of their hands when won, and tells the modules", async () => {
    const { knife, actor, foe } = setup();
    await rollDisarm({ actor, foe, fencingWeapon: false, jitteOrWhip: false, foeTwoHanded: false, target });
    expect(knife.system).toMatchObject({ carried: false, equipped: false, unready: false });
    const after = hooks.find((h) => h.event === "gworld.afterDisarm");
    expect(after?.context).toEqual({ actor, foe, item: knife, result: { disarmed: true, unready: false, attackerDisarmed: false } });
    expect(notes[0]?.text).toContain("GWORLD.Disarm.DisarmedWeapon");
  });

  it("leaves it unready when the foe wins by less than 3, and ready when by 3 or more", async () => {
    const first = setup();
    contestResult = { outcome: "second", marginOfVictory: 2 };
    await rollDisarm({ actor: first.actor, foe: first.foe, fencingWeapon: false, jitteOrWhip: false, foeTwoHanded: false, target });
    expect(first.knife.system).toMatchObject({ carried: true, unready: true });

    const second = setup();
    contestResult = { outcome: "second", marginOfVictory: 3 };
    await rollDisarm({ actor: second.actor, foe: second.foe, fencingWeapon: false, jitteOrWhip: false, foeTwoHanded: false, target });
    expect(second.knife.update).not.toHaveBeenCalled();
    expect(hooks.filter((h) => h.event === "gworld.afterDisarm").at(-1)?.context.result).toEqual({ disarmed: false, unready: false, attackerDisarmed: false });
  });

  it("rolls no contest and changes nothing when the strike misses", async () => {
    const { knife, actor, foe } = setup();
    strike = { success: false, criticalFailure: false };
    await rollDisarm({ actor, foe, fencingWeapon: false, jitteOrWhip: false, foeTwoHanded: false, target });
    expect(contests).toHaveLength(0);
    expect(knife.update).not.toHaveBeenCalled();
    expect(hooks.some((h) => h.event === "gworld.afterDisarm")).toBe(false);
  });

  it("asks the GM's client when the user doesn't own the foe, and warns when no GM is there", async () => {
    const { knife, actor, foe } = setup(false);
    const query = vi.fn(async () => ({ itemId: "knife", reason: "disarm" }));
    (globals.game as any).users.activeGM = { isSelf: false, query };
    await rollDisarm({ actor, foe, fencingWeapon: false, jitteOrWhip: false, foeTwoHanded: false, target });
    expect(query).toHaveBeenCalledWith(HELD_WEAPON_QUERY, { action: "knockAway", uuid: knife.uuid, reason: "disarm" }, expect.anything());
    expect(knife.update).not.toHaveBeenCalled();

    (globals.game as any).users.activeGM = null;
    notes.length = 0;
    await rollDisarm({ actor, foe, fencingWeapon: false, jitteOrWhip: false, foeTwoHanded: false, target });
    expect(notes.some((n) => n.level === "warn" && n.text.startsWith("GWORLD.Disarm.NotApplied"))).toBe(true);
  });
});

describe("items.setUnready and items.knockAway (since API 1.136.0)", () => {
  it("are on the API and change an owned weapon directly", async () => {
    const api = createApi();
    const axe = gear({ id: "axe", name: "Axe" });
    expect(await api.items.setUnready(axe, true, { reason: "snatch" })).toEqual({ itemId: "axe", unready: true, reason: "snatch" });
    expect(axe.system.unready).toBe(true);
    expect(await api.items.knockAway(axe)).toEqual({ itemId: "axe", reason: "" });
    expect(axe.system).toMatchObject({ carried: false, equipped: false, unready: false });
  });

  it("refuse what can't leave a hand: a trait's attack, and a shield's readiness", async () => {
    const claws = gear({ id: "claws", name: "Claws", type: "trait" });
    const shield = gear({ id: "shield", name: "Shield", type: "shield" });
    expect(await knockWeaponAway(claws)).toBeNull();
    expect(await setWeaponUnready(shield, true)).toBeNull();
    expect(await knockWeaponAway(shield)).toEqual({ itemId: "shield", reason: "" });
    expect(shield.system).toMatchObject({ carried: false, equipped: false });
  });

  it("return null for somebody else's weapon with no GM connected, or the GM's own client unable to", async () => {
    const knife = gear({ id: "knife", name: "Knife", isOwner: false });
    expect(await knockWeaponAway(knife)).toBeNull();
    (globals.game as any).users.activeGM = { isSelf: true, query: vi.fn() };
    expect(await setWeaponUnready(knife, true)).toBeNull();
    (globals.game as any).users.activeGM = { isSelf: false, query: vi.fn(async () => { throw new Error("timed out"); }) };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await setWeaponUnready(knife, true)).toBeNull();
    warn.mockRestore();
  });
});

describe("the GM's side of the query", () => {
  it("is registered in CONFIG.queries and makes only the two changes", async () => {
    globals.CONFIG = { queries: {} };
    registerHeldWeaponQuery();
    expect((globals.CONFIG as any).queries[HELD_WEAPON_QUERY]).toBe(answerHeldWeaponQuery);

    const knife = gear({ id: "knife", name: "Knife" });
    globals.fromUuid = vi.fn(async (uuid: string) => (uuid === knife.uuid ? knife : null));
    expect(await answerHeldWeaponQuery({ action: "unready", uuid: knife.uuid, unready: true, reason: "disarm" }))
      .toEqual({ itemId: "knife", unready: true, reason: "disarm" });
    expect(knife.system.unready).toBe(true);
    expect(await answerHeldWeaponQuery({ action: "delete", uuid: knife.uuid })).toBeNull();
    expect(await answerHeldWeaponQuery({ action: "knockAway", uuid: "Actor.x.Item.gone" })).toBeNull();
    expect(await answerHeldWeaponQuery(null)).toBeNull();
  });
});
