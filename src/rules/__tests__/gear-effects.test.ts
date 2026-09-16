import { describe, expect, it } from "vitest";

import { gearEffects, grantedEffectSources, type WornGear } from "../gear-effects.js";
import { addTraitEffects, noTraitEffects, traitEffects } from "../trait-effects.js";

const wearing = (...names: string[]): WornGear[] => names.map((name) => ({ name, equipped: true }));
const carrying = (...names: string[]): WornGear[] => names.map((name) => ({ name, equipped: false }));

/** What the gear comes to, merged as the character's data merges it. */
function effectsOf(gear: readonly WornGear[]) {
  const total = noTraitEffects();
  for (const granted of gearEffects(gear)) addTraitEffects(total, granted.effect);
  return total;
}

describe("what worn gear grants (Characters pp. 285-286)", () => {
  it("seals a vacc suit worn with its helmet", () => {
    // Note [10]: "If worn with its helmet, the suit gives Doesn't Breathe (for
    // 12 hours), Protected Smell, Sealed, and Vacuum Support."
    const suited = effectsOf(wearing("Vacc Suit (TL 9)", "Vacc Suit Helmet (TL 9)"));
    expect(suited.sealed).toBe(true);
    expect(suited.vacuumSupport).toBe(true);
    expect(suited.doesntBreathe).toBe(true);
    expect(suited.protectedSense.tasteSmell).toBe(true);
  });

  it("grants none of it for the suit without its helmet", () => {
    const bare = effectsOf(wearing("Vacc Suit (TL 9)"));
    expect(bare.sealed).toBe(false);
    expect(bare.vacuumSupport).toBe(false);
    expect(bare.doesntBreathe).toBe(false);
  });

  it("grants nothing at all while the suit is only carried", () => {
    const packed = effectsOf(carrying("Vacc Suit (TL 9)", "Vacc Suit Helmet (TL 9)"));
    expect(packed.sealed).toBe(false);
    expect(packed.doesntBreathe).toBe(false);
  });

  it("reads the suit at every tech level the table prints", () => {
    for (const tl of ["9", "10", "11", "12"]) {
      const suit = tl === "9" ? "Vacc Suit (TL 9)" : `Vacc Suit (TL${tl})`;
      const helmet = tl === "9" ? "Vacc Suit Helmet (TL 9)" : `Vacc Suit Helmet (TL${tl})`;
      expect(effectsOf(wearing(suit, helmet)).sealed, tl).toBe(true);
    }
  });

  it("seals an NBC suit only with a mask or a sealed helmet", () => {
    // Note [5]: "Worn with a mask or a helmet with note [7], the combination
    // provides the Sealed advantage."
    expect(effectsOf(wearing("NBC Suit")).sealed).toBe(false);
    expect(effectsOf(wearing("NBC Suit", "Gas Mask")).sealed).toBe(true);
    expect(effectsOf(wearing("NBC Suit", "Space Suit Helmet")).sealed).toBe(true);
  });

  it("does not seal an NBC suit under an ordinary helmet", () => {
    expect(effectsOf(wearing("NBC Suit", "Ballistic Helmet")).sealed).toBe(false);
  });

  it("filters and protects under a gas mask, suit or no suit", () => {
    // Note [7]: "Provides Filter Lungs, Protected Smell, and Protected Vision".
    const masked = effectsOf(wearing("Gas Mask"));
    expect(masked.filterLungs).toBe(true);
    expect(masked.protectedSense.tasteSmell).toBe(true);
    expect(masked.protectedSense.vision).toBe(true);
    // It is not a pressure suit and not an air supply on its own.
    expect(masked.sealed).toBe(false);
    expect(masked.doesntBreathe).toBe(false);
  });

  it("names the piece each effect came from", () => {
    const [granted] = gearEffects(wearing("Vacc Suit (TL10)", "Vacc Suit Helmet (TL10)"));
    const lines = grantedEffectSources(granted!);
    expect(lines.every((line) => line.label === "Vacc Suit (TL10)")).toBe(true);
    expect(lines.map((line) => line.effect).sort()).toEqual([
      "doesntBreathe", "protectedSense.tasteSmell", "sealed", "vacuumSupport",
    ]);
  });
});

describe("the traits worn gear stands in for", () => {
  it("reads each of them off a bought trait", () => {
    const bought = traitEffects([
      { name: "Sealed" },
      { name: "Vacuum Support" },
      { name: "Pressure Support", levels: 2 },
      { name: "Doesn't Breathe" },
      { name: "Filter Lungs" },
      { name: "Telescopic Vision", levels: 3 },
      { name: "Protected Vision" },
    ]);
    expect(bought.sealed).toBe(true);
    expect(bought.vacuumSupport).toBe(true);
    expect(bought.pressureSupport).toBe(2);
    expect(bought.doesntBreathe).toBe(true);
    expect(bought.filterLungs).toBe(true);
    expect(bought.telescopicVision).toBe(3);
    expect(bought.protectedSense.vision).toBe(true);
  });

  it("reads Radiation Tolerance as the divisor its level buys", () => {
    // "The cost of this advantage depends on the divisor" (p. 79): 2, 5, 10 ...
    expect(traitEffects([]).radiationTolerance).toBe(1);
    expect(traitEffects([{ name: "Radiation Tolerance", levels: 1 }]).radiationTolerance).toBe(2);
    expect(traitEffects([{ name: "Radiation Tolerance", levels: 3 }]).radiationTolerance).toBe(10);
  });

  it("takes the better of two Pressure Supports rather than their sum", () => {
    const twice = traitEffects([
      { name: "Pressure Support", levels: 1 },
      { name: "Pressure Support", levels: 3 },
    ]);
    expect(twice.pressureSupport).toBe(3);
  });

  it("says Hyperspectral Vision in its own right as well as what it gives", () => {
    const seen = traitEffects([{ name: "Hyperspectral Vision" }]);
    expect(seen.hyperspectralVision).toBe(true);
    expect(seen.nightVision).toBe(9);
    expect(seen.infravision).toBe(true);
  });
});
