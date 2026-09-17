import { describe, expect, it } from "vitest";

import { areaLines, inCircle, segmentCrossesCircle, type ModifierArea } from "../modifier-areas.js";

/** Areas that change rolls made in them or through them (sargas79/GWorldVTT#482). */
describe("modifier areas (since API 1.63.0)", () => {
  it("measures a point and a line against a circle", () => {
    expect(inCircle({ x: 3, y: 4 }, { x: 0, y: 0 }, 5)).toBe(true);
    expect(inCircle({ x: 6, y: 0 }, { x: 0, y: 0 }, 5)).toBe(false);
    expect(segmentCrossesCircle({ x: -10, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 3 }, 5)).toBe(true);
    expect(segmentCrossesCircle({ x: -10, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 8 }, 5)).toBe(false);
  });

  const smoke: ModifierArea = {
    id: "s", label: "Smoke",
    lines: [
      { label: "Vision", value: -5, rolls: ["vision", "attack"], applies: "both" },
      { label: "Inside", value: -1, applies: "inside" },
    ],
  };

  it("gives an inside line to a roller in it, and a through line to a shot across it", () => {
    const args = { areas: [smoke], kind: "attack", tags: [], now: 0 };
    expect(areaLines({ ...args, inside: () => true, through: () => false })).toEqual([
      { label: "Smoke: Vision", value: -5 }, { label: "Smoke: Inside", value: -1 },
    ]);
    expect(areaLines({ ...args, inside: () => false, through: () => true })).toEqual([{ label: "Smoke: Vision", value: -5 }]);
    expect(areaLines({ ...args, kind: "skill", inside: () => false, through: () => true })).toEqual([]);
  });

  it("gives nothing once it has expired", () => {
    expect(areaLines({ areas: [{ ...smoke, expires: 100 }], kind: "attack", tags: [], now: 100, inside: () => true, through: () => true })).toEqual([]);
  });
});
