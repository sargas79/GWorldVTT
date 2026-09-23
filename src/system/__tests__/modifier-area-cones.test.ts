import { describe, expect, it } from "vitest";

import { coneFrom } from "../modifier-areas.js";

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
