import { describe, expect, it } from "vitest";

import { facingRadians, facingShown, rotationStep } from "../facing-geometry.js";

describe("facingShown", () => {
  it("follows the combat style unless told otherwise", () => {
    expect(facingShown("tactical", "tactical")).toBe(true);
    expect(facingShown("tactical", "basic")).toBe(false);
    expect(facingShown(undefined, "tactical")).toBe(true);
  });

  it("can be forced on or off", () => {
    expect(facingShown("always", "basic")).toBe(true);
    expect(facingShown("off", "tactical")).toBe(false);
  });
});

describe("facingRadians", () => {
  /** Foundry's rotation 0 faces down the screen; PIXI's zero angle points right. */
  it("points an unturned token down the screen", () => {
    expect(Math.cos(facingRadians(0))).toBeCloseTo(0);
    expect(Math.sin(facingRadians(0))).toBeCloseTo(1);
  });

  it("points a token at 180 up the screen, and one at 90 to the left", () => {
    expect(Math.sin(facingRadians(180))).toBeCloseTo(-1);
    expect(Math.cos(facingRadians(90))).toBeCloseTo(-1);
  });

  it("reads a missing rotation as unturned", () => {
    expect(facingRadians(Number.NaN)).toBe(facingRadians(0));
  });
});

describe("rotationStep", () => {
  it("turns a hex side on a hex map, a diagonal on a square one, a little on none", () => {
    expect(rotationStep({ isHexagonal: true, type: 2 })).toBe(60);
    expect(rotationStep({ isHexagonal: false, type: 1 })).toBe(45);
    expect(rotationStep({ isHexagonal: false, type: 0 })).toBe(15);
    expect(rotationStep(null)).toBe(45);
  });
});
