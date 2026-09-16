import { describe, expect, it } from "vitest";

import { mergeAttackEffects } from "../combat-extensions.js";

/**
 * What a registered attack option can cost the weapon, beyond what it is worth
 * to the roll (since 1.50.0).
 */
describe("mergeAttackEffects: what a setting costs", () => {
  it("adds up the shots two settings each spend", () => {
    const merged = mergeAttackEffects([{ shots: 2 }, { shots: 1 }]);
    expect(merged.shots).toBe(3);
  });

  it("spends nothing where no option asked for it", () => {
    expect(mergeAttackEffects([{ modifiers: [{ label: "Braced", value: 1 }] }]).shots).toBe(0);
  });

  it("ignores a shot count that is not a whole number of rounds", () => {
    expect(mergeAttackEffects([{ shots: -3 }]).shots).toBe(0);
    expect(mergeAttackEffects([{ shots: Number.NaN }]).shots).toBe(0);
    expect(mergeAttackEffects([{ shots: 2.7 }]).shots).toBe(2);
  });

  it("takes the strictest Malf. of the settings chosen", () => {
    // Two settings that each make the weapon likelier to jam do not add: the
    // attack is rolled against the worse of them (Campaigns p. 407).
    expect(mergeAttackEffects([{ malfunction: 16 }, { malfunction: 14 }]).malfunction).toBe(14);
    expect(mergeAttackEffects([{ malfunction: 14 }, { malfunction: 16 }]).malfunction).toBe(14);
  });

  it("names no Malf. at all where no setting set one", () => {
    expect(mergeAttackEffects([{ shots: 1 }]).malfunction).toBeNull();
  });

  it("keeps a Malf. inside the range a 3d roll can reach", () => {
    expect(mergeAttackEffects([{ malfunction: 99 }]).malfunction).toBe(18);
    expect(mergeAttackEffects([{ malfunction: 1 }]).malfunction).toBe(3);
  });

  it("multiplies the rate-of-fire multipliers, so two halvings quarter it", () => {
    expect(mergeAttackEffects([{ rateOfFireMultiplier: 0.5 }]).rateOfFireMultiplier).toBe(0.5);
    expect(mergeAttackEffects([{ rateOfFireMultiplier: 0.5 }, { rateOfFireMultiplier: 0.5 }]).rateOfFireMultiplier).toBe(0.25);
  });

  it("leaves the rate of fire alone where nothing changed it", () => {
    expect(mergeAttackEffects([{ shots: 1 }]).rateOfFireMultiplier).toBe(1);
    // A multiplier of zero would silence the weapon, which is not what any
    // setting means; it is ignored.
    expect(mergeAttackEffects([{ rateOfFireMultiplier: 0 }]).rateOfFireMultiplier).toBe(1);
    expect(mergeAttackEffects([{ rateOfFireMultiplier: -1 }]).rateOfFireMultiplier).toBe(1);
  });

  it("carries them beside everything an effect already had", () => {
    const merged = mergeAttackEffects([
      { modifiers: [{ label: "Overcharge", value: -1 }], notes: ["GWORLD.Test"], shots: 3, malfunction: 15, rateOfFireMultiplier: 0.5 },
    ]);
    expect(merged.modifiers).toEqual([{ label: "Overcharge", value: -1 }]);
    expect(merged.notes).toEqual(["GWORLD.Test"]);
    expect(merged.shots).toBe(3);
    expect(merged.malfunction).toBe(15);
    expect(merged.rateOfFireMultiplier).toBe(0.5);
  });
});
