import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let repairsOn = true;
vi.mock("../optional-rules.js", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  isRuleOn: (key: string) => key !== "repairs" || repairsOn,
}));

/** Each 3d6 the next roll comes up, as its three faces. */
const dice: number[][] = [];
/** The context each card was rendered with. */
const cards: Array<Record<string, any>> = [];

vi.mock("../weapon-damage.js", () => ({
  weaponFacts: (item: any) => ({
    ht: item.system.ht ?? 10,
    hp: item.system.hp ?? 10,
    firearm: Boolean(item.system.firearm),
  }),
}));

import { createApi } from "../api.js";
import { equipmentFailure, exposureCheck } from "../repairs.js";

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
  repairsOn = true;
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

/** A generator, HT 10 and 10 HP unless told otherwise. */
function gear(system: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) {
  const item: any = {
    name: "Generator",
    isOwner: true,
    actor: { name: "Owner" },
    system: { hpLost: 0, ...system },
    update: vi.fn(async (data: any) => { item.system.hpLost = data["system.hpLost"]; }),
    ...extra,
  };
  return item;
}

describe("an equipment failure roll a module asks for (Campaigns p. 485)", () => {
  it("rolls against the item's HT with the modifier, and a success leaves it working", async () => {
    const item = gear();
    dice.push([2, 3, 3]); // 8 against HT 10 - 2
    const result = await equipmentFailure({ item, modifier: -2, label: "Daily check" });
    expect(result).toEqual({ outcome: "success", result: "works", target: 8, roll: 8, margin: 0, applied: false, downgraded: false });
    expect(item.update).not.toHaveBeenCalled();
    expect(cards[0]).toMatchObject({ exposure: true, target: 8, failed: false });
    expect(cards[0]?.failureModifiers).toEqual([{ label: "Daily check", value: -2 }]);
    expect(cards[0]?.title).toContain("Daily check");
  });

  it("has no exposure +4, and a failure needs a minor repair", async () => {
    const item = gear();
    dice.push([4, 4, 3]); // 11 against HT 10
    const result = await equipmentFailure({ item });
    expect(result).toMatchObject({ outcome: "failure", result: "needsMinorRepair", target: 10, margin: 1, applied: true });
    expect(item.system.hpLost).toBe(5);
    // With no modifier there is no modifier line.
    expect(cards[0]?.failureModifiers).toEqual([]);
  });

  it("marks a critical failure for a major repair", async () => {
    const item = gear({ ht: 12, hp: 8 });
    dice.push([6, 6, 6]);
    const result = await equipmentFailure({ item, modifier: 1 });
    expect(result).toMatchObject({ outcome: "criticalFailure", result: "needsMajorRepair", target: 13, applied: true });
    expect(item.system.hpLost).toBe(8);
  });

  it("reports without marking the thing down when apply is false", async () => {
    const item = gear();
    dice.push([6, 6, 5]);
    const result = await equipmentFailure({ item, apply: false });
    expect(result).toMatchObject({ outcome: "criticalFailure", applied: false });
    expect(item.update).not.toHaveBeenCalled();
  });

  it("marks nothing on a thing that keeps no hit points", async () => {
    const vest = gear({ hpLost: undefined });
    dice.push([6, 6, 5]);
    expect(await equipmentFailure({ item: vest })).toMatchObject({ outcome: "criticalFailure", applied: false });
    expect(vest.update).not.toHaveBeenCalled();
  });

  it("counts missed maintenance against a thing with moving parts only", async () => {
    dice.push([3, 3, 2], [3, 3, 2]);
    expect((await equipmentFailure({ item: gear({ firearm: true, missedMaintenance: 2 }) }))?.target).toBe(8);
    expect((await equipmentFailure({ item: gear({ firearm: false, missedMaintenance: 2 }) }))?.target).toBe(10);
  });

  it("lets the hook's listeners add lines, and tells them the label", async () => {
    const seen: any[] = [];
    globals.Hooks = {
      callAll: (event: string, context: any) => {
        if (event !== "gworld.equipmentFailure") return;
        seen.push({ label: context.label, target: context.target });
        context.modifiers.push({ label: "Dusty", value: -3 });
      },
    };
    dice.push([3, 3, 3]);
    const result = await equipmentFailure({ item: gear(), modifier: 1, label: "Emergency stop" });
    expect(seen).toEqual([{ label: "Emergency stop", target: 11 }]);
    expect(result?.target).toBe(8);
    expect(cards[0]?.failureModifiers).toEqual([{ label: "Emergency stop", value: 1 }, { label: "Dusty", value: -3 }]);
  });

  it("does nothing for a user who doesn't own the item, whatever the Repairs switch", async () => {
    expect(await equipmentFailure({ item: gear({}, { isOwner: false }) })).toBeNull();
    expect(cards).toHaveLength(0);
    repairsOn = false;
    dice.push([3, 3, 3]);
    expect((await equipmentFailure({ item: gear() }))?.outcome).toBe("success");
  });

  it("is on the API as items.equipmentFailure", async () => {
    dice.push([3, 3, 3]);
    expect((await createApi().items.equipmentFailure({ item: gear() }))?.outcome).toBe("success");
  });
});

