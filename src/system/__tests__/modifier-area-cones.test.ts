import { describe, expect, it } from "vitest";

import { coneFrom, tokensInArea } from "../modifier-areas.js";

/** A module's cone turned into scene pixels (sargas79/GWorldVTT#653). */
describe("coneFrom", () => {
  const apex = { x: 100, y: 100 };

  it("takes a direction in degrees, and a length and end width in yards", () => {
    expect(coneFrom({ direction: -90, length: 10, width: 3 }, apex, 50)).toEqual({ direction: 270, length: 500, width: 150, base: 50 });
  });

  it("aims at a point, reaching it where no length is given, a yard wide per yard without a width", () => {
    const cone = coneFrom({ toward: { x: 100, y: 400 } }, apex, 100)!;
    expect(cone.direction).toBeCloseTo(90);
    expect(cone).toEqual(expect.objectContaining({ length: 300, width: 300, base: 100 }));
    expect(coneFrom({ toward: { x: 400, y: 100 }, length: 5 }, apex, 100)).toEqual({ direction: 0, length: 500, width: 500, base: 100 });
  });

  it("gives nothing without a direction or a length", () => {
    expect(coneFrom({ length: 5 }, apex, 100)).toBeNull();
    expect(coneFrom({ direction: 0 }, apex, 100)).toBeNull();
    expect(coneFrom({ direction: 0, length: 5 }, null, 100)).toBeNull();
  });
});

/** A cone that opens from where a blast is, not from the area's centre (sargas79/GWorldVTT#828; since API 1.154.0). */
describe("coneFrom with its own origin", () => {
  const center = { x: 100, y: 100 };

  it("takes its apex from `origin`, aiming `toward` from there, and keeps the origin", () => {
    const cone = coneFrom({ origin: { x: 500, y: 100 }, toward: { x: 500, y: 400 } }, center, 100)!;
    expect(cone.direction).toBeCloseTo(90);
    expect(cone).toEqual(expect.objectContaining({ length: 300, origin: { x: 500, y: 100 } }));
  });

  it("carries the line from `from` on through the apex where no direction is given", () => {
    // Fired from the west, going off at the origin: the cone opens east from there.
    const cone = coneFrom({ origin: { x: 500, y: 100 }, from: { x: 100, y: 100 }, length: 5 }, center, 100)!;
    expect(cone).toEqual({ direction: 0, length: 500, width: 500, base: 100, origin: { x: 500, y: 100 } });
    // A direction or a point to aim at still comes first.
    expect(coneFrom({ origin: { x: 500, y: 100 }, from: { x: 100, y: 100 }, direction: 180, length: 5 }, center, 100)!.direction).toBe(180);
    // A `from` at the apex itself gives no line.
    expect(coneFrom({ from: center, length: 5 }, center, 100)).toBeNull();
  });

  it("stands the tokens in it from its origin, for areas.standsIn", () => {
    const scene = {
      grid: { size: 100 },
      tokens: [
        { id: "near-attacker", x: 50, y: 50, width: 1, height: 1 },
        { id: "past-blast", x: 650, y: 50, width: 1, height: 1 },
      ],
    };
    const cone = coneFrom({ origin: { x: 500, y: 100 }, from: { x: 100, y: 100 }, length: 5 }, { x: 100, y: 100 }, 100)!;
    const area = { id: "burst", label: "Burst", center: { x: 100, y: 100 }, cone, lines: [] };
    expect(tokensInArea(scene, area).map((t: any) => t.id)).toEqual(["past-blast"]);
  });

  it("needs no centre where it has an origin, and is as before without one", () => {
    expect(coneFrom({ origin: { x: 0, y: 0 }, direction: 0, length: 2 }, null, 100)).toEqual({ direction: 0, length: 200, width: 200, base: 100, origin: { x: 0, y: 0 } });
    expect(coneFrom({ direction: 0, length: 2 }, center, 100)).toEqual({ direction: 0, length: 200, width: 200, base: 100 });
  });
});

/** Who stands in an area while a token is moving into it (sargas79/GWorldVTT#831; since API 1.154.0). */
describe("areas.standsIn during a move", () => {
  it("counts a token where a moveToken listener finds it going, not where it was", () => {
    // Foundry calls moveToken with the new place in the source data only;
    // the prepared position and the drawing still hold the old one.
    const listeners: Array<(doc: any) => void> = [];
    const hooks = { on: (event: string, fn: (doc: any) => void) => { if (event === "moveToken") listeners.push(fn); } };
    const walker: any = {
      id: "walker", x: 0, y: 0, width: 1, height: 1,
      _source: { x: 0, y: 0, width: 1, height: 1 },
      object: { center: { x: 50, y: 50 } },
    };
    const scene = { grid: { size: 100 }, tokens: [walker] };
    const area = { id: "smoke", label: "Smoke", center: { x: 550, y: 50 }, radius: 100, lines: [] };

    const seen: string[][] = [];
    hooks.on("moveToken", () => seen.push(tokensInArea(scene, area).map((t: any) => t.id)));
    expect(tokensInArea(scene, area)).toEqual([]);
    // The move: source first, then the listeners, and only then the rest.
    walker._source = { ...walker._source, x: 500, y: 0 };
    for (const fn of listeners) fn(walker);
    Object.assign(walker, { x: 500, y: 0 });
    walker.object.center = { x: 550, y: 50 };
    expect(seen).toEqual([["walker"]]);
    // Once it has arrived, the drawing is read as before.
    expect(tokensInArea(scene, area).map((t: any) => t.id)).toEqual(["walker"]);
  });
});
