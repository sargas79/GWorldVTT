import { describe, expect, it } from "vitest";

import { becomesUnreadyAfterAttack, strengthToStayReady } from "../readiness.js";

/** "‡ ... becomes unready after you attack with it, unless you have at least 1.5 times the listed ST" */
describe("weapons that need readying", () => {
  it("rounds the strength needed up", () => {
    expect(strengthToStayReady(11)).toBe(17);
    expect(strengthToStayReady(12)).toBe(18);
  });

  it("leaves a great axe unready in ordinary hands", () => {
    expect(becomesUnreadyAfterAttack({ unreadyAfterAttack: true, st: 12, minSt: 12 })).toBe(true);
  });

  it("stays ready for somebody strong enough", () => {
    expect(becomesUnreadyAfterAttack({ unreadyAfterAttack: true, st: 18, minSt: 12 })).toBe(false);
  });

  it("never applies to a weapon not marked for it", () => {
    expect(becomesUnreadyAfterAttack({ unreadyAfterAttack: false, st: 8, minSt: 12 })).toBe(false);
  });

  it("cannot be measured without a listed ST, and so stays ready", () => {
    expect(becomesUnreadyAfterAttack({ unreadyAfterAttack: true, st: 8, minSt: null })).toBe(false);
  });
});
