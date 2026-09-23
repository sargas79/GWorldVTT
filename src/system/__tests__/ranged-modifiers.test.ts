import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { rangedModifiers } from "../roll.js";

const globals = globalThis as Record<string, unknown>;

beforeEach(() => {
  // The labels are localized; the arithmetic is what is under test, so the key
  // is echoed back rather than translated.
  globals.game = { i18n: { localize: (key: string) => key, format: (key: string) => key } };
});

afterEach(() => {
  delete globals.game;
});

const bow = { accuracy: 2, scopeBonus: 0, bulk: -6 };
const rifle = { accuracy: 5, scopeBonus: 2, bulk: -5 };

const shot = (over: Partial<Parameters<typeof rangedModifiers>[0]> = {}) => ({
  range: 0,
  speed: 0,
  size: 0,
  modifier: 0,
  shots: 1,
  situation: "normal" as const,
  aimed: false,
  ...over,
});

const valueOf = (mods: ReturnType<typeof rangedModifiers>, key: string) =>
  mods.find((m) => m.label.endsWith(key))?.value;

const total = (mods: ReturnType<typeof rangedModifiers>) =>
  mods.reduce((sum, m) => sum + m.value, 0);

describe("rangedModifiers", () => {
  it("adds nothing for a snap shot at point blank at a man-sized target", () => {
    expect(rangedModifiers(shot(), bow)).toEqual([]);
  });

  /** The Size and Speed/Range Table: 20 yards is -6 (GURPS Lite p. 27). */
  it("takes the speed/range penalty from the distance", () => {
    expect(valueOf(rangedModifiers(shot({ range: 20 }), bow), "SpeedRange")).toBe(-6);
  });

  it("adds the target's speed to the range before reading the table", () => {
    // 15 yards away, moving 5 yards a second, is read as 20.
    expect(valueOf(rangedModifiers(shot({ range: 15, speed: 5 }), bow), "SpeedRange")).toBe(-6);
    expect(valueOf(rangedModifiers(shot({ range: 15 }), bow), "SpeedRange")).toBe(-5);
  });

  it("applies the target's Size Modifier", () => {
    expect(valueOf(rangedModifiers(shot({ size: 4 }), bow), "TargetSize")).toBe(4);
    expect(valueOf(rangedModifiers(shot({ size: -2 }), bow), "TargetSize")).toBe(-2);
  });

  /**
   * Accuracy is what taking the Aim maneuver buys. A shot fired without aiming
   * gets none of it, and adding it anyway would make every ranged attack
   * several points easier than the rules allow.
   */
  it("adds Accuracy only to an aimed shot", () => {
    expect(valueOf(rangedModifiers(shot({ aimed: true }), bow), "Accuracy")).toBe(2);
    expect(valueOf(rangedModifiers(shot(), bow), "Accuracy")).toBeUndefined();
  });

  /**
   * A scope pays out for the seconds actually spent behind it (Campaigns
   * p. 411): "with a variable-power scope, you may Aim for fewer seconds, but
   * this reduces your bonus by a like amount", and scopes are variable-power
   * unless the table says otherwise.
   *
   * So a rifle with Acc 5 and a +2 scope, aimed for the one second a ticked
   * box is worth, comes to 6 rather than 7. This test asserted 7 before the
   * rule was implemented, which was the whole scope for one second of aiming.
   */
  it("counts only as much of a scope as the aiming has paid for", () => {
    expect(valueOf(rangedModifiers(shot({ aimed: true }), rifle), "Accuracy")).toBe(6);
  });

  /** "With a fixed-power scope, you must Aim for at least as many seconds as the scope's bonus." */
  it("gives nothing for a fixed-power scope short of its bonus in seconds of aim (since 1.86.0)", () => {
    const fixed = { ...rifle, scopeFixed: true };
    expect(valueOf(rangedModifiers(shot({ aimed: true }), fixed), "Accuracy")).toBe(5);
    const twoSeconds = { ...fixed, aim: { turns: 2, braced: false } };
    const mods = rangedModifiers(shot({ aimed: true }), twoSeconds);
    expect(mods.find((m) => m.key === "accuracy")).toMatchObject({ value: 7, scope: 2 });
  });

  it("keeps a situational modifier alongside the rest", () => {
    const mods = rangedModifiers(shot({ range: 20, aimed: true, modifier: -2 }), bow);
    expect(total(mods)).toBe(-6 + 2 - 2);
  });

  it("omits a modifier that would be zero, so the card stays readable", () => {
    const mods = rangedModifiers(shot({ range: 2, size: 0, modifier: 0 }), bow);
    expect(mods).toEqual([]);
  });

  it("labels every modifier it returns", () => {
    const mods = rangedModifiers(shot({ range: 50, size: 3, aimed: true, modifier: 1 }), rifle);
    expect(mods).toHaveLength(4);
    for (const mod of mods) expect(mod.label).toBeTruthy();
  });
});

