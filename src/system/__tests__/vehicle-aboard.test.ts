import { afterEach, describe, expect, it } from "vitest";

import { createApi } from "../api.js";
import { rangedModifiers } from "../roll.js";
import { vehicleAboard, vehiclesFor } from "../vehicle-aboard.js";

const globals = globalThis as Record<string, unknown>;

afterEach(() => {
  delete globals.game;
});

const hero = { uuid: "Actor.hero", type: "character", name: "Hero" };

const vehicle = (name: string, crew: { uuid: string; operator?: boolean }[], over: Record<string, unknown> = {}) => ({
  type: "vehicle",
  name,
  system: {
    crew: crew.map((seat) => ({ operator: false, strappedIn: false, ...seat })),
    speed: 0,
    tl: "7",
    vehicle: { locomotion: "wheels", stability: 3 },
    ...over,
  },
});

const token = (actor: unknown, actorLink = false) => ({ actorLink, actor });

/** A world with these actors in the sidebar and these tokens on the viewed scene. */
const world = (actors: unknown[], tokens: unknown[] = [], active: unknown = null) => {
  globals.game = {
    actors: { contents: actors },
    scenes: { viewed: { tokens }, active },
    i18n: { localize: (key: string) => key, format: (key: string) => key },
  };
};

/** The vehicle a character is aboard (Campaigns pp. 467-469; sargas79/GWorldVTT#736). */
describe("vehicleAboard", () => {
  it("finds a world vehicle by its crew", () => {
    const car = vehicle("Car", [{ uuid: hero.uuid, operator: true }], { speed: 30 });
    world([car]);
    expect(vehicleAboard(hero)).toMatchObject({ vehicle: car, operator: true, moving: true, medium: "ground" });
  });

  it("finds a vehicle that exists only as an unlinked token", () => {
    const boat = vehicle("Boat", [{ uuid: hero.uuid }], { speed: 5, vehicle: { locomotion: "water" } });
    world([], [token(boat)]);
    expect(vehicleAboard(hero)).toMatchObject({ vehicle: boat, operator: false, moving: true, medium: "water" });
  });

  it("finds one on the active scene or the character's own token's scene too", () => {
    const plane = vehicle("Plane", [{ uuid: hero.uuid }], { vehicle: { locomotion: "air" } });
    world([], [], { tokens: [token(plane)] });
    expect(vehicleAboard(hero)?.vehicle).toBe(plane);

    const cart = vehicle("Cart", [{ uuid: "Scene.s.Token.t.Actor.hero" }]);
    world([]);
    const unlinkedHero = { uuid: "Scene.s.Token.t.Actor.hero", type: "character", token: { parent: { tokens: [token(cart)] } } };
    expect(vehicleAboard(unlinkedHero)?.vehicle).toBe(cart);
  });

  it("prefers the token on the map to the world actor it was copied from", () => {
    const original = vehicle("Car", [{ uuid: hero.uuid }]);
    const copy = vehicle("Car", [{ uuid: hero.uuid }], { speed: 20 });
    world([original], [token(copy)]);
    expect(vehicleAboard(hero)?.vehicle).toBe(copy);
  });

  it("looks at each vehicle once, and skips linked tokens and anything not a vehicle", () => {
    const car = vehicle("Car", []);
    const horse = { type: "character", system: { crew: [{ uuid: hero.uuid }] } };
    world([car], [token(car, true), token(horse), token(null)]);
    expect(vehiclesFor(hero)).toEqual([car]);
    expect(vehicleAboard(hero)).toBeNull();
  });

  it("is null without a world or an actor", () => {
    expect(vehicleAboard(hero)).toBeNull();
    world([vehicle("Car", [{ uuid: hero.uuid }])]);
    expect(vehicleAboard(null)).toBeNull();
  });

  it("is on the API as actors.vehicleAboard (since 1.141.0)", () => {
    const boat = vehicle("Boat", [{ uuid: hero.uuid, operator: true }], { vehicle: { locomotion: "water" } });
    world([], [token(boat)]);
    const api = createApi();
    expect(api.actors.vehicleAboard(hero)).toEqual({ vehicle: boat, operator: true, moving: false, medium: "water" });
    expect(api.actors.vehicleAboard({ uuid: "Actor.other" })).toBeNull();
  });
});

describe("the movingPlatform line (since 1.141.0)", () => {
  const carbine = { accuracy: 4, scopeBonus: 0, bulk: -3 };
  const shot = (over: Record<string, unknown>) => ({
    range: 0, speed: 0, size: 0, modifier: 0, shots: 1, situation: "normal" as const, aimed: false, ...over,
  });

  it("carries the vehicle actor on a vehicle's line, and none on a mount's", () => {
    world([]);
    const car = vehicle("Car", []);
    const aboard = {
      kind: "handheld" as const, operator: false, dodged: false, flying: false, moving: true,
      stabilityRating: 3, stabilized: false, targetingTl: 0, medium: "ground" as const, vehicle: car,
    };
    const line = rangedModifiers(shot({ vehicle: aboard }), carbine).find((m) => m.key === "movingPlatform");
    expect(line).toMatchObject({ platform: "vehicle", vehicle: car });
    const saddle = rangedModifiers(shot({ mount: { moving: true, ride: "smooth" } }), carbine).find((m) => m.key === "movingPlatform");
    expect(saddle?.platform).toBe("mount");
    expect(saddle && "vehicle" in saddle).toBe(false);
  });
});