describe("a listener's downgrade of a critical failure (since 1.127.0)", () => {
  function downgrading(label = "") {
    const seen: any[] = [];
    globals.Hooks = {
      callAll: (event: string, context: any) => {
        if (event !== "gworld.equipmentFailure") return;
        seen.push({ downgradeCriticalFailure: context.downgradeCriticalFailure, downgradeLabel: context.downgradeLabel });
        context.downgradeCriticalFailure = true;
        context.downgradeLabel = label;
      },
    };
    return seen;
  }

  it("makes a critical failure an ordinary one before the thing is marked", async () => {
    const seen = downgrading("Surge protector");
    const item = gear({ ht: 12, hp: 8 });
    dice.push([6, 6, 6]);
    const result = await equipmentFailure({ item });
    expect(seen).toEqual([{ downgradeCriticalFailure: false, downgradeLabel: "" }]);
    expect(result).toMatchObject({ outcome: "failure", result: "needsMinorRepair", applied: true, downgraded: true });
    // Half its HP, not all of them.
    expect(item.system.hpLost).toBe(4);
    expect(cards[0]).toMatchObject({ failed: true, downgraded: "Surge protector", result: "GWORLD.Repair.Exposure.needsMinorRepair" });
  });

  it("shows the system's line where the listener gave none", async () => {
    downgrading();
    dice.push([6, 6, 5]);
    await equipmentFailure({ item: gear() });
    expect(cards[0]?.downgraded).toBe("GWORLD.Repair.Downgraded");
  });

  it("changes nothing on a roll that wasn't a critical failure", async () => {
    downgrading("Surge protector");
    dice.push([4, 4, 3], [3, 3, 3]);
    expect(await equipmentFailure({ item: gear() })).toMatchObject({ outcome: "failure", downgraded: false });
    expect(await equipmentFailure({ item: gear() })).toMatchObject({ outcome: "success", downgraded: false });
    expect(cards.map((card) => card.downgraded)).toEqual([null, null]);
  });

  it("works for the exposure check too", async () => {
    downgrading();
    const item = gear();
    dice.push([6, 6, 6]);
    await exposureCheck({ actor: null, item, care: 0 });
    expect(item.system.hpLost).toBe(5);
    expect(cards[0]).toMatchObject({ result: "GWORLD.Repair.Exposure.needsMinorRepair", downgraded: "GWORLD.Repair.Downgraded" });
  });
});

describe("the exposure check still rolls HT+4 (Campaigns p. 485)", () => {
  it("adds the +4 and the care taken, and gives the hook a null label", async () => {
    const labels: unknown[] = [];
    globals.Hooks = { callAll: (event: string, context: any) => { if (event === "gworld.equipmentFailure") labels.push(context.label); } };
    const item = gear();
    dice.push([6, 5, 5]); // 16 against 10 + 4 + 1
    await exposureCheck({ actor: null, item, care: 1 });
    expect(cards[0]).toMatchObject({ target: 15, failed: true });
    expect(cards[0]?.title).toContain("ExposureTitle");
    expect(item.system.hpLost).toBe(5);
    expect(labels).toEqual([null]);
  });
});

describe("a listener calling off the exposure check (since API 1.152.0)", () => {
  function cancelling(label = "", when: (context: any) => boolean = () => true) {
    const seen: any[] = [];
    globals.Hooks = {
      callAll: (event: string, context: any) => {
        if (event !== "gworld.equipmentFailure") return;
        seen.push({ exposure: context.exposure, cancel: context.cancel, cancelLabel: context.cancelLabel });
        if (when(context)) {
          context.cancel = true;
          context.cancelLabel = label;
        }
      },
    };
    return seen;
  }

  it("rolls no dice and marks nothing, and the card says why", async () => {
    const seen = cancelling("In its holster");
    const item = gear();
    dice.push([6, 6, 6]);
    await exposureCheck({ actor: null, item, care: 0 });
    expect(seen).toEqual([{ exposure: true, cancel: false, cancelLabel: "" }]);
    expect(item.system.hpLost).toBe(0);
    expect(item.update).not.toHaveBeenCalled();
    // The die was never rolled.
    expect(dice).toHaveLength(1);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ exposure: true, spared: "In its holster" });
  });

  it("shows the system's line where the listener gave none", async () => {
    cancelling();
    await exposureCheck({ actor: null, item: gear(), care: 0 });
    expect(cards[0]?.spared).toBe("GWORLD.Repair.ExposureSpared");
  });

  it("lets the listener call off one item's check and not another's", async () => {
    cancelling("Sealed case", (context) => context.item.name === "Radio");
    const radio = gear({}, { name: "Radio" });
    const generator = gear();
    dice.push([6, 6, 6]);
    await exposureCheck({ actor: null, item: radio, care: 0 });
    await exposureCheck({ actor: null, item: generator, care: 0 });
    expect(radio.system.hpLost).toBe(0);
    expect(generator.system.hpLost).toBe(10);
    expect(cards.map((card) => card.spared)).toEqual(["Sealed case", undefined]);
  });

  it("can't call off a module's own roll, which tells the listener it isn't the exposure check", async () => {
    const seen = cancelling("In its holster");
    dice.push([3, 3, 3]);
    const result = await equipmentFailure({ item: gear() });
    expect(seen[0]?.exposure).toBe(false);
    expect(result?.outcome).toBe("success");
    expect(cards[0]?.spared).toBeUndefined();
  });
});