describe("Bulk (pp. 365, 391)", () => {
  it("does not apply to an ordinary shot", () => {
    expect(valueOf(rangedModifiers(shot({ range: 20 }), bow), "Bulk")).toBeUndefined();
  });

  /** "-2 or -Bulk of weapon, whichever is worse" -- a bow at -6 is worse. */
  it("takes the worse of -2 and Bulk on a Move and Attack", () => {
    const mods = rangedModifiers(shot({ situation: "moveAndAttack" }), bow);
    expect(valueOf(mods, "Bulk")).toBe(-6);
    const small = rangedModifiers(shot({ situation: "moveAndAttack" }), {
      accuracy: 1,
      scopeBonus: 0,
      bulk: -1,
    });
    expect(valueOf(small, "Bulk")).toBe(-2);
  });

  /** A Move and Attack loses the benefit of having aimed. */
  it("drops Accuracy on a Move and Attack even when aimed", () => {
    const mods = rangedModifiers(shot({ situation: "moveAndAttack", aimed: true }), bow);
    expect(valueOf(mods, "Accuracy")).toBeUndefined();
  });

  /**
   * In close combat the target is right there: the speed/range penalty is
   * dropped and Bulk stands in its place.
   */
  it("replaces the speed/range penalty with Bulk in close combat", () => {
    const mods = rangedModifiers(shot({ range: 20, situation: "closeCombat" }), bow);
    expect(valueOf(mods, "SpeedRange")).toBeUndefined();
    expect(valueOf(mods, "Bulk")).toBe(-6);
  });

  it("keeps Accuracy in close combat, which only a Move and Attack forfeits", () => {
    const mods = rangedModifiers(shot({ situation: "closeCombat", aimed: true }), bow);
    expect(valueOf(mods, "Accuracy")).toBe(2);
  });
});

describe("opportunity fire (p. 390)", () => {
  const watching = (hexesWatched: number, coveringLine = false) => ({
    ...bow,
    watching: { hexesWatched, coveringLine },
  });

  it("charges for the ground being covered", () => {
    expect(valueOf(rangedModifiers(shot(), watching(1)), "OpportunityFire")).toBe(0);
    expect(valueOf(rangedModifiers(shot(), watching(4)), "OpportunityFire")).toBe(-2);
    expect(valueOf(rangedModifiers(shot(), watching(20)), "OpportunityFire")).toBe(-5);
  });

  it("charges a flat two for a line", () => {
    expect(valueOf(rangedModifiers(shot(), watching(30, true)), "OpportunityFire")).toBe(-2);
  });

  it("does not charge a shooter who is not waiting", () => {
    expect(valueOf(rangedModifiers(shot(), bow), "OpportunityFire")).toBeUndefined();
  });

  /**
   * "You cannot claim any of the bonuses listed for the Aim maneuver.
   * Exception: If you watch a single hex (only), you can Aim and Wait."
   */
  it("lets only a single watched hex keep Accuracy", () => {
    expect(valueOf(rangedModifiers(shot({ aimed: true }), watching(1)), "Accuracy")).toBe(2);
    expect(valueOf(rangedModifiers(shot({ aimed: true }), watching(2)), "Accuracy")).toBeUndefined();
    expect(
      valueOf(rangedModifiers(shot({ aimed: true }), watching(1, true)), "Accuracy"),
    ).toBeUndefined();
  });
});

