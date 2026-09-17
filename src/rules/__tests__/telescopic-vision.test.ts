import { describe, expect, it } from "vitest";

import { telescopicOffset, telescopicScope } from "../senses.js";

/** Characters p. 92. */
describe("Telescopic Vision", () => {
  it("ignores -1 a level of a Vision roll's range penalty, -2 zoomed in, and no more than the penalty", () => {
    expect(telescopicOffset(-7, 2, false)).toBe(2);
    expect(telescopicOffset(-7, 2, true)).toBe(4);
    expect(telescopicOffset(-3, 2, true)).toBe(3);
    expect(telescopicOffset(0, 3, true)).toBe(0);
    expect(telescopicOffset(-5, 0, true)).toBe(0);
  });

  it("works as a scope, not added to one, and not with No Targeting", () => {
    expect(telescopicScope(0, 3, false)).toBe(3);
    expect(telescopicScope(2, 3, false)).toBe(3);
    expect(telescopicScope(4, 3, false)).toBe(4);
    expect(telescopicScope(0, 3, true)).toBe(0);
  });
});
