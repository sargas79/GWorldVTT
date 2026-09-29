import { describe, expect, it } from "vitest";

import {
  ceilingWithSpecialExercises,
  bondFor,
  controllableCovers,
  controllableKind,
  controllableName,
  excessBonds,
  isBonded,
  nextControllableTry,
  noPerks,
  nuisancePerkFor,
  nuisanceWaivedFor,
  perksOf,
  permitCovers,
  specialExercisesFor,
  techniqueSupersededBy,
} from "../addendum-perks.js";
import {
  alternativeLinkConflicts,
  defaultWildcardCategory,
  isLinkModifier,
  talentBenefitBonus,
  talentBenefitOf,
  talentGivesReaction,
  wildcardBonus,
  wildcardCategoriesFor,
  wildcardHalved,
} from "../alternative-abilities.js";
import { legalityUnder } from "../legality.js";

/**
 * What #909 and #911 left undone: the perks that were only pure rules, the
 * item flag for the bonds, the Link check, and the wildcard and Talent bonuses
 * a roll's dialog offers (Basic Set Revised pp. 324-325, 328-329, 333).
 */

const perk = (name: string, specialty = "", levels = 1) => ({ name, specialty, levels });

describe("Permit (p. 329)", () => {
  it("covers the gear its specialty names, and only gear below the Control Rating needs one", () => {
    const perks = perksOf([perk("Permit", "Pistol")]);
    expect(permitCovers(perks, "Pistol, 9mm")).toBe(true);
    expect(permitCovers(perks, "Assault Rifle")).toBe(false);
    expect(permitCovers(noPerks(), "Pistol")).toBe(false);
    // LC3 gear under a CR of 4 is licensed: what a permit is for.
    expect(legalityUnder(3, 4)).toBe("licensed");
  });
});

describe("No Nuisance Rolls (p. 329)", () => {
  const perks = perksOf([perk("No Nuisance Rolls", "Driving to the job")]);

  it("names the task it exempts and needs every score at 16+", () => {
    expect(nuisancePerkFor(perks, ["job", "driving to the job"])).toBe("Driving to the job");
    expect(nuisancePerkFor(perks, ["hiking"])).toBeNull();
    expect(nuisanceWaivedFor(perks, ["Driving to the job"], [16, 17])).toBe(true);
    expect(nuisanceWaivedFor(perks, ["Driving to the job"], [16, 15])).toBe(false);
    expect(nuisanceWaivedFor(perks, ["Driving to the job"], [])).toBe(false);
  });
});

describe("Special Exercises (p. 329)", () => {
  it("raises the maximum of the trait its specialty names, a level a perk", () => {
    const perks = perksOf([perk("Special Exercises", "Lifting ST"), perk("Special Exercises", "Lifting ST"), perk("Special Exercises", "Acute Hearing")]);
    expect(specialExercisesFor(perks, "Lifting ST")).toBe(2);
    expect(specialExercisesFor(perks, "Acute Hearing")).toBe(1);
    expect(specialExercisesFor(perks, "Striking ST")).toBe(0);
    expect(ceilingWithSpecialExercises(4, perks, "Lifting ST")).toBe(6);
    // No maximum is nothing to raise.
    expect(ceilingWithSpecialExercises(null, perks, "Lifting ST")).toBeNull();
  });
});

describe("Controllable Disadvantage (p. 328)", () => {
  it("reads the disadvantage and its kind from the specialty", () => {
    expect(controllableName("Bad Temper (M)")).toBe("Bad Temper");
    expect(controllableKind("Bad Temper (M)")).toBe("mental");
    expect(controllableKind("Lame (physical)")).toBe("physical");
    expect(controllableKind("Bad Temper")).toBeNull();
    expect(controllableCovers(perksOf([perk("Controllable Disadvantage", "Lame (P)")]), "Lame")).toBe(true);
  });

  it("counts the tries of an hour: -1 for each further one, the count starting over after the hour", () => {
    const first = nextControllableTry(null, 1000);
    expect(first.attempt).toBe(1);
    const second = nextControllableTry(first.tries, 1600);
    expect(second.attempt).toBe(2);
    const third = nextControllableTry(second.tries, 2000);
    expect(third.attempt).toBe(3);
    expect(nextControllableTry(third.tries, 1000 + 3600).attempt).toBe(1);
  });
});

