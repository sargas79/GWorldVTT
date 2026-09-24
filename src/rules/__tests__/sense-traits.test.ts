import { describe, expect, it } from "vitest";

import { addTraitEffects, impairedAttacks, noTraitEffects, traitEffects } from "../trait-effects.js";
import { gearEffects, grantedEffectSources } from "../gear-effects.js";
import { hearingDistanceMultiplier, senseScore, senseScores } from "../senses.js";
import { arcDefense, restrictedArc } from "../tactical.js";
import { traitSkillBonuses, traitSkillBonusesFor } from "../talents.js";

describe("the sense and handling traits gear grants or imposes (Characters pp. 71-151)", () => {
  it("reads each of the system's own traits into its field", () => {
    const effects = traitEffects([
      { name: "No Depth Perception" },
      { name: "Colorblindness" },
      { name: "No Sense of Smell/Taste" },
      { name: "Ham-Fisted", levels: 2 },
      { name: "Nictitating Membrane", levels: 3 },
      { name: "Parabolic Hearing", levels: 2 },
    ]);
    expect(effects.noDepthPerception).toBe(true);
    expect(effects.colorblindness).toBe(true);
    expect(effects.noSmellTaste).toBe(true);
    expect(effects.hamFisted).toBe(2);
    expect(effects.nictitatingMembrane).toBe(3);
    expect(effects.parabolicHearing).toBe(2);
  });

  it("reads Restricted Vision's two levels, and either level's own name", () => {
    expect(traitEffects([{ name: "Restricted Vision", levels: 1 }]).restrictedVision).toBe("noPeripheral");
    expect(traitEffects([{ name: "Restricted Vision", levels: 2 }]).restrictedVision).toBe("tunnel");
    expect(traitEffects([{ name: "No Peripheral Vision" }]).restrictedVision).toBe("noPeripheral");
    expect(traitEffects([{ name: "Tunnel Vision" }]).restrictedVision).toBe("tunnel");
    expect(noTraitEffects().restrictedVision).toBeNull();
  });

  it("keeps the worse restriction on the eyes, whichever comes first", () => {
    const tunnel = traitEffects([{ name: "Tunnel Vision" }]);
    addTraitEffects(tunnel, { restrictedVision: "noPeripheral" });
    expect(tunnel.restrictedVision).toBe("tunnel");
    const helm = noTraitEffects();
    addTraitEffects(helm, { restrictedVision: "noPeripheral" });
    addTraitEffects(helm, { restrictedVision: "tunnel" });
    expect(helm.restrictedVision).toBe("tunnel");
  });

  it("adds granted Ham-Fisted to the trait's own, no further than -6", () => {
    const clumsy = traitEffects([{ name: "Ham-Fisted", levels: 1 }]);
    addTraitEffects(clumsy, { hamFisted: 1 });
    expect(clumsy.hamFisted).toBe(2);
    addTraitEffects(clumsy, { hamFisted: 1 });
    expect(clumsy.hamFisted).toBe(2);
  });

  it("gives No Depth Perception One Eye's attack penalties under its own name, once", () => {
    const flat = { ...noTraitEffects(), noDepthPerception: true };
    expect(impairedAttacks(flat, { ranged: true })).toEqual([{ trait: "No Depth Perception", value: -4 }]);
    expect(impairedAttacks(flat, { ranged: true, aimed: true })).toEqual([{ trait: "No Depth Perception", value: -1 }]);
    expect(impairedAttacks(flat, { ranged: false })).toEqual([{ trait: "No Depth Perception", value: -1 }]);
    expect(impairedAttacks({ ...flat, oneEye: true }, { ranged: true })).toEqual([{ trait: "One Eye", value: -4 }]);
  });

  it("takes the Taste/Smell roll away, notes colour and hearing range on the rows", () => {
    const effects = { ...noTraitEffects(), noSmellTaste: true, colorblindness: true, parabolicHearing: 2 };
    const rows = senseScores(12, effects);
    expect(rows.find((r) => r.sense === "tasteSmell")?.score).toBeNull();
    expect(rows.find((r) => r.sense === "vision")).toMatchObject({ score: 12, colorblind: true });
    expect(rows.find((r) => r.sense === "hearing")).toMatchObject({ score: 12, rangeMultiplier: 4 });
    expect(senseScore("hearing", 12, {}).rangeMultiplier).toBeUndefined();
    expect(hearingDistanceMultiplier(0)).toBe(1);
    expect(hearingDistanceMultiplier(3)).toBe(8);
  });

  it("puts Colorblindness and Ham-Fisted on the skills they name", () => {
    const bonuses = traitSkillBonuses([{ name: "Colorblindness" }, { name: "Ham-Fisted", levels: 2 }]);
    expect(traitSkillBonusesFor("Driving (Automobile)", bonuses)).toEqual([{ label: "Colorblindness", value: -1 }]);
    expect(traitSkillBonusesFor("Artist (Painting)", bonuses)).toEqual([
      { label: "Colorblindness", value: -1 },
      { label: "Ham-Fisted", value: -6 },
    ]);
    expect(traitSkillBonusesFor("Fast-Draw (Knife)", bonuses)).toEqual([{ label: "Ham-Fisted", value: -6 }]);
    expect(traitSkillBonusesFor("Broadsword", bonuses)).toEqual([]);
  });
});

