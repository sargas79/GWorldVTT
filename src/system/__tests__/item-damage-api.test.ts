import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../optional-rules.js", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  isRuleOn: () => true,
}));

import { createApi } from "../api.js";
import { applyItemDamage } from "../item-damage.js";
import { weaponFacts } from "../weapon-damage.js";

/** Each 3d6 the next roll comes up, as its three faces. */
const dice: number[][] = [];
/** The context each card was rendered with. */
const cards: Array<Record<string, any>> = [];

const globals = globalThis as Record<string, unknown>;

class FakeRoll {
  total = 0;
  dice: Array<{ results: Array<{ result: number }> }> = [];
  constructor(readonly formula: string) {}
  async evaluate() {
    const faces = dice.shift() ?? [3, 4, 3];
    this.total = faces.reduce((sum, face) => sum + face, 0);
    this.dice = [{ results: faces.map((result) => ({ result })) }];
    return this;
  }
}

beforeEach(() => {
  dice.length = 0;
  cards.length = 0;
  globals.Roll = FakeRoll;
  globals.game = { i18n: { localize: (key: string) => key, format: (key: string, data: Record<string, unknown>) => `${key} ${JSON.stringify(data)}` } };
  globals.foundry = { applications: { handlebars: { renderTemplate: async (_path: string, context: Record<string, any>) => { cards.push(context); return "card"; } } } };
  globals.CONST = { CHAT_MESSAGE_STYLES: { OTHER: 0 } };
  globals.ChatMessage = { implementation: { getSpeaker: () => ({}), create: vi.fn(async () => ({})) } };
});

afterEach(() => {
  delete globals.Roll;
  delete globals.game;
  delete globals.foundry;
  delete globals.CONST;
  delete globals.ChatMessage;
  delete globals.Hooks;
});

/** A pistol: a machine of 2.5 lbs, so DR 4, HP 6 and HT 10. */
function pistol(system: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) {
  const item: any = {
    id: "pistol1",
    type: "equipment",
    name: "Pistol",
    isOwner: true,
    actor: { name: "Owner" },
    system: { weight: 2.5, hpLost: 0, rangedModes: [{ skill: "Guns (Pistol)", damageType: "pi", malfunction: 17 }], ...system },
    update: vi.fn(async (data: any) => { item.system.hpLost = data["system.hpLost"]; }),
    ...extra,
  };
  return item;
}

function listen(listener: (context: any) => void) {
  globals.Hooks = { callAll: (event: string, context: any) => { if (event === "gworld.objectStats") listener(context); } };
}