/** Firing from a vehicle (GURPS Basic Set: Campaigns p. 469). */
describe("from a vehicle", () => {
  const carbine = { accuracy: 4, scopeBonus: 0, bulk: -4 };
  const aboard = (over = {}) => ({
    kind: "handheld" as const,
    operator: false,
    dodged: false,
    flying: false,
    moving: true,
    stabilityRating: 3,
    stabilized: false,
    targetingTl: 0,
    ...over,
  });

  it("costs the driver -2 or the Bulk, whichever is worse, to fire a handheld weapon", () => {
    const light = rangedModifiers(shot({ vehicle: aboard({ operator: true }) }), { ...carbine, bulk: -1 });
    expect(valueOf(light, "Driving")).toBe(-2);
    const heavy = rangedModifiers(shot({ vehicle: aboard({ operator: true }) }), { ...carbine, bulk: -5 });
    expect(valueOf(heavy, "Driving")).toBe(-5);
  });

  it("costs the driver nothing extra for the vehicle's own gun", () => {
    const mods = rangedModifiers(shot({ vehicle: aboard({ operator: true, kind: "mounted" }) }), carbine);
    expect(valueOf(mods, "Driving")).toBeUndefined();
  });

  it("costs a passenger -2 when the vehicle dodged, and -4 in the air", () => {
    expect(valueOf(rangedModifiers(shot({ vehicle: aboard({ dodged: true }) }), carbine), "VehicleDodged")).toBe(-2);
    expect(valueOf(rangedModifiers(shot({ vehicle: aboard({ dodged: true, flying: true }) }), carbine), "VehicleDodged")).toBe(-4);
    // The operator is the one who swerved, and saw it coming.
    expect(valueOf(rangedModifiers(shot({ vehicle: aboard({ dodged: true, operator: true, kind: "mounted" }) }), carbine), "VehicleDodged")).toBeUndefined();
  });

  it("caps everything aiming buys at the SR of a moving vehicle", () => {
    // Acc 4 plus a TL7 targeting system's +3 is 7, capped at SR 3: a cut of 4.
    const mods = rangedModifiers(shot({ aimed: true, vehicle: aboard({ targetingTl: 7 }) }), carbine);
    expect(valueOf(mods, "Accuracy")).toBe(4);
    expect(valueOf(mods, "TargetingSystem")).toBe(3);
    const cap = mods.find((m) => m.label.includes("StabilityCap"));
    expect(cap?.value).toBe(-4);
  });

  it("lifts the cap for stabilized sights, and for a vehicle standing still", () => {
    const stable = rangedModifiers(shot({ aimed: true, vehicle: aboard({ stabilized: true }) }), carbine);
    expect(stable.some((m) => m.label.includes("StabilityCap"))).toBe(false);
    const parked = rangedModifiers(shot({ aimed: true, vehicle: aboard({ moving: false }) }), carbine);
    expect(parked.some((m) => m.label.includes("StabilityCap"))).toBe(false);
  });

  it("adds nothing when the shooter is not aboard anything", () => {
    expect(rangedModifiers(shot({ vehicle: null }), carbine)).toEqual([]);
  });

  /** Attacking from a moving vehicle (Campaigns p. 548; since 1.87.0). */
  it("takes a keyed movingPlatform line by the ride and the mounting", () => {
    const line = (over = {}) => rangedModifiers(shot({ vehicle: aboard(over) }), carbine).find((m) => m.key === "movingPlatform");
    expect(line()).toMatchObject({ value: -1, platform: "vehicle", medium: "ground", ride: "smooth", mounting: "handheld" });
    expect(line({ medium: "ground", ride: "offRoad" })?.value).toBe(-4);
    expect(line({ medium: "water", ride: "rough", kind: "mounted", weaponMount: "openMount" })?.value).toBe(-3);
    expect(line({ medium: "ground", ride: "rough", kind: "mounted" })).toMatchObject({ value: -1, mounting: "fixedMount" });
    expect(line({ medium: "ground", ride: "rough", kind: "mounted", stabilized: true })).toBeUndefined();
    expect(line({ medium: "air", flying: true, kind: "mounted" })).toBeUndefined();
    // A vehicle standing still is not a moving platform.
    expect(line({ moving: false, ride: "offRoad" })).toBeUndefined();
  });
});

