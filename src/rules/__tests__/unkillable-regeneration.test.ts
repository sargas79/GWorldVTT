import { describe, expect, it } from "vitest";

import { applyInjury, healthStatus } from "../injury.js";
import { REGENERATION_RATES, regeneratedHp, regenerationRate } from "../recovery.js";
import { battleFatigueCost } from "../fatigue.js";

/** Unkillable (GURPS Basic Set: Characters p. 95). */
describe("Unkillable", () => {
  it("makes no death checks at all", () => {
    const blow = applyInjury(15, 5, 10, { unkillable: 1 });
    expect(blow.deathCheckRequired).toBe(false);
    expect(applyInjury(15, 5, 10).deathCheckRequired).toBe(true);
  });

  it("is not dead at -5xHP, only destroyed at -10xHP", () => {
    expect(healthStatus(-50, 10, { unkillable: 1 })).toBe("collapsing");
    expect(healthStatus(-50, 10)).toBe("dead");
    expect(healthStatus(-100, 10, { unkillable: 1 })).toBe("destroyed");
  });

  it("still has to stay conscious", () => {
    expect(applyInjury(15, 5, 10, { unkillable: 1 }).consciousnessRollRequired).toBe(true);
  });
});

/** Regeneration (Characters p. 80). */
describe("Regeneration", () => {
  it("names the five rates the book prices", () => {
    expect(REGENERATION_RATES.map((r) => r.key)).toEqual(["slow", "regular", "fast", "veryFast", "extreme"]);
    expect(regenerationRate(2)?.key).toBe("regular");
    expect(regenerationRate(0)).toBeNull();
    expect(regenerationRate(9)?.key).toBe("extreme");
  });

  it("heals a point per interval, whole intervals only", () => {
    expect(regeneratedHp("slow", 12 * 3600)).toBe(1);
    expect(regeneratedHp("slow", 11 * 3600)).toBe(0);
    expect(regeneratedHp("regular", 3 * 3600)).toBe(3);
    expect(regeneratedHp("fast", 90)).toBe(1);
    expect(regeneratedHp("veryFast", 10)).toBe(10);
    expect(regeneratedHp("extreme", 3)).toBe(30);
  });
});

/** Fatigue costs (Campaigns p. 426). */
describe("battle fatigue", () => {
  it("costs a point after a fight of more than ten seconds", () => {
    expect(battleFatigueCost(10)).toBe(0);
    expect(battleFatigueCost(11)).toBe(1);
    expect(battleFatigueCost(60)).toBe(1);
    expect(battleFatigueCost(0)).toBe(0);
  });
});
