import { describe, expect, it } from "vitest";

import {
  canEnchant,
  ceremonialBonus,
  enchantingSkill,
  enchantingTime,
  enchantmentEnergy,
  isEffectEnchantment,
  itemPowerHere,
  itemWorks,
  magicItemEntry,
  maxAssistants,
  powerOnCritical,
  powerReductionHere,
  readEnchantments,
  resolveEnchanting,
} from "../enchanting.js";

describe("the Enchantment spells' costs (Campaigns pp. 480-481)", () => {
  it("prices the six effects by level", () => {
    expect(enchantmentEnergy("Accuracy", 2)).toBe(1000);
    expect(enchantmentEnergy("Deflect", 5)).toBe(20000);
    expect(enchantmentEnergy("Fortify", 1)).toBe(50);
    expect(enchantmentEnergy("Puissance", 3)).toBe(5000);
    expect(enchantmentEnergy("Staff", 1)).toBe(30);
  });

  /** "Double the cost for each additional point." */
  it("keeps doubling Power past the table", () => {
    expect(enchantmentEnergy("Power", 4)).toBe(4000);
    expect(enchantmentEnergy("Power", 5)).toBe(8000);
    expect(enchantmentEnergy("Power", 6)).toBe(16000);
  });

  it("divides Accuracy and Puissance by ten for a missile, and doubles Puissance for a missile weapon", () => {
    expect(enchantmentEnergy("Accuracy", 1, { missile: true })).toBe(25);
    expect(enchantmentEnergy("Puissance", 1, { missile: true })).toBe(25);
    expect(enchantmentEnergy("Puissance", 1, { missileWeapon: true })).toBe(500);
    expect(enchantmentEnergy("Accuracy", 1, { missileWeapon: true })).toBe(250);
  });

  it("prices nothing it does not know", () => {
    expect(enchantmentEnergy("Accuracy", 4)).toBeNull();
    expect(enchantmentEnergy("Fireball", 1)).toBeNull();
    expect(enchantmentEnergy("Accuracy", 0)).toBeNull();
  });

  it("tells an effect from a spell for the user", () => {
    expect(isEffectEnchantment("Fortify")).toBe(true);
    expect(isEffectEnchantment("power")).toBe(true);
    expect(isEffectEnchantment("Fireball")).toBe(false);
  });

  it("reads the Magic Items Table", () => {
    expect(magicItemEntry("Fireball")).toEqual({ energy: 800, alwaysOn: true });
    expect(magicItemEntry("blur")).toMatchObject({ energy: 100, perLevel: true, selfOnly: true });
    expect(magicItemEntry("Itch")).toBeNull();
  });
});

describe("an item where it is (Campaigns p. 481)", () => {
  /** "Apply a temporary -5 to Power in a low-mana area ... No magic item works in a no-mana region!" */
  it("loses five Power in low mana and everything with none", () => {
    expect(itemPowerHere(18, "normal")).toBe(18);
    expect(itemPowerHere(18, "low")).toBe(13);
    expect(itemPowerHere(18, "none")).toBe(0);
    expect(itemWorks(15)).toBe(true);
    expect(itemWorks(14)).toBe(false);
  });

  /** "Halve this bonus in a low-mana area (round down); double it in a high- or very high-mana area." */
  it("scales a Power enchantment's reduction with the mana", () => {
    expect(powerReductionHere(3, "normal")).toBe(3);
    expect(powerReductionHere(3, "low")).toBe(1);
    expect(powerReductionHere(3, "high")).toBe(6);
    expect(powerReductionHere(3, "veryHigh")).toBe(6);
    expect(powerReductionHere(3, "none")).toBe(0);
  });

  it("sums the effects that work here and lists the spells", () => {
    const magic = readEnchantments(
      [
        { spell: "Fortify", level: 2, power: 16, energy: 200, alwaysOn: true, mageOnly: false },
        { spell: "Accuracy", level: 1, power: 15, energy: 250, alwaysOn: true, mageOnly: false },
        { spell: "Power", level: 2, power: 20, energy: 1000, alwaysOn: true, mageOnly: false },
        { spell: "Fireball", level: 0, power: 17, energy: 800, alwaysOn: true, mageOnly: false },
        { spell: "Itch", level: 0, power: 12, energy: 100, alwaysOn: false, mageOnly: true },
      ],
      "normal",
    );
    expect(magic.fortify).toBe(2);
    expect(magic.accuracy).toBe(1);
    expect(magic.powerReduction).toBe(2);
    expect(magic.spells.map((s) => [s.spell, s.works, s.mageOnly])).toEqual([
      ["Fireball", true, false],
      ["Itch", false, true],
    ]);
  });

  it("drops an effect whose Power does not reach here", () => {
    const magic = readEnchantments(
      [{ spell: "Fortify", level: 2, power: 16, energy: 200, alwaysOn: true, mageOnly: false }],
      "low",
    );
    expect(magic.fortify).toBe(0);
  });
});