/** Attacking from a moving mount (Campaigns pp. 397, 548; since 1.87.0). */
describe("from the saddle", () => {
  const bow = { accuracy: 2, scopeBonus: 2, bulk: -6, aim: { turns: 3, braced: false } };

  it("takes the ground rows for a weapon in the hand, keyed movingPlatform", () => {
    const line = (ride: "smooth" | "rough" | "offRoad") =>
      rangedModifiers(shot({ mount: { moving: true, ride } }), bow).find((m) => m.key === "movingPlatform");
    expect(line("smooth")).toMatchObject({ value: -1, platform: "mount", medium: "ground", mounting: "handheld" });
    expect(line("rough")?.value).toBe(-3);
    expect(line("offRoad")?.value).toBe(-4);
  });

  it("loses the extra turns of Aim and the scope while the mount moves", () => {
    const moving = rangedModifiers(shot({ aimed: true, mount: { moving: true, ride: "smooth" } }), bow);
    expect(moving.find((m) => m.key === "accuracy")?.value).toBe(2);
    expect(moving.find((m) => m.key === "aim")).toBeUndefined();
    const still = rangedModifiers(shot({ aimed: true, mount: { moving: false, ride: "smooth" } }), bow);
    expect(still.find((m) => m.key === "accuracy")?.value).toBe(4);
    expect(still.find((m) => m.key === "aim")?.value).toBe(2);
    expect(still.find((m) => m.key === "movingPlatform")).toBeUndefined();
  });
});

/** A laser sight (GURPS Basic Set: Campaigns p. 411). */
describe("laser sight", () => {
  const pistol = { accuracy: 2, scopeBonus: 0, bulk: -2, halfDamageRange: 150 };

  it("is +1 to hit, aimed or not, while the dot is within the weapon's 1/2D", () => {
    const mods = rangedModifiers(shot({ range: 20, laser: { on: true, targetSees: false } }), pistol);
    expect(valueOf(mods, "LaserSight")).toBe(1);
  });

  it("is nothing past that, where the dot is too spread to see", () => {
    const mods = rangedModifiers(shot({ range: 200, laser: { on: true, targetSees: false } }), pistol);
    expect(valueOf(mods, "LaserSight")).toBeUndefined();
  });

  it("is nothing when switched off", () => {
    const mods = rangedModifiers(shot({ range: 20, laser: { on: false, targetSees: false } }), pistol);
    expect(valueOf(mods, "LaserSight")).toBeUndefined();
  });

  it("is keyed laser, for a module to find (since 1.86.0)", () => {
    const mods = rangedModifiers(shot({ range: 20, laser: { on: true, targetSees: false } }), pistol);
    expect(mods.find((m) => m.key === "laser")).toMatchObject({ value: 1 });
  });
});