describe("armour that blocks peripheral vision", () => {
  it("imposes No Peripheral Vision while worn, naming the piece", () => {
    const granted = gearEffects([{ name: "Greathelm", equipped: true, blocksPeripheralVision: true }]);
    expect(granted).toEqual([{ source: "Greathelm", effect: { restrictedVision: "noPeripheral" } }]);
    expect(grantedEffectSources(granted[0]!)).toEqual([{ effect: "restrictedVision.noPeripheral", label: "Greathelm" }]);
    expect(gearEffects([{ name: "Greathelm", equipped: false, blocksPeripheralVision: true }])).toEqual([]);
  });
});

describe("what Restricted Vision does to the arcs (Characters p. 151)", () => {
  it("leaves the arcs alone for eyes that are not restricted", () => {
    expect(restrictedArc({ arc: "side", side: "left" }, null)).toEqual({ arc: "side", side: "left" });
  });

  it("makes the side hexes back hexes without peripheral vision", () => {
    const seen = restrictedArc({ arc: "side", side: "left" }, "noPeripheral");
    expect(seen).toEqual({ arc: "back", side: null });
    expect(arcDefense({ arc: seen.arc }).helpless).toBe(true);
    expect(restrictedArc({ arc: "front", side: null }, "noPeripheral", 1)).toEqual({ arc: "front", side: null });
  });

  it("leaves Tunnel Vision one front hex, with the two beside it sides", () => {
    expect(restrictedArc({ arc: "front", side: null }, "tunnel", 0)).toEqual({ arc: "front", side: null });
    expect(restrictedArc({ arc: "front", side: null }, "tunnel", 1)).toEqual({ arc: "side", side: "right" });
    expect(restrictedArc({ arc: "front", side: null }, "tunnel", 5)).toEqual({ arc: "side", side: "left" });
    expect(restrictedArc({ arc: "side", side: "right" }, "tunnel", 2)).toEqual({ arc: "back", side: null });
    // Without the direction, a front attack stays in front.
    expect(restrictedArc({ arc: "front", side: null }, "tunnel")).toEqual({ arc: "front", side: null });
    const flank = restrictedArc({ arc: "front", side: null }, "tunnel", 1);
    expect(arcDefense({ arc: flank.arc, side: flank.side }).modifier).toBe(-2);
  });
});

/** Hard of Hearing, Deafness and Blindness imposed rather than owned (Characters pp. 124, 129, 138). */
describe("the sense disadvantages gear or a condition imposes (since API 1.116.0)", () => {
  it("has the Blindness disadvantage used to it, and nobody else", () => {
    expect(traitEffects([{ name: "Blindness" }])).toMatchObject({ blindness: true, accustomedToBlindness: true });
    expect(noTraitEffects()).toMatchObject({ hardOfHearing: false, deafness: false, blindness: false, accustomedToBlindness: false });
  });

  it("reads imposed ones into the sense rows as it reads the owned traits", () => {
    const effects = traitEffects([{ name: "Acute Hearing", levels: 2 }]);
    addTraitEffects(effects, { hardOfHearing: true });
    expect(senseScore("hearing", 12, effects)).toMatchObject({ score: 10, modifier: -2 });
    addTraitEffects(effects, { deafness: true, blindness: true });
    const rows = senseScores(12, effects);
    expect(rows.find((r) => r.sense === "hearing")?.score).toBeNull();
    expect(rows.find((r) => r.sense === "vision")?.score).toBeNull();
    // Imposed blindness is fresh blindness: -10 in combat, not the -6 of the disadvantage.
    expect(effects.accustomedToBlindness).toBe(false);
  });

  it("keeps a character used to blindness used to it when gear blinds them too", () => {
    const effects = traitEffects([{ name: "Blindness" }]);
    addTraitEffects(effects, { blindness: true });
    expect(effects.accustomedToBlindness).toBe(true);
  });
});