describe("damage to a thing from a module (Campaigns pp. 483-484)", () => {
  it("takes its DR off, raises hpLost by the injury and posts the card", async () => {
    const item = pistol();
    const result = await applyItemDamage({ item, damage: 10, type: "cr", label: "Dropped off a cliff" });
    expect(result).toMatchObject({
      itemId: "pistol1", kind: "unliving", dr: 4, hp: 6, ht: 10,
      effectiveDr: 4, penetrating: 6, woundingModifier: 1, injury: 6,
      from: 0, to: 6, state: "failing", rolls: [], destroyed: false,
    });
    expect(item.system.hpLost).toBe(6);
    expect(cards[0]).toMatchObject({ label: "Dropped off a cliff", injury: 6, to: 6 });
  });

  it("uses the wounding modifier its kind allows, with at least 1 HP through", async () => {
    // A machine takes a third from piercing: 6 through, 2 injury.
    expect((await applyItemDamage({ item: pistol(), damage: 10, type: "pi" }))?.injury).toBe(2);
    // Cutting is x1.5 on a thing as on anyone: 2 through, 3 injury.
    expect((await applyItemDamage({ item: pistol(), damage: 6, type: "cut" }))?.injury).toBe(3);
    // One through at pi- is still a point.
    expect((await applyItemDamage({ item: pistol(), damage: 5, type: "pi-" }))?.injury).toBe(1);
  });

  it("divides its DR by the armor divisor", async () => {
    const result = await applyItemDamage({ item: pistol(), damage: 5, type: "cr", armorDivisor: 2 });
    expect(result).toMatchObject({ armorDivisor: 2, effectiveDr: 2, penetrating: 3, injury: 3 });
    expect(cards[0]).toMatchObject({ divided: true });
  });

  it("changes nothing for a blow its DR stops, and still says so", async () => {
    const item = pistol();
    const result = await applyItemDamage({ item, damage: 3, type: "cr" });
    expect(result).toMatchObject({ injury: 0, from: 0, to: 0, state: "sound" });
    expect(item.update).not.toHaveBeenCalled();
    expect(cards).toHaveLength(1);
    expect(cards[0]?.label).toContain("GWORLD.ItemDamage.Label");
  });

  it("rolls HT at -1xHP, and holds together on a success", async () => {
    const item = pistol({ hpLost: 6 });
    dice.push([3, 3, 3]); // 9 against HT 10
    const result = await applyItemDamage({ item, damage: 10, type: "cr" });
    expect(result).toMatchObject({ from: 6, to: 12, state: "breaking", destroyed: false, rolls: [{ multiple: 1, target: 10, roll: 9, success: true }] });
  });

  it("is destroyed on a failed HT roll, which puts it at -5xHP", async () => {
    const item = pistol({ hpLost: 6 });
    dice.push([6, 5, 4]);
    const result = await applyItemDamage({ item, damage: 10, type: "cr" });
    expect(result).toMatchObject({ from: 6, to: 36, state: "destroyed", destroyed: true });
    expect(result?.rolls).toHaveLength(1);
    expect(weaponFacts(item).condition).toBe("destroyed");
  });

  it("rolls at each multiple it passes, and stops at the first failure", async () => {
    const item = pistol();
    dice.push([3, 3, 3], [6, 6, 5]);
    const result = await applyItemDamage({ item, damage: 4 + 24, type: "cr" }); // to -3xHP
    expect(result?.rolls.map((r) => [r.multiple, r.success])).toEqual([[1, true], [2, false]]);
    expect(result).toMatchObject({ to: 36, destroyed: true });
  });

  it("is destroyed without a roll at -5xHP", async () => {
    const result = await applyItemDamage({ item: pistol(), damage: 4 + 36, type: "cr" });
    expect(result).toMatchObject({ to: 36, state: "destroyed", destroyed: true, rolls: [] });
  });

  it("rolls nothing more for a thing already destroyed", async () => {
    const result = await applyItemDamage({ item: pistol({ hpLost: 36 }), damage: 10, type: "cr" });
    expect(result).toMatchObject({ from: 36, to: 42, destroyed: false, rolls: [] });
  });

  it("goes by the kind a gworld.objectStats listener set", async () => {
    listen((context) => { context.kind = "diffuse"; });
    // A diffuse thing takes 2 at most from anything but piercing and impaling.
    expect(await applyItemDamage({ item: pistol(), damage: 30, type: "cut" })).toMatchObject({ kind: "diffuse", injury: 2 });
    listen((context) => { context.kind = "homogenous"; });
    // A solid thing takes a fifth from piercing: 6 through, 1 injury.
    expect(await applyItemDamage({ item: pistol(), damage: 10, type: "pi" })).toMatchObject({ kind: "homogenous", injury: 1 });
  });

  it("is null where nothing can be done", async () => {
    expect(await applyItemDamage({ item: pistol({}, { isOwner: false }), damage: 10, type: "cr" })).toBeNull();
    expect(await applyItemDamage({ item: pistol({ hpLost: undefined }), damage: 10, type: "cr" })).toBeNull();
    expect(await applyItemDamage({ item: pistol({ weight: 0 }), damage: 10, type: "cr" })).toBeNull();
    expect(await applyItemDamage({ item: pistol(), damage: -1, type: "cr" })).toBeNull();
    expect(await applyItemDamage({ item: pistol(), damage: Number.NaN, type: "cr" })).toBeNull();
    expect(await applyItemDamage({ item: pistol(), damage: 10, type: "fat" })).toBeNull();
    expect(await applyItemDamage({ item: pistol(), damage: 10, type: "sonic" })).toBeNull();
    expect(cards).toHaveLength(0);
  });

  it("is on the API as items.applyDamage", async () => {
    const item = pistol();
    expect((await createApi().items.applyDamage({ item, damage: 10, type: "cr" }))?.injury).toBe(6);
  });
});

describe("a weapon struck at goes by its kind too (since API 1.126.0)", () => {
  it("carries the listener's kind into the weapon's facts", () => {
    listen((context) => { context.kind = "diffuse"; });
    expect(weaponFacts(pistol()).kind).toBe("diffuse");
  });
});
