import { describe, expect, it } from "vitest";

import {
  afterSuperJump,
  isReadTrait,
  noTraitEffects,
  readTraitNames,
  shockAfterTraits,
  traitEffects,
} from "../trait-effects.js";

const held = (name: string, levels?: number) => (levels === undefined ? { name } : { name, levels });

describe("reading a character's traits", () => {
  it("comes to nothing for a character with none", () => {
    expect(traitEffects([])).toEqual(noTraitEffects());
  });

  it("ignores a trait it has no number for", () => {
    expect(traitEffects([held("Charisma", 3)])).toEqual(noTraitEffects());
  });

  /** "+1 to all active defense rolls ... and +2 to Fright Checks" */
  it("reads Combat Reflexes", () => {
    const effects = traitEffects([held("Combat Reflexes")]);
    expect(effects.activeDefense).toBe(1);
    expect(effects.frightCheck).toBe(2);
  });

  it("reads a trait however it is capitalised or spaced", () => {
    expect(traitEffects([held("  combat REFLEXES ")]).activeDefense).toBe(1);
  });

  /** A renamed trait is the GM's own, and the book's numbers are not assumed. */
  it("does not read a trait somebody renamed", () => {
    expect(traitEffects([held("Combat Reflexes (Feline)")]).activeDefense).toBe(0);
    expect(isReadTrait("Combat Reflexes (Feline)")).toBe(false);
  });

  it("scales a per-level trait by its levels", () => {
    expect(traitEffects([held("Fearlessness", 4)]).frightCheck).toBe(4);
    expect(traitEffects([held("Hard to Kill", 3)]).survival).toBe(3);
    expect(traitEffects([held("Hard to Subdue", 2)]).consciousness).toBe(2);
    expect(traitEffects([held("Damage Resistance", 5)]).damageResistance).toBe(5);
  });

  /** A levelled trait recorded with no levels at all still counts once. */
  it("counts a levelled trait with no levels as one", () => {
    expect(traitEffects([held("Fearlessness")]).frightCheck).toBe(1);
    expect(traitEffects([held("Fearlessness", 0)]).frightCheck).toBe(1);
  });

  it("adds bonuses from several traits together", () => {
    const effects = traitEffects([
      held("Combat Reflexes"),
      held("Fearlessness", 3),
      held("Damage Resistance", 2),
    ]);
    expect(effects.frightCheck).toBe(5);
    expect(effects.damageResistance).toBe(2);
    expect(effects.activeDefense).toBe(1);
  });

  it("subtracts the ones that go the other way", () => {
    expect(traitEffects([held("Fearfulness", 2)]).frightCheck).toBe(-2);
    expect(traitEffects([held("Combat Paralysis")]).frightCheck).toBe(-2);
    // Someone with both is exactly as they should be: nothing.
    expect(traitEffects([held("Combat Reflexes"), held("Combat Paralysis")]).frightCheck).toBe(0);
  });

  it("reads the two that change how badly a wound is felt", () => {
    expect(traitEffects([held("High Pain Threshold")])).toMatchObject({
      noShock: true,
      knockdown: 3,
    });
    expect(traitEffects([held("Low Pain Threshold")])).toMatchObject({
      shockMultiplier: 2,
      knockdown: -4,
    });
  });

  it("reads what changes a body's reach and speed", () => {
    expect(traitEffects([held("Super Jump", 2)]).superJump).toBe(2);
    expect(traitEffects([held("Enhanced Move (Ground)", 2)]).enhancedMove).toBe(4);
    // Air, Space and Water are separate advantages, and none of them helps a
    // jump over a chair.
    expect(traitEffects([held("Enhanced Move (Air)", 2)]).enhancedMove).toBe(1);
    expect(traitEffects([held("Amphibious")]).aquatic).toBe(true);
    expect(traitEffects([held("No Legs (Aquatic)")]).aquatic).toBe(true);
  });

  it("knows who makes no Fright Check at all", () => {
    expect(traitEffects([held("Unfazeable")]).unfazeable).toBe(true);
    expect(traitEffects([held("Fearlessness", 9)]).unfazeable).toBe(false);
  });

  it("names every trait it reads", () => {
    const names = readTraitNames();
    expect(names.length).toBeGreaterThan(10);
    for (const name of names) expect(isReadTrait(name)).toBe(true);
  });
});

describe("shock after the traits that change it", () => {
  const none = noTraitEffects();

  it("leaves an ordinary character's shock alone", () => {
    expect(shockAfterTraits(-3, none)).toBe(-3);
  });

  /** "You never suffer a shock penalty when you are injured." */
  it("removes it entirely for High Pain Threshold", () => {
    expect(shockAfterTraits(-4, traitEffects([{ name: "High Pain Threshold" }]))).toBe(0);
  });

  /** "if you take 2 HP of damage, you are at -4 to DX on your next turn" */
  it("doubles it for Low Pain Threshold", () => {
    const lpt = traitEffects([{ name: "Low Pain Threshold" }]);
    expect(shockAfterTraits(-2, lpt)).toBe(-4);
    // Ordinary shock stops at -4, and doubled shock at -8.
    expect(shockAfterTraits(-4, lpt)).toBe(-8);
  });

  it("has nothing to double when there was no shock", () => {
    expect(shockAfterTraits(0, traitEffects([{ name: "Low Pain Threshold" }]))).toBe(0);
  });

  /** Somebody with both feels nothing: the advantage is the stronger claim. */
  it("prefers feeling nothing to feeling twice as much", () => {
    const both = traitEffects([{ name: "High Pain Threshold" }, { name: "Low Pain Threshold" }]);
    expect(shockAfterTraits(-3, both)).toBe(0);
  });
});

describe("Super Jump", () => {
  it("doubles the distance per level", () => {
    expect(afterSuperJump(9, 0)).toBe(9);
    expect(afterSuperJump(9, 1)).toBe(18);
    expect(afterSuperJump(9, 3)).toBe(72);
  });
});