/** Darkness short of total (GURPS Basic Set: Campaigns p. 394). */
describe("darkness", () => {
  const pistol = { accuracy: 2, scopeBonus: 0, bulk: -2 };

  it("is keyed darkness and carries the darkness before the eyes (since 1.86.0)", () => {
    const mods = rangedModifiers(shot({ darkness: 5 }), pistol);
    expect(mods.find((m) => m.key === "darkness")).toMatchObject({ value: -5, darkness: 5 });
    const nightVision = rangedModifiers(shot({ darkness: 5 }), { ...pistol, eyes: { nightVision: 3 } });
    expect(nightVision.find((m) => m.key === "darkness")).toMatchObject({ value: -2, darkness: 5 });
  });

  it("is no line at all where there is no darkness", () => {
    expect(rangedModifiers(shot({ darkness: 0 }), pistol).find((m) => m.key === "darkness")).toBeUndefined();
  });
});

/**
 * Guided and homing weapons (GURPS Basic Set: Campaigns p. 412). The missile
 * is a Complexity all its own: it ignores the distance, it may ignore the
 * firer entirely, and it is aimed by the time it arrives without anybody
 * having taken an Aim maneuver.
 */
describe("steered weapons", () => {
  // Acc 5, 1/2D 200 (its speed in yards a second), Max 2000.
  const missile = {
    accuracy: 5,
    scopeBonus: 0,
    bulk: -8,
    halfDamageRange: 200,
    maxRange: 2000,
  };

  it("still takes the speed/range penalty when it is not steered", () => {
    const mods = rangedModifiers(shot({ range: 500 }), { ...missile, guidance: "" });
    expect(valueOf(mods, "SpeedRange")).toBe(-14);
  });

  it("ignores range modifiers once it steers", () => {
    for (const guidance of ["guided", "homing"]) {
      const mods = rangedModifiers(shot({ range: 500 }), { ...missile, guidance });
      expect(valueOf(mods, "SpeedRange")).toBeUndefined();
    }
  });

  it("keeps the target's size, which applies to everything", () => {
    const mods = rangedModifiers(shot({ range: 500, size: -2 }), { ...missile, guidance: "homing" });
    expect(valueOf(mods, "TargetSize")).toBe(-2);
  });

  it("is aimed by a journey of more than a second, with no Aim maneuver", () => {
    // 500 yards at 200 a second is three seconds in the air.
    const mods = rangedModifiers(shot({ range: 500 }), { ...missile, guidance: "guided" });
    expect(valueOf(mods, "Accuracy")).toBe(5);
  });

  it("gets no Accuracy on a shot that arrives the same second unaimed", () => {
    // 100 yards at 200 a second arrives on the turn it was fired.
    const mods = rangedModifiers(shot({ range: 100 }), { ...missile, guidance: "guided" });
    expect(valueOf(mods, "Accuracy")).toBeUndefined();
  });

  it("takes the firer's darkness for a guided weapon but not a homing one", () => {
    const dark = shot({ range: 500, darkness: 5 });
    expect(total(rangedModifiers(dark, { ...missile, guidance: "guided" }))).toBeLessThan(
      total(rangedModifiers(dark, { ...missile, guidance: "homing" })),
    );
    expect(
      rangedModifiers(dark, { ...missile, guidance: "homing" }).some((m) =>
        m.label.includes("Darkness"),
      ),
    ).toBe(false);
  });
});

/** Lines a module can find in any language (sargas79/GWorldVTT#483). */
describe("keyed lines (since API 1.63.0)", () => {
  it("names the speed/range, Bulk and Accuracy lines, with the situation and the scope's share", () => {
    const far = rangedModifiers(shot({ range: 20, aimed: true }), rifle);
    expect(far.find((m) => m.key === "speedRange")?.value).toBe(-6);
    expect(far.find((m) => m.key === "accuracy")).toMatchObject({ value: 6, scope: 1 });
    const close = rangedModifiers(shot({ situation: "closeCombat" }), bow);
    expect(close.find((m) => m.key === "bulk")).toMatchObject({ value: -6, situation: "closeCombat" });
  });
});
