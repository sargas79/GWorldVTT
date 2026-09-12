import { describe, expect, it } from "vitest";

import { noTraitEffects, traitEffects } from "../trait-effects.js";

const held = (name: string, levels?: number) => (levels === undefined ? { name } : { name, levels });

/**
 * The traits that add to a characteristic (GURPS Basic Set: Characters
 * pp. 14-17 price them, and GCA carries them as Extra ST, Extra DX and so on).
 */
describe("traits that add to the attributes", () => {
  it("come to nothing for a character without them", () => {
    expect(traitEffects([]).attributes).toEqual({ ST: 0, DX: 0, IQ: 0, HT: 0 });
    expect(noTraitEffects().strikingSt).toBe(0);
    expect(noTraitEffects().liftingSt).toBe(0);
  });

  it("add each level of Extra ST to ST, and likewise the other three", () => {
    const effects = traitEffects([
      held("Extra ST", 2), held("Extra DX", 1), held("Extra IQ", 3), held("Extra HT", 1),
    ]);
    expect(effects.attributes).toEqual({ ST: 2, DX: 1, IQ: 3, HT: 1 });
  });

  it("count a level for a trait bought without saying how many", () => {
    expect(traitEffects([held("Extra ST")]).attributes.ST).toBe(1);
  });

  /** Striking ST is for damage only; Lifting ST for Basic Lift and encumbrance. */
  it("keep Striking ST and Lifting ST apart from ST itself", () => {
    const effects = traitEffects([held("Striking ST", 3), held("Lifting ST", 2)]);
    expect(effects.attributes.ST).toBe(0);
    expect(effects.strikingSt).toBe(3);
    expect(effects.liftingSt).toBe(2);
  });

  it("add to the secondary characteristics", () => {
    const effects = traitEffects([
      held("Extra Hit Points", 4), held("Extra Fatigue Points", 2), held("Extra Will", 1),
      held("Extra Perception", 2), held("Extra Basic Move", 1), held("Extra Basic Speed", 2),
    ]);
    expect(effects.secondary).toEqual({
      hp: 4, fp: 2, will: 1, per: 2, basicMove: 1, basicSpeed: 0.5,
    });
  });

  it("add up across two of the same", () => {
    expect(traitEffects([held("Extra ST", 1), held("Extra ST", 2)]).attributes.ST).toBe(3);
  });
});
