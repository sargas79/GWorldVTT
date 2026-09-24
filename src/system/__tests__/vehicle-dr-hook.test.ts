import { afterEach, describe, expect, it, vi } from "vitest";

import { shootAtVehicle } from "../hazards.js";
import { COMBAT_HOOKS } from "../combat-extensions.js";

const globals = globalThis as Record<string, unknown>;

afterEach(() => {
  for (const key of ["ChatMessage", "CONST", "foundry", "game", "Hooks", "Roll"]) delete globals[key];
  vi.restoreAllMocks();
});

/** Every die shows `face`: 3d6 totals three times it. */
function stubFoundry(face: number, listener?: (event: string, context: any) => void) {
  globals.Hooks = { callAll: (event: string, context: any) => { listener?.(event, context); return true; } };
  globals.ChatMessage = { implementation: { create: async (d: any) => d, getSpeaker: () => ({}) } };
  globals.CONST = { CHAT_MESSAGE_STYLES: { OTHER: 0 } };
  globals.foundry = { applications: { handlebars: { renderTemplate: async () => "" } } };
  globals.game = { i18n: { localize: (k: string) => k, format: (k: string) => k } };
  globals.Roll = class {
    total = face * 3;
    dice = [{ results: [{ result: face }, { result: face }, { result: face }] }];
    async evaluate() { return this; }
  };
}

/** A powered car on the map, DR 10 at the front and 5 elsewhere. */
function car(extra: Record<string, unknown> = {}) {
  const update = vi.fn(async () => undefined);
  const vehicle = {
    documentName: "Actor",
    isOwner: true,
    name: "Car",
    update,
    system: {
      hp: { value: 30, max: 30 },
      vehicle: {
        stHp: 30, acceleration: 5, sm: 3, locations: "G4W", dr: 10, drOther: 5,
        drTop: null, drUnderbody: null, drByLocation: {}, ...extra,
      },
    },
  };
  return { vehicle, update };
}

/** Where the vehicle's DR is offered to modules before it counts (sargas79/GWorldVTT#602). */
describe("gworld.vehicleDr (since 1.79.0)", () => {
  it("works out what got through the face the shot came in on", async () => {
    stubFoundry(3);
    const front = car();
    await shootAtVehicle({ actor: null, vehicle: front.vehicle, damage: 16, location: "body", arc: "front", occupants: 0, damageType: "cr", tightBeam: false });
    // 16 - 10 = 6 crushing into an Unliving body: 6 injury.
    expect(front.update).toHaveBeenCalledWith({ "system.hp.value": 24 });

    const side = car();
    await shootAtVehicle({ actor: null, vehicle: side.vehicle, damage: 16, location: "body", arc: "side", occupants: 0, damageType: "cr", tightBeam: false });
    expect(side.update).toHaveBeenCalledWith({ "system.hp.value": 19 });
  });

  it("hands a listener the shot and the DR lines, and counts what it changed", async () => {
    let heard: any = null;
    stubFoundry(3, (event, context) => {
      if (event !== COMBAT_HOOKS.vehicleDr) return;
      heard = { ...context, lines: context.lines.map((l: any) => ({ ...l })) };
      // Double the hull against crushing.
      if (context.damageType === "cr") for (const line of context.lines) line.dr *= 2;
    });
    const weapon = { name: "Club" };
    const { vehicle, update } = car();
    await shootAtVehicle({
      actor: null, vehicle, damage: 25, location: "body", arc: "front", occupants: 0,
      damageType: "cr", tightBeam: false, item: weapon, mode: { damage: "5d" },
    });
    expect(heard).toMatchObject({
      vehicle, item: weapon, mode: { damage: "5d" }, location: "body", arc: "front",
      damageType: "cr", basicDamage: 25, armorDivisor: 1, ignoresDr: false,
    });
    expect(heard.lines).toEqual([{ label: "GWORLD.Hazard.VehicleDrSource.face", dr: 10, applies: true, hardened: 0 }]);
    // 25 - 20 = 5.
    expect(update).toHaveBeenCalledWith({ "system.hp.value": 25 });
  });

  it("offers a window at half its face, and a location at its own figure", async () => {
    const seen: number[] = [];
    stubFoundry(3, (event, context) => { if (event === COMBAT_HOOKS.vehicleDr) seen.push(context.lines[0].dr); });
    await shootAtVehicle({ actor: null, vehicle: car().vehicle, damage: 10, location: "largeWindow", arc: "side", occupants: 0, damageType: "pi", tightBeam: false });
    await shootAtVehicle({ actor: null, vehicle: car({ drByLocation: { largeWindow: 1 } }).vehicle, damage: 10, location: "largeWindow", arc: "side", occupants: 0, damageType: "pi", tightBeam: false });
    expect(seen).toEqual([3, 1]);
  });

  it("rolls the location when none is aimed at", async () => {
    // 3d6 all fives is 15: a wheel on a car with four.
    let location = "";
    stubFoundry(5, (event, context) => { if (event === COMBAT_HOOKS.vehicleDr) location = context.location; });
    await shootAtVehicle({ actor: null, vehicle: car().vehicle, damage: 10, occupants: 0, damageType: "pi", tightBeam: false });
    expect(location).toBe("wheel");
  });

  it("reads no DR and fires no hook for damage already through it", async () => {
    const events: string[] = [];
    stubFoundry(3, (event) => events.push(event));
    const { vehicle, update } = car();
    await shootAtVehicle({ actor: null, vehicle, penetrating: 6, location: "body", occupants: 0, damageType: "cr", tightBeam: false });
    expect(events).not.toContain(COMBAT_HOOKS.vehicleDr);
    expect(update).toHaveBeenCalledWith({ "system.hp.value": 24 });
  });

  it("does the vehicle no harm where the hit passes to the person there", async () => {
    stubFoundry(3);
    const { vehicle, update } = car({ locations: "E" });
    await shootAtVehicle({ actor: null, vehicle, damage: 20, location: "exposedRider", arc: "front", occupants: 1, damageType: "pi", tightBeam: false });
    expect(update).not.toHaveBeenCalled();
  });
});

describe("gworld.afterVehicleHit (since 1.115.0)", () => {
  it("says what the shot did once it is done, and shootAtVehicle returns it", async () => {
    const heard: any[] = [];
    stubFoundry(3, (event, context) => { if (event === COMBAT_HOOKS.afterVehicleHit) heard.push(context); });
    const { vehicle } = car();
    const result = await shootAtVehicle({ actor: null, vehicle, damage: 16, location: "body", arc: "front", occupants: 0, damageType: "cr", tightBeam: false });
    expect(result).toMatchObject({ location: "body", arc: "front", damageType: "cr", penetrating: 6, passedThrough: false, occupantHit: null });
    expect(heard).toHaveLength(1);
    expect(heard[0]).toMatchObject({ vehicle, location: "body", penetrating: 6, injury: result!.injury, crippled: false });
  });
});
