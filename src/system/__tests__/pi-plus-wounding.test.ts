import { describe, expect, it } from "vitest";

import { resolveDamageAgainst, woundingDifference, type IncomingDamage } from "../damage.js";

/** pi+ after DR, and the card saying why a multiplier is not the type's own (sargas79/GWorldVTT#982). */

const globals = globalThis as Record<string, unknown>;
globals.game = { i18n: { localize: (key: string) => key } };

const target = (items: unknown[] = []) => ({
  name: "Target",
  system: { hp: { value: 20, max: 20 }, fp: { value: 10, max: 10 }, attributes: { ST: 10 } },
  items,
});
const vest = { type: "armor", name: "Vest", system: { equipped: true, dr: 4, locations: ["torso"], coverage: ["torso"] } };
const blow = (options: Partial<IncomingDamage> = {}) =>
  ({ basicDamage: 10, type: "pi+", armorDivisor: 1, hitLocation: "torso", ...options }) as IncomingDamage;

describe("a pi+ blow through DR", () => {
  it("multiplies what gets through by 1.5 (Campaigns p. 379)", () => {
    const result = resolveDamageAgainst(target([vest]), blow());
    expect(result).toMatchObject({ effectiveDr: 4, penetrating: 6, woundingModifier: 1.5, injury: 9 });
  });

  it("is x1 on a limb, which the card puts down to the location (Campaigns p. 399)", () => {
    const result = resolveDamageAgainst(target(), blow({ hitLocation: "arm" }));
    expect(result.woundingModifier).toBe(1);
    expect(woundingDifference("pi+", "arm", result.woundingModifier)).toBe("location");
  });

  it("says nothing where the multiplier is the type's own", () => {
    expect(woundingDifference("pi+", "torso", 1.5)).toBeNull();
    expect(woundingDifference("cr", "arm", 1)).toBeNull();
  });

  it("puts a multiplier the location does not explain down to the target", () => {
    // Unliving: pi+ at x1/2 (Characters p. 60).
    expect(woundingDifference("pi+", "torso", 0.5)).toBe("target");
  });

  it("names the vitals' x3 as the location's", () => {
    expect(woundingDifference("pi+", "vitals", 3)).toBe("location");
  });
});
