import { describe, expect, it } from "vitest";

import { powerRollTargets, powerTalentCost, powersOf, psiPowerNamed } from "../powers.js";

/**
 * Powers beyond the Basic Set's six (Monster Hunters 1 pp. 40-48): a book's
 * compendium entry says which power a trait belongs to, and the framework of
 * Characters pp. 254-257 does the rest.
 */
describe("a power a book defines", () => {
  it("gathers abilities and a Talent by the power their entries name", () => {
    const powers = powersOf([
      { name: "BIO: Breath-Holding", levels: 2, power: "Bioenhancement" },
      { name: "BIO: Super Jump", levels: 1, power: "Bioenhancement" },
      { name: "Bioenhancement Talent", levels: 3, power: "Bioenhancement", powerTalent: true },
      { name: "Combat Reflexes" },
    ]);
    expect(powers).toHaveLength(1);
    expect(powers[0]).toMatchObject({
      key: "bioenhancement",
      psi: null,
      name: "Bioenhancement",
      talentName: "Bioenhancement Talent",
      abilities: ["BIO: Breath-Holding", "BIO: Super Jump"],
      talent: 3,
      latent: false,
    });
  });

  it("keeps two book powers apart, after the Basic Set's", () => {
    const powers = powersOf([
      { name: "MYS: Smite", power: "Mysticism" },
      { name: "BIO: Eagle Eyes", power: "Bioenhancement" },
      { name: "Mind Reading", modifiers: ["Telepathy"] },
    ]);
    expect(powers.map((p) => p.key)).toEqual(["telepathy", "mysticism", "bioenhancement"]);
  });

  it("is one of the six when it has one of the six's names", () => {
    expect(psiPowerNamed("ESP")).toBe("esp");
    expect(psiPowerNamed("Anti-Psi")).toBe("antipsi");
    expect(psiPowerNamed("Mysticism")).toBe(null);
    // Monster Hunters 1's ESP, named on its entries, meets an ESP ability found
    // the Basic Set's way, by its modifier.
    const powers = powersOf([
      { name: "ESP: Psychometry", power: "ESP" },
      { name: "ESP Talent", levels: 2, power: "ESP", powerTalent: true },
      { name: "Danger Sense", modifiers: ["ESP"] },
    ]);
    expect(powers).toHaveLength(1);
    expect(powers[0]).toMatchObject({
      key: "esp", psi: "esp", abilities: ["ESP: Psychometry", "Danger Sense"], talent: 2,
    });
  });

  it("calls a book's Talent with nothing under it a latent", () => {
    const [power] = powersOf([{ name: "Mysticism Talent", levels: 1, power: "Mysticism", powerTalent: true }]);
    expect(power?.latent).toBe(true);
  });
});

describe("what a power's Talent allows", () => {
  it("needs permission past four levels, unless its entry allows more", () => {
    // Characters p. 255: four without the GM's say-so.
    const [basic] = powersOf([{ name: "Telepathy Talent", levels: 5 }]);
    expect(powerTalentCost(basic!)).toEqual({ points: 25, needsPermission: true });
    // Monster Hunters 1 p. 40: "up to six levels of Talent for each power".
    const [hunter] = powersOf([
      { name: "Mysticism Talent", levels: 5, power: "Mysticism", powerTalent: true, maxLevels: 6 },
    ]);
    expect(powerTalentCost(hunter!)).toEqual({ points: 25, needsPermission: false });
  });

  it("adds its levels to IQ, Will and Perception for a roll to use the power", () => {
    const [power] = powersOf([
      { name: "ESP: Seekersense", power: "ESP" },
      { name: "ESP Talent", levels: 3, power: "ESP", powerTalent: true },
    ]);
    expect(powerRollTargets(power!, { IQ: 12, will: 13, per: 11 })).toEqual({ IQ: 15, Will: 16, Per: 14 });
  });
});

describe("the Basic Set's six, unchanged", () => {
  it("still finds a psi ability by its modifier and a Talent by its name", () => {
    const powers = powersOf([
      { name: "Telekinesis", levels: 5, modifiers: ["PK power modifier"] },
      { name: "PK Talent", levels: 2 },
    ]);
    expect(powers).toEqual([
      expect.objectContaining({ key: "psychokinesis", psi: "psychokinesis", abilities: ["Telekinesis"], talent: 2, talentName: "PK Talent" }),
    ]);
  });
});
