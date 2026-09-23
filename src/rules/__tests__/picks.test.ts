import { describe, expect, it } from "vitest";

import { freeingResult, getsStuck } from "../picks.js";
import { afflictionDrBonus } from "../affliction-resistance.js";

describe("picks (Campaigns p. 405)", () => {
  it("sticks only after a pick's blow that penetrates DR and does damage", () => {
    expect(getsStuck({ pick: true, penetrating: 3, injury: 6 })).toBe(true);
    expect(getsStuck({ pick: true, penetrating: 0, injury: 0 })).toBe(false);
    // A blow a listener capped at nothing inflicted no damage.
    expect(getsStuck({ pick: true, penetrating: 3, injury: 0 })).toBe(false);
    expect(getsStuck({ pick: false, penetrating: 3, injury: 6 })).toBe(false);
  });

  it("reads the ST roll to free it", () => {
    expect(freeingResult({ success: true })).toBe("freed");
    expect(freeingResult({ success: false })).toBe("stuck");
    expect(freeingResult({ success: false, criticalFailure: true })).toBe("stuckForGood");
  });
});

describe("DR against an affliction (Characters p. 35)", () => {
  it("adds the victim's DR to the resistance roll", () => {
    expect(afflictionDrBonus({ dr: 4 })).toBe(4);
    expect(afflictionDrBonus({ dr: 0 })).toBe(0);
  });

  it("divides it by the attack's armour divisor", () => {
    expect(afflictionDrBonus({ dr: 5, armorDivisor: 2 })).toBe(2);
    expect(afflictionDrBonus({ dr: 3, armorDivisor: 0.5 })).toBe(6);
  });

  it("gives nothing against an attack DR does nothing against", () => {
    expect(afflictionDrBonus({ dr: 6, ignoresDr: true })).toBe(0);
  });
});
