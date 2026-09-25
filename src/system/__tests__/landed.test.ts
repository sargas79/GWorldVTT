import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { landedAfterAttack, landedAfterScatter } from "../landed.js";
import { scatterPoint } from "../../rules/scatter.js";

const globals = globalThis as Record<string, unknown>;
let heard: any[] = [];

/** A token placeable as the canvas has it: its centre and its document. */
function token(x: number, y: number, rotation = 0) {
  return { center: { x, y }, document: { id: `t${x}-${y}`, rotation } };
}

beforeEach(() => {
  heard = [];
  globals.Hooks = { callAll: (event: string, context: unknown) => { if (event === "gworld.landed") heard.push(context); } };
  globals.canvas = { scene: { grid: { size: 100, distance: 1, units: "yd" } } };
});

afterEach(() => {
  for (const key of ["Hooks", "game", "canvas"]) delete globals[key];
});

/** Where a thrown or fired attack came down (sargas79/GWorldVTT#830; since API 1.154.0). */
describe("gworld.landed", () => {
  it("lands a hit where its one target stands", () => {
    const target = token(500, 300);
    globals.game = { user: { targets: new Set([target]) } };
    const grenade = { name: "Grenade" };
    const mode = { index: 0, ranged: true };
    landedAfterAttack({ actor: { name: "Thrower" }, item: grenade, mode, thrown: true, hit: true });
    expect(heard).toEqual([{
      actor: { name: "Thrower" }, item: grenade, mode, thrown: true, hit: true,
      target: target.document, point: { x: 500, y: 300 }, scatter: null,
    }]);
  });

  it("leaves a miss's point to the scatter roll, and a shot with no single target without one", () => {
    globals.game = { user: { targets: new Set([token(500, 300)]) } };
    landedAfterAttack({ actor: {}, item: null, mode: null, thrown: false, hit: false });
    globals.game = { user: { targets: new Set([token(1, 1), token(2, 2)]) } };
    landedAfterAttack({ actor: {}, item: null, mode: null, thrown: false, hit: true });
    expect(heard.map((c) => [c.hit, c.target?.id ?? null, c.point])).toEqual([[false, "t500-300", null], [true, null, null]]);
  });

  it("places a scattered miss from the target, round from the way the attacker faces", () => {
    globals.game = { user: { targets: new Set([token(500, 300)]) } };
    // Rotation 0 faces down the screen, so a 1 goes 2 yards further down.
    const actor = { getActiveTokens: () => [token(100, 100, 0)] };
    landedAfterScatter({ actor, scatter: { yards: 2, direction: 1 } });
    expect(heard[0].point.x).toBeCloseTo(500);
    expect(heard[0].point.y).toBeCloseTo(500);
    expect(heard[0]).toMatchObject({ hit: false, thrown: null, item: null, scatter: { yards: 2, direction: 1 } });
    // With no token to face from, it can't be placed.
    landedAfterScatter({ actor: { getActiveTokens: () => [] }, scatter: { yards: 2, direction: 1 } });
    expect(heard[1].point).toBeNull();
  });
});

describe("scatterPoint (p. 414)", () => {
  it("goes the yards rolled, 60 degrees clockwise per step of the die from the facing", () => {
    // Facing right (0 radians); a 2 is 60 degrees clockwise, down and right on a scene.
    const p = scatterPoint({ aimedAt: { x: 0, y: 0 }, facing: 0, direction: 2, yards: 2, pixelsPerYard: 100 });
    expect(p.x).toBeCloseTo(100);
    expect(p.y).toBeCloseTo(173.205, 2);
    // A 4 is straight back; no yards is on target.
    const back = scatterPoint({ aimedAt: { x: 0, y: 0 }, facing: 0, direction: 4, yards: 1, pixelsPerYard: 100 });
    expect(back.x).toBeCloseTo(-100);
    expect(scatterPoint({ aimedAt: { x: 7, y: 9 }, facing: 1, direction: 3, yards: 0, pixelsPerYard: 100 })).toEqual({ x: 7, y: 9 });
  });
});
