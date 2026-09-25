import { describe, expect, it } from "vitest";

import { coneOf, coneWidthAt, inCone, inShape, segmentCrossesShape, type Cone, type ModifierArea } from "../modifier-areas.js";

/** Cone-shaped areas (Campaigns p. 413; sargas79/GWorldVTT#653). Units here are yards. */
describe("cone areas (since API 1.89.0)", () => {
  // 100 long and 5 wide at the end, pointing east: the book's example.
  const cone: Cone = { direction: 0, length: 100, width: 5, base: 1 };
  const apex = { x: 0, y: 0 };

  it("is a yard wide at the apex and spreads at its end width over its length", () => {
    expect(coneWidthAt(cone, 0)).toBe(1);
    expect(coneWidthAt(cone, 60)).toBe(3);
    expect(coneWidthAt(cone, 100)).toBe(5);
    // With no maximum width given, a yard per yard of range.
    expect(coneWidthAt({ ...cone, width: 100 }, 30)).toBe(30);
  });

  it("holds the points within half its width of its line, out to its length", () => {
    expect(inCone({ x: 60, y: 1.4 }, apex, cone)).toBe(true);
    expect(inCone({ x: 60, y: 1.6 }, apex, cone)).toBe(false);
    expect(inCone({ x: 10, y: 0.4 }, apex, cone)).toBe(true);
    expect(inCone({ x: 10, y: 0.6 }, apex, cone)).toBe(false);
    expect(inCone({ x: -1, y: 0 }, apex, cone)).toBe(false);
    expect(inCone({ x: 101, y: 0 }, apex, cone)).toBe(false);
    // Turned to point south (y down on a scene).
    expect(inCone({ x: 0, y: 50 }, apex, { ...cone, direction: 90 })).toBe(true);
    expect(inCone({ x: 50, y: 0 }, apex, { ...cone, direction: 90 })).toBe(false);
  });

  it("is a shape an area can take, crossed by a line that passes through it", () => {
    const area: ModifierArea = { id: "c", label: "Spray", center: apex, cone, lines: [] };
    expect(coneOf(area)).toEqual({ apex, cone });
    expect(inShape({ x: 80, y: 1 }, area)).toBe(true);
    expect(segmentCrossesShape({ x: 50, y: -20 }, { x: 50, y: 20 }, area)).toBe(true);
    expect(segmentCrossesShape({ x: 50, y: 5 }, { x: 90, y: 20 }, area)).toBe(false);
    // A cone with no usable length is no shape, and a radius beside it is ignored.
    expect(coneOf({ ...area, cone: { ...cone, length: 0 } })).toBeNull();
    expect(inShape({ x: -3, y: 0 }, { ...area, radius: 10 })).toBe(false);
  });

  it("opens from its own origin where it has one, not from the area's centre (since API 1.154.0)", () => {
    // The blast goes off 50 yards out and sprays on east from there.
    const area: ModifierArea = { id: "b", label: "Burst", center: apex, cone: { ...cone, length: 20, origin: { x: 50, y: 0 } }, lines: [] };
    expect(coneOf(area)?.apex).toEqual({ x: 50, y: 0 });
    expect(inShape({ x: 60, y: 0 }, area)).toBe(true);
    expect(inShape({ x: 10, y: 0 }, area)).toBe(false);
    expect(inShape({ x: 75, y: 0 }, area)).toBe(false);
    expect(segmentCrossesShape({ x: 60, y: -20 }, { x: 60, y: 20 }, area)).toBe(true);
    // With no centre at all, the origin is enough.
    expect(coneOf({ ...area, center: null })?.apex).toEqual({ x: 50, y: 0 });
  });
});
