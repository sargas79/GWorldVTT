import { afterEach, describe, expect, it, vi } from "vitest";

import { fragileKindsOf, shootAtVehicle } from "../hazards.js";

const globals = globalThis as Record<string, unknown>;

afterEach(() => {
  for (const key of ["ChatMessage", "CONST", "foundry", "game", "Hooks", "Roll"]) delete globals[key];
  vi.restoreAllMocks();
});

/** Every die shows `face`: 3d6 totals three times it. The card's lines are kept. */
function stubFoundry(face: number) {
  const cards: any[] = [];
  globals.Hooks = { callAll: () => true };
  globals.ChatMessage = { implementation: { create: async (d: any) => d, getSpeaker: () => ({}) } };
  globals.CONST = { CHAT_MESSAGE_STYLES: { OTHER: 0 } };
  globals.foundry = { applications: { handlebars: { renderTemplate: async (_t: string, context: any) => { cards.push(context); return ""; } } } };
  globals.game = { i18n: { localize: (k: string) => k, format: (k: string) => k } };
  globals.Roll = class {
    total = face * 3;
    dice = [{ results: [{ result: face }, { result: face }, { result: face }] }];
    async evaluate() { return this; }
  };
  return cards;
}

/** A powered car on the map with 30 HP, HT 10, DR 5, and the fragility codes given. */
function car(fragility: string) {
  const update = vi.fn(async () => undefined);
  const toggleStatusEffect = vi.fn(async () => undefined);
  const vehicle = {
    documentName: "Actor",
    isOwner: true,
    uuid: "Actor.car",
    name: "Car",
    statuses: new Set<string>(),
    update,
    toggleStatusEffect,
    system: {
      hp: { value: 30, max: 30 },
      vehicle: {
        stHp: 30, ht: 10, fragility, acceleration: 5, sm: 3, locations: "G4W", dr: 5, drOther: null,
        drTop: null, drUnderbody: null, drByLocation: {},
      },
    },
  };
  return { vehicle, update, toggleStatusEffect };
}

/** A vehicle's c/f/x codes are Fragile (Campaigns p. 463; sargas79/GWorldVTT#669). */
describe("a Fragile vehicle shot at", () => {
  it("reads its kinds off the HT codes", () => {
    expect(fragileKindsOf(car("fx").vehicle)).toEqual(["explosive", "flammable"]);
    expect(fragileKindsOf(car("").vehicle)).toEqual([]);
  });

  it("catches fire outright from 10+ injury by fire when Combustible", async () => {
    stubFoundry(3);
    const { vehicle, toggleStatusEffect } = car("c");
    // 20 burning - DR 5 = 15 through, x1 for a burn: 15 injury.
    await shootAtVehicle({ actor: null, vehicle, damage: 20, location: "body", arc: null, occupants: 0, damageType: "burn", tightBeam: false });
    expect(toggleStatusEffect).toHaveBeenCalledWith("burning", { active: true });
  });

  it("blows up an Explosive vehicle on a critical failure of its major wound's HT roll", async () => {
    // Every die a 6: 18 on HT 10 is a critical failure.
    const cards = stubFoundry(6);
    const { vehicle, update, toggleStatusEffect } = car("x");
    // 25 crushing - 5 = 20 through an Unliving body: 20 injury, a major wound on 30 HP.
    await shootAtVehicle({ actor: null, vehicle, damage: 25, location: "body", arc: null, occupants: 0, damageType: "cr", tightBeam: false });
    expect(update).toHaveBeenLastCalledWith({ "system.hp.value": -300 });
    expect(toggleStatusEffect).toHaveBeenCalledWith("dead", { active: true });
    expect(cards.at(-1).lines).toContain("GWORLD.Hazard.FragileExplodes");
  });

  it("leaves a vehicle that is not Fragile alone", async () => {
    const cards = stubFoundry(6);
    const { vehicle, update, toggleStatusEffect } = car("");
    await shootAtVehicle({ actor: null, vehicle, damage: 25, location: "body", arc: null, occupants: 0, damageType: "burn", tightBeam: false });
    expect(update).toHaveBeenLastCalledWith({ "system.hp.value": 10 });
    expect(toggleStatusEffect).not.toHaveBeenCalled();
    expect(cards.at(-1).lines).not.toContain("GWORLD.Hazard.FragileAlight");
  });
});
