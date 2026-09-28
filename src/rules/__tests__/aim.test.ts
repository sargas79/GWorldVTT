import { describe, expect, it } from "vitest";

import { BRACED_BONUS, MAX_EXTRA_AIM_TURNS, aimBonus, cappedTargetingBonus } from "../aim.js";

/** Aim (GURPS Basic Set: Campaigns p. 364). */
describe("aimBonus", () => {
  it("is nothing without a turn spent aiming, braced or not", () => {
    expect(aimBonus({ turnsAimed: 0, accuracy: 5 }).total).toBe(0);
    expect(aimBonus({ turnsAimed: 0, accuracy: 5, braced: true }).total).toBe(0);
  });

  it("is the weapon's Accuracy after one turn", () => {
    expect(aimBonus({ turnsAimed: 1, accuracy: 5 })).toEqual({
      accuracy: 5, extraTurns: 0, braced: 0, total: 5,
    });
  });

  it("adds +1 for a second turn and +2 for a third, and no more", () => {
    expect(aimBonus({ turnsAimed: 2, accuracy: 5 }).total).toBe(6);
    expect(aimBonus({ turnsAimed: 3, accuracy: 5 }).total).toBe(7);
    expect(aimBonus({ turnsAimed: 9, accuracy: 5 }).total).toBe(7);
    expect(MAX_EXTRA_AIM_TURNS).toBe(2);
  });

  it("adds one more for a braced weapon", () => {
    expect(BRACED_BONUS).toBe(1);
    expect(aimBonus({ turnsAimed: 1, accuracy: 2, braced: true }).total).toBe(3);
  });

  it("never claims a negative Accuracy", () => {
    expect(aimBonus({ turnsAimed: 2, accuracy: -1 }).total).toBe(1);
  });
});

/** Revised p. 372: "The sum of Acc and all bonuses from targeting systems can never exceed twice the base Acc." */
describe("cappedTargetingBonus", () => {
  it("lets the systems add up to the base Acc and no more", () => {
    expect(cappedTargetingBonus(2, 4)).toBe(2);
    expect(cappedTargetingBonus(2, 2)).toBe(2);
    expect(cappedTargetingBonus(2, 1)).toBe(1);
    expect(cappedTargetingBonus(5, 3)).toBe(3);
  });

  it("gives nothing on a weapon with no Acc, or for a negative bonus", () => {
    expect(cappedTargetingBonus(0, 3)).toBe(0);
    expect(cappedTargetingBonus(3, -1)).toBe(0);
  });
});