describe("Weapon Bond and Equipment Bond by item flag (pp. 328-329)", () => {
  it("counts the perks, named or not, and gives +1 to a flagged item", () => {
    const perks = perksOf([perk("Weapon Bond"), perk("Equipment Bond", "Field Kit")]);
    expect(perks.bondPerks).toBe(2);
    expect(bondFor(perks, { name: "Katana", bonded: true })).toBe(1);
    expect(bondFor(perks, { name: "Field Kit" })).toBe(1);
    expect(bondFor(perks, { name: "Katana" })).toBe(0);
    expect(bondFor(perks, null)).toBe(0);
  });

  it("gives nothing for a flagged item without a perk to cover it", () => {
    expect(isBonded(noPerks(), { name: "Katana", bonded: true })).toBe(false);
  });

  it("says how many flagged items the perks don't cover", () => {
    const perks = perksOf([perk("Weapon Bond")]);
    expect(excessBonds(perks, 1)).toBe(0);
    expect(excessBonds(perks, 3)).toBe(2);
  });
});

describe("Off-Hand Training over the technique (p. 329)", () => {
  it("names the perk that replaces the technique, and no other", () => {
    expect(techniqueSupersededBy("Off-Hand Weapon Training")).toBe("Off-Hand Training");
    expect(techniqueSupersededBy("Feint")).toBeNull();
  });
});

describe("a Link between alternatives (p. 324)", () => {
  const member = (id: string, group: string, linked = false) => ({ id, group, linked });

  it("flags a Link inside a set of two or more", () => {
    expect(alternativeLinkConflicts([member("a", "laser"), member("b", "laser", true), member("c", "")])).toEqual(["b"]);
  });

  it("lets a lone ability, or one outside a set, carry a Link", () => {
    expect(alternativeLinkConflicts([member("a", "laser", true), member("b", "", true)])).toEqual([]);
  });

  it("keeps sets apart", () => {
    expect(alternativeLinkConflicts([member("a", "Laser", true), member("b", "laser ")])).toEqual(["a"]);
    expect(alternativeLinkConflicts([member("a", "one", true), member("b", "two")])).toEqual([]);
  });

  it("knows the Link modifier by name", () => {
    expect(isLinkModifier("Link")).toBe(true);
    expect(isLinkModifier(" link (Burning Attack)")).toBe(true);
    expect(isLinkModifier("Linked list")).toBe(false);
  });
});

describe("alternative benefits for Talents (pp. 324-325)", () => {
  it("keeps the reaction bonus unless another benefit or the flag replaces it", () => {
    expect(talentGivesReaction({})).toBe(true);
    expect(talentGivesReaction({ noReactionBonus: true })).toBe(false);
    expect(talentGivesReaction({ benefit: "influence" })).toBe(false);
    expect(talentGivesReaction({ benefit: "none" })).toBe(false);
    expect(talentGivesReaction({ benefit: "nonsense" })).toBe(true);
  });

  it("offers a Talent's levels as the bonus, and levels-4 for access to a feat", () => {
    expect(talentBenefitBonus({ benefit: "contests", levels: 3 })).toBe(3);
    expect(talentBenefitBonus({ benefit: "feat", levels: 4 })).toBe(0);
    expect(talentBenefitBonus({ benefit: "feat", levels: 1 })).toBe(-3);
    expect(talentBenefitBonus({ benefit: "none", levels: 3 })).toBe(0);
    expect(talentBenefitBonus({ benefit: "", levels: 3 })).toBe(0);
    expect(talentBenefitOf("weird")).toBe("");
  });
});

describe("wildcard bonuses by category (p. 333)", () => {
  it("halves an active defense, Accuracy, and under three dice, rounding up", () => {
    expect(wildcardBonus({ relativeLevel: 5, category: "noSkill" })).toBe(5);
    expect(wildcardBonus({ relativeLevel: 5, category: "resist", activeDefense: true })).toBe(3);
    expect(wildcardBonus({ relativeLevel: 4, category: "accuracy" })).toBe(2);
    expect(wildcardBonus({ relativeLevel: 3, category: "noSkill", dice: 1 })).toBe(2);
    expect(wildcardBonus({ relativeLevel: 3, category: "reaction", halve: true })).toBe(2);
    expect(wildcardBonus({ relativeLevel: 0, category: "noSkill" })).toBe(0);
  });

  it("says whether a roll halves it", () => {
    expect(wildcardHalved({ category: "noSkill" })).toBe(false);
    expect(wildcardHalved({ category: "accuracy" })).toBe(true);
    expect(wildcardHalved({ category: "hazard", activeDefense: true })).toBe(true);
  });

  it("offers each kind of roll only the categories that fit it", () => {
    expect(wildcardCategoriesFor("attack")).toEqual(["accuracy", "penalty"]);
    expect(wildcardCategoriesFor("defense")).toContain("resist");
    expect(wildcardCategoriesFor("defense")).not.toContain("accuracy");
    expect(wildcardCategoriesFor("skill")).not.toContain("damage");
    expect(defaultWildcardCategory("defense")).toBe("resist");
    expect(defaultWildcardCategory("attack")).toBe("accuracy");
    expect(defaultWildcardCategory("skill")).toBe("noSkill");
  });
});
