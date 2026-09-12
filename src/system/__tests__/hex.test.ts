import { describe, expect, it } from "vitest";

import {
  GRID,
  angleOfHexDirection,
  attackDirection,
  bearing,
  facingOf,
  hexDirectionFromAngle,
  isHexGrid,
} from "../hex.js";

const POINTY = GRID.hexOddRow;
const FLAT = GRID.hexOddColumn;

describe("isHexGrid", () => {
  it("accepts the four hex layouts and nothing else", () => {
    expect(isHexGrid(GRID.hexOddRow)).toBe(true);
    expect(isHexGrid(GRID.hexEvenColumn)).toBe(true);
    expect(isHexGrid(GRID.square)).toBe(false);
    expect(isHexGrid(GRID.gridless)).toBe(false);
  });
});

describe("bearing", () => {
  /**
   * Canvas y grows downward. Getting that backwards mirrors every facing and
   * puts attacks from in front behind the defender, so it is worth pinning.
   */
  it("measures clockwise from north, with north as negative y", () => {
    const origin = { x: 0, y: 0 };
    expect(bearing(origin, { x: 0, y: -10 })).toBe(0);
    expect(bearing(origin, { x: 10, y: 0 })).toBe(90);
    expect(bearing(origin, { x: 0, y: 10 })).toBe(180);
    expect(bearing(origin, { x: -10, y: 0 })).toBe(270);
  });
});

describe("hexDirectionFromAngle", () => {
  /** A flat-topped grid has a neighbour due north. */
  it("puts direction 0 due north on a column grid", () => {
    expect(hexDirectionFromAngle(0, FLAT)).toBe(0);
    expect(hexDirectionFromAngle(60, FLAT)).toBe(1);
    expect(hexDirectionFromAngle(180, FLAT)).toBe(3);
    expect(hexDirectionFromAngle(300, FLAT)).toBe(5);
  });

  /** A pointy-topped grid has a neighbour due east, and none due north. */
  it("offsets a row grid by thirty degrees", () => {
    expect(hexDirectionFromAngle(30, POINTY)).toBe(0);
    expect(hexDirectionFromAngle(90, POINTY)).toBe(1);
    expect(hexDirectionFromAngle(330, POINTY)).toBe(5);
  });

  it("snaps a bearing between two hex-sides to the nearer", () => {
    expect(hexDirectionFromAngle(50, FLAT)).toBe(1);
    expect(hexDirectionFromAngle(10, FLAT)).toBe(0);
  });

  it("wraps rather than running off the compass", () => {
    expect(hexDirectionFromAngle(360, FLAT)).toBe(0);
    expect(hexDirectionFromAngle(-60, FLAT)).toBe(5);
  });

  it("round-trips with the angle of a direction", () => {
    for (const grid of [POINTY, FLAT]) {
      for (const d of [0, 1, 2, 3, 4, 5] as const) {
        expect(hexDirectionFromAngle(angleOfHexDirection(d, grid), grid)).toBe(d);
      }
    }
  });
});

describe("facingOf", () => {
  const token = (rotation: unknown) => ({ document: { rotation } });

  /** Foundry's rotation 0 faces the bottom of the screen: south, direction 3. */
  it("reads a token's rotation the way Foundry draws it", () => {
    expect(facingOf(token(0), FLAT)).toBe(3);
    expect(facingOf(token(180), FLAT)).toBe(0);
    // Rotation grows clockwise: 60 faces south-west, which on a flat-topped
    // grid is the fifth side round from north.
    expect(facingOf(token(60), FLAT)).toBe(4);
  });

  /** An unturned token faces down the screen, which is a facing, not a gap. */
  it("treats a token that has never been turned as facing south", () => {
    expect(facingOf({ document: {} }, FLAT)).toBe(3);
    expect(facingOf(token("not a number"), FLAT)).toBe(3);
  });
});

describe("attackDirection", () => {
  const at = (x: number, y: number) => ({
    document: { x, y, width: 1, height: 1 },
    scene: { grid: { size: 100 } },
  });

  it("reports the direction the attacker stands in, from the defender", () => {
    // Attacker due north of the defender, on a flat-topped grid.
    expect(attackDirection(at(0, -100), at(0, 0), FLAT)).toBe(0);
    // Attacker due south.
    expect(attackDirection(at(0, 100), at(0, 0), FLAT)).toBe(3);
  });

  /**
   * Two tokens in the same hex have no direction between them, which is close
   * combat rather than an attack from any particular arc.
   */
  it("gives no direction when the two are in the same place", () => {
    expect(attackDirection(at(0, 0), at(0, 0), FLAT)).toBeNull();
  });

  it("measures between centres, not corners", () => {
    // A 2x2 token at the origin is centred at (100,100), so an attacker at
    // (100, -100) is due north of it rather than off to one side.
    const big = { document: { x: 0, y: 0, width: 2, height: 2 }, scene: { grid: { size: 100 } } };
    expect(attackDirection(at(100, -100), big, FLAT)).toBe(0);
  });
});
