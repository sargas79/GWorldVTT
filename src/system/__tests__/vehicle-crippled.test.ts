import { afterEach, describe, expect, it, vi } from "vitest";

import { DATA_HOOKS } from "../data-extensions.js";
import { shootAtVehicle } from "../hazards.js";
import { vehicleStats } from "../vehicle-stats.js";

/** Crippled wheels, tracks and rotors change a vehicle's figures (sargas79/GWorldVTT#735). */

const globals = globalThis as Record<string, unknown>;

afterEach(() => {
  for (const key of ["ChatMessage", "CONST", "foundry", "game", "Hooks", "Roll"]) delete globals[key];
  vi.restoreAllMocks();
});

/** Every die shows `face`; `listener` hears every hook. */
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

/** A four-wheeled car on the map, Move 5/55, with `crippled` parts. */
function car(crippled: Record<string, number> = {}) {
  const update = vi.fn(async () => undefined);
  const vehicle = {
    documentName: "Actor",
    isOwner: true,
    name: "Car",
    update,
    system: {
      hp: { value: 30, max: 30 },
      crippled,
      vehicle: {
        stHp: 30, handling: 1, stability: 3, locomotion: "wheels", acceleration: 5, topSpeed: 55,
        sm: 3, locations: "G4W", dr: 10, drOther: 5, drTop: null, drUnderbody: null, drByLocation: {},
      },
    },
  };
  return { vehicle, update };
}

describe("vehicleStats with crippled parts (since 1.134.0)", () => {
  it("applies a crippled wheel to the Move in use and says why", () => {
    stubFoundry(3);
    const stats = vehicleStats(car({ wheel: 1 }).vehicle);
    expect(stats).toMatchObject({ handling: 1, stability: 3, acceleration: 2.5, topSpeed: 27 });
    expect(stats.move).toMatchObject({ locomotion: "wheels", acceleration: 2.5, topSpeed: 27 });
    expect(stats.lines).toEqual([{ label: "GWORLD.Vehicle.CrippledMove.wheel", stat: "topSpeed", value: -28 }]);
  });

  it("leaves the Move alone with nothing crippled, and a vehicle item has nothing to cripple", () => {
    stubFoundry(3);
    expect(vehicleStats(car().vehicle)).toMatchObject({ acceleration: 5, topSpeed: 55, lines: [] });
    const item = { system: { vehicle: { locomotion: "wheels", acceleration: 5, topSpeed: 55, locations: "G4W" } } };
    expect(vehicleStats(item)).toMatchObject({ acceleration: 5, topSpeed: 55, lines: [] });
  });

  it("hands a listener the crippled figures, the counts and the stored Move, so it can undo them", () => {
    let heard: any = null;
    stubFoundry(3, (event, context) => {
      if (event !== DATA_HOOKS.vehicleStats) return;
      heard = { ...context, lines: [...context.lines] };
      // A run-flat tyre: the wheel keeps going.
      context.acceleration = context.move.acceleration;
      context.topSpeed = context.move.topSpeed;
      context.lines.length = 0;
      context.lines.push({ label: "Run-flat tyre" });
    });
    const { vehicle } = car({ wheel: 1 });
    const stats = vehicleStats(vehicle);
    expect(heard).toMatchObject({
      vehicle, acceleration: 2.5, topSpeed: 27,
      move: { locomotion: "wheels", acceleration: 5, topSpeed: 55 },
      crippled: { wheel: 1, track: 0, runner: 0, rotor: 0, wing: 0, mast: 0 },
    });
    expect(heard.lines).toHaveLength(1);
    expect(stats).toMatchObject({ acceleration: 5, topSpeed: 55, lines: [{ label: "Run-flat tyre" }] });
  });

  it("keeps the crippled figures when a listener throws", () => {
    stubFoundry(3, (event) => { if (event === DATA_HOOKS.vehicleStats) throw new Error("boom"); });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(vehicleStats(car({ wheel: 2 }).vehicle)).toMatchObject({ acceleration: 0, topSpeed: 0, move: { topSpeed: 0 } });
  });
});

describe("shootAtVehicle counts what it cripples (since 1.134.0)", () => {
  it("adds a crippled wheel to the vehicle in the update that takes its hit points", async () => {
    stubFoundry(3);
    const { vehicle, update } = car();
    const hit = await shootAtVehicle({ actor: null, vehicle, damage: 30, location: "wheel", arc: "side", occupants: 0, damageType: "cr", tightBeam: false });
    expect(hit?.crippled).toBe(true);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ "system.crippled.wheel": 1 }));
  });

  it("stops counting at the number of wheels the entry lists", async () => {
    stubFoundry(3);
    const { vehicle, update } = car({ wheel: 4 });
    await shootAtVehicle({ actor: null, vehicle, damage: 30, location: "wheel", arc: "side", occupants: 0, damageType: "cr", tightBeam: false });
    const changes = (update.mock.calls[0] as unknown as [Record<string, number>])[0];
    expect(changes).not.toHaveProperty("system.crippled.wheel");
    expect(changes).toHaveProperty("system.hp.value");
  });

  it("counts nothing for a hit that doesn't cripple", async () => {
    stubFoundry(3);
    const { vehicle, update } = car();
    await shootAtVehicle({ actor: null, vehicle, damage: 7, location: "wheel", arc: "side", occupants: 0, damageType: "cr", tightBeam: false });
    for (const call of update.mock.calls as unknown as Array<[Record<string, number>]>) {
      expect(call[0]).not.toHaveProperty("system.crippled.wheel");
    }
  });
});
