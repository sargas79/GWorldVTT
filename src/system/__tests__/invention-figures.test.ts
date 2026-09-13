import { describe, expect, it } from "vitest";

import { inventionFigures, inventionGrade, type InventionPlan } from "../invention.js";

/**
 * What an invention comes to before either roll is made (GURPS Basic Set:
 * Campaigns pp. 472-474).
 */
const plan = (over: Partial<InventionPlan> = {}): InventionPlan => ({
  basis: "price",
  retail: 5000,
  complexity: 0,
  grade: "average",
  inventorTl: 8,
  inventionTl: 8,
  workingModel: false,
  knownToExist: false,
  variant: 0,
  newTechnology: false,
  wellDescribed: 0,
  skill: 15,
  assistants: 0,
  poorTools: 0,
  people: 1,
  reusingFacilities: false,
  computer: 0,
  ...over,
});

describe("inventionGrade", () => {
  it("reads the grade off the retail price", () => {
    expect(inventionGrade(plan({ retail: 50 }))).toBe("simple");
    expect(inventionGrade(plan({ retail: 5000 }))).toBe("average");
    expect(inventionGrade(plan({ retail: 2_000_000 }))).toBe("amazing");
  });

  it("reads a program's grade off its Complexity", () => {
    expect(inventionGrade(plan({ basis: "software", complexity: 7 }))).toBe("complex");
  });

  it("eases the grade a step for every TL the inventor is ahead", () => {
    // "Reduce complexity by one step per TL by which the inventor's TL exceeds
    // that of the invention, to a minimum of Simple."
    expect(inventionGrade(plan({ retail: 2_000_000, inventorTl: 9, inventionTl: 7 }))).toBe("average");
  });
});

describe("inventionFigures", () => {
  it("names the skill the grade needs before there is any chance", () => {
    expect(inventionFigures(plan({ retail: 5000 })).requiredSkill).toBe(15);
  });

  it("counts a device a TL ahead of its inventor as ahead of its time", () => {
    const ahead = inventionFigures(plan({ inventorTl: 7, inventionTl: 8 }));
    expect(ahead.aheadOfItsTime).toBe(true);
    // Average is -10, and -5 more for being a TL ahead.
    expect(ahead.concept).toBe(-15);
    // "Triple these costs if the invention is one TL above the inventor's TL."
    expect(ahead.facilities).toBe(300_000);
  });

  it("takes twice the Complexity for a program's Concept roll", () => {
    expect(inventionFigures(plan({ basis: "software", complexity: 4 })).concept).toBe(-8);
  });

  it("gives the Prototype roll the helpers and takes off the workshop", () => {
    const figures = inventionFigures(plan({ assistants: 3, poorTools: 2 }));
    expect(figures.prototype).toBe(figures.concept + 3 - 2);
  });

  it("warns when a program is written for a machine that cannot run it", () => {
    expect(inventionFigures(plan({ basis: "software", complexity: 5, computer: 4 })).runsOnTarget).toBe(false);
    expect(inventionFigures(plan({ basis: "software", complexity: 4, computer: 4 })).runsOnTarget).toBe(true);
    // Hardware, or software with no machine named, asks nothing.
    expect(inventionFigures(plan()).runsOnTarget).toBe(null);
  });
});
