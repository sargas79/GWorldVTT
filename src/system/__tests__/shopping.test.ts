import { afterEach, describe, expect, it } from "vitest";

import { buyGear, buyMore, unitPrice } from "../shopping.js";

const globals = globalThis as Record<string, unknown>;

afterEach(() => {
  for (const key of ["ChatMessage", "CONST", "foundry", "game", "ui"]) delete globals[key];
});

/** Foundry, as far as buying reaches: the chat it posts to and the notices it gives. */
function foundryStub() {
  const cards: any[] = [];
  globals.ChatMessage = { implementation: { create: async (data: any) => { cards.push(data); return data; }, getSpeaker: () => ({}) } };
  globals.CONST = { CHAT_MESSAGE_STYLES: { OTHER: 0 } };
  globals.foundry = {
    utils: { escapeHTML: (s: string) => s },
    applications: { handlebars: { renderTemplate: async (_path: string, data: any) => JSON.stringify(data) } },
  };
  globals.game = { i18n: { localize: (k: string) => k, format: (k: string, d: any) => `${k}:${JSON.stringify(d)}` } };
  globals.ui = { notifications: { info: () => {}, warn: () => {} } };
  return { cards };
}

/** A character with money, gear, and an item collection that behaves like Foundry's. */
function shopper(money: number, items: any[] = []) {
  const collection = items.map((item) => ({
    ...item,
    update: async function (this: any, changes: Record<string, unknown>) {
      if (typeof changes["system.quantity"] === "number") this.system.quantity = changes["system.quantity"];
    },
  }));
  const made: any[] = [];
  return {
    isOwner: true,
    name: "Shopper",
    system: { money, derived: { wealth: { status: 0 } } },
    items: Object.assign(collection, { get: (id: string) => collection.find((i) => i.id === id) }),
    made,
    update: async function (this: any, data: Record<string, unknown>) {
      if (typeof data["system.money"] === "number") this.system.money = data["system.money"];
    },
    createEmbeddedDocuments: async (_type: string, data: any[]) => {
      made.push(...data);
      return data;
    },
  };
}

const rope = { type: "equipment", name: "Rope, 3/8\"", img: "rope.webp", system: { cost: 10, weight: 1.5, quantity: 1 } };

describe("what a thing costs this character (Characters p. 266)", () => {
  it("is the price it is sold at", () => {
    foundryStub();
    expect(unitPrice(shopper(100), rope)).toBe(10);
  });

  it("is a share of the cost of living for clothing, so Status changes it", () => {
    foundryStub();
    const clothes = { type: "equipment", name: "Ordinary clothes", system: { cost: 0, costOfLivingPercent: 20 } };
    const poor = unitPrice(shopper(100), clothes);
    const grand = unitPrice({ isOwner: true, system: { money: 100, derived: { wealth: { status: 3 } } } }, clothes);
    expect(poor).toBeGreaterThan(0);
    expect(grand).toBeGreaterThan(poor);
  });
});

describe("buying gear out of the cash (Characters pp. 25-27)", () => {
  it("adds what was bought and takes the price off the money", async () => {
    const { cards } = foundryStub();
    const actor = shopper(100);
    const spent = await buyGear({ actor, data: { ...rope }, quantity: 3 });

    expect(spent).toBe(30);
    expect(actor.system.money).toBe(70);
    expect(actor.made).toHaveLength(1);
    expect(actor.made[0]).toMatchObject({ name: "Rope, 3/8\"", img: "rope.webp", system: { quantity: 3 } });
    // A purchase is not news for the chat: the sheet shows it.
    expect(cards).toHaveLength(0);
  });

  it("makes more rope of the rope already carried rather than a second entry", async () => {
    foundryStub();
    const actor = shopper(100, [{ id: "r", ...rope }]);
    await buyGear({ actor, data: { ...rope }, quantity: 2 });

    expect(actor.made).toHaveLength(0);
    expect(actor.items.get("r")!.system.quantity).toBe(3);
    expect(actor.system.money).toBe(80);
  });

  it("lets the cash go under, as a month of living unpaid for does", async () => {
    foundryStub();
    const actor = shopper(25);
    await buyGear({ actor, data: { ...rope }, quantity: 3 });
    expect(actor.system.money).toBe(-5);
  });

  it("charges nothing for something that costs nothing", async () => {
    const { cards } = foundryStub();
    const actor = shopper(40);
    await buyGear({ actor, data: { type: "equipment", name: "Rag", system: { cost: 0 } }, quantity: 1 });
    expect(actor.system.money).toBe(40);
    expect(cards).toHaveLength(0);
  });

  it("buys nothing with points: a skill is not shopping", async () => {
    foundryStub();
    const actor = shopper(100);
    expect(await buyGear({ actor, data: { type: "skill", name: "Guns", system: { points: 1 } }, quantity: 1 })).toBeNull();
    expect(actor.system.money).toBe(100);
  });

  it("leaves a character somebody else owns alone", async () => {
    foundryStub();
    const actor = { ...shopper(100), isOwner: false };
    expect(await buyGear({ actor, data: { ...rope }, quantity: 1 })).toBeNull();
    expect(actor.system.money).toBe(100);
  });
});

describe("buying more of what is already carried", () => {
  it("raises that item's own count and pays for the difference", async () => {
    const { cards } = foundryStub();
    const actor = shopper(100, [{ id: "r", ...rope, system: { ...rope.system, quantity: 2 } }]);
    const spent = await buyMore(actor, actor.items.get("r"), 4);

    expect(spent).toBe(40);
    expect(actor.items.get("r")!.system.quantity).toBe(6);
    expect(actor.system.money).toBe(60);
    expect(cards).toHaveLength(0);
  });

  it("buys more of a suit of armour rather than a second suit", async () => {
    foundryStub();
    const mail = { id: "m", type: "armor", name: "Mail Shirt", system: { cost: 150, quantity: 1 } };
    const actor = shopper(500, [mail]);
    await buyMore(actor, actor.items.get("m"), 1);

    expect(actor.made).toHaveLength(0);
    expect(actor.items.get("m")!.system.quantity).toBe(2);
    expect(actor.system.money).toBe(350);
  });
});