describe("enchanting (Campaigns p. 481)", () => {
  /** "must know both the Enchant spell and the specific spell ... at level 15+ -- or at level 20+, in a low-mana area." */
  it("needs both spells at 15, or 20 in low mana", () => {
    expect(canEnchant({ enchant: 15, spell: 16, mana: "normal" })).toBe(true);
    expect(canEnchant({ enchant: 14, spell: 16, mana: "normal" })).toBe(false);
    expect(canEnchant({ enchant: 18, spell: 18, mana: "low" })).toBe(false);
    expect(canEnchant({ enchant: 20, spell: 21, mana: "low" })).toBe(true);
    expect(canEnchant({ enchant: null, spell: 16, mana: "normal" })).toBe(false);
  });

  /** "-1 to skill for each assistant ... within 10 yards, the spell is at a further -1." */
  it("rolls against the lower skill less the assistants and the onlookers", () => {
    expect(enchantingSkill({ enchant: 18, spell: 20, assistants: 2, othersNearby: true })).toBe(15);
    expect(enchantingSkill({ enchant: 18, spell: 16, assistants: 0, othersNearby: false })).toBe(16);
  });

  it("allows as many assistants as bring the skill down to 15", () => {
    expect(maxAssistants(18)).toBe(3);
    expect(maxAssistants(15)).toBe(0);
    expect(maxAssistants(12)).toBe(0);
  });

  /** "20%: +1 ... 100%: +4. Add another +1 per additional 100%." */
  it("rewards extra energy as ceremonial magic does", () => {
    expect(ceremonialBonus(100, 100)).toBe(0);
    expect(ceremonialBonus(100, 120)).toBe(1);
    expect(ceremonialBonus(100, 150)).toBe(2);
    expect(ceremonialBonus(100, 170)).toBe(3);
    expect(ceremonialBonus(100, 200)).toBe(4);
    expect(ceremonialBonus(100, 300)).toBe(5);
    expect(ceremonialBonus(0, 50)).toBe(0);
  });

  it("takes an hour per hundred, or a mage-day per point shared among the mages", () => {
    expect(enchantingTime({ method: "quickAndDirty", energy: 250, mages: 1 })).toEqual({ hours: 3 });
    expect(enchantingTime({ method: "quickAndDirty", energy: 30, mages: 3 })).toEqual({ hours: 1 });
    expect(enchantingTime({ method: "slowAndSure", energy: 100, mages: 2 })).toEqual({ days: 50 });
    expect(enchantingTime({ method: "slowAndSure", energy: 100, mages: 1 })).toEqual({ days: 100 });
  });

  /** "a roll of 16 fails automatically and a roll of 17-18 is a critical failure -- even if effective skill is 16+." */
  it("reads 16 as a failure and 17-18 as critical failures whatever the skill", () => {
    expect(resolveEnchanting(16, 20)).toMatchObject({ success: false, criticalFailure: false });
    expect(resolveEnchanting(17, 20)).toMatchObject({ success: false, criticalFailure: true });
    expect(resolveEnchanting(12, 15)).toMatchObject({ success: true, margin: 3 });
    expect(resolveEnchanting(4, 15)).toMatchObject({ success: true, criticalSuccess: true });
  });

  it("raises Power by the two dice of a critical success", () => {
    expect(powerOnCritical(16, 7)).toBe(23);
  });
});
